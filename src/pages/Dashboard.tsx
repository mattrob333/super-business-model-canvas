import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, AlertTriangle, Clock, Shield, FileText, RefreshCw, Bot, Loader2, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, formatDistanceToNowStrict } from "date-fns";
import { MetricTile } from "@/components/dashboard/MetricTile";
import { StrategicHealthPanel } from "@/components/dashboard/StrategicHealthPanel";
import { useActiveAnalysis } from "@/hooks/useActiveAnalysis";
import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { loadCompanyScope } from "@/lib/company-scope";
import { SkillCatalogPanel } from "@/components/skills/SkillCatalogPanel";
import { useAccountId } from "@/hooks/useAccountId";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

type GapSeverity = Database["public"]["Enums"]["gap_severity"];

interface DashboardRun {
  id: string;
  run_type: string | null;
  status: string;
  summary: string | null;
  created_at: string;
}

interface DashboardReport {
  id: string;
  company_name: string;
  created_at: string | null;
  frameworks: { title: string } | null;
}

interface CompetitorThreat {
  competitorId: string;
  name: string;
  threatIndex: number;
  gapCount: number;
}

interface ThreatMetricRow {
  value: number | string;
  label: string | null;
  inputs: Record<string, unknown> | null;
  computed_at: string;
}

const RUN_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  running: { label: "Running", className: "bg-primary/10 text-primary" },
  completed: { label: "Completed", className: "bg-success/10 text-success" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
  timeout: { label: "Timeout", className: "bg-warning/10 text-warning" },
};

/**
 * Strategic Health Score formula:
 * Start at 100 and subtract a severity-weighted penalty per open gap
 * (open / acknowledged / in_progress): critical -15, high -10, medium -5,
 * low -2, clamped to 0. Returns null (shown as "--") when there is no data
 * to assess (no business context and no gaps).
 */
const SEVERITY_PENALTY: Record<GapSeverity, number> = {
  critical: 15,
  high: 10,
  medium: 5,
  low: 2,
};

function computeHealthScore(
  openGapSeverities: GapSeverity[],
  hasContext: boolean,
): number | null {
  if (!hasContext && openGapSeverities.length === 0) return null;
  const penalty = openGapSeverities.reduce(
    (sum, severity) => sum + (SEVERITY_PENALTY[severity] ?? 0),
    0,
  );
  return Math.max(0, 100 - penalty);
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { activeAnalysis } = useActiveAnalysis();
  const { user } = useAuth();
  const { accountId, loading: accountLoading } = useAccountId();
  const company = activeAnalysis?.data?.company as
    | { name?: string; industry?: string }
    | undefined;

  const [loading, setLoading] = useState(true);
  const [openGapSeverities, setOpenGapSeverities] = useState<GapSeverity[]>([]);
  const [evidenceCount, setEvidenceCount] = useState(0);
  const [contextUpdatedAt, setContextUpdatedAt] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<DashboardRun[]>([]);
  const [activeLoops, setActiveLoops] = useState(0);
  const [pausedLoops, setPausedLoops] = useState(0);
  const [attentionLoops, setAttentionLoops] = useState(0);
  const [recentReports, setRecentReports] = useState<DashboardReport[]>([]);
  const [competitorThreats, setCompetitorThreats] = useState<CompetitorThreat[]>([]);

  const fetchDashboard = useCallback(async () => {
    if (accountLoading) return;

    if (!accountId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Dashboard metrics describe the ACTIVE company, not the account's
      // whole history — a company switch must reset the gap counts.
      const scope = await loadCompanyScope(accountId).catch(() => null);
      let gapsQuery = supabase
        .from("gaps")
        .select("severity")
        .eq("account_id", accountId)
        .in("status", ["open", "acknowledged", "in_progress"]);
      if (scope) gapsQuery = gapsQuery.in("business_context_version_id", scope.contextIds);
      // metric_snapshots carries no company column, so Competitor Watch is
      // scoped through the competitor entities themselves: only companies rows
      // stamped with the active company's context chain may surface threat
      // cards (owner bug 2026-07-08: the Salesforce workspace showed threat
      // cards from previously analyzed companies' competitors).
      const scopedCompetitorsQuery = scope
        ? supabase
            .from("companies")
            .select("id")
            .eq("account_id", accountId)
            .eq("is_competitor", true)
            .in("business_context_version_id", scope.contextIds)
        : Promise.resolve({ data: null, error: null });
      const [gapsRes, evidenceRes, contextRes, runsRes, loopsRes, reportsRes, threatRes, scopedCompetitorsRes] =
        await Promise.all([
          gapsQuery,
          supabase
            .from("evidence_items")
            .select("id", { count: "exact", head: true })
            .eq("account_id", accountId),
          supabase
            .from("business_context_versions")
            .select("created_at")
            .eq("account_id", accountId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("agent_runs")
            .select("id, run_type, status, summary, created_at")
            .eq("account_id", accountId)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("scheduled_loops")
            .select("status")
            .eq("account_id", accountId),
          // Scoped to the ACTIVE company, not the user — a user with several
          // workspaces was seeing another company's reports here (owner live
          // finding RF-LIVE-14).
          user && activeAnalysis?.id
            ? supabase
                .from("generated_reports")
                .select("id, company_name, created_at, frameworks(title)")
                .eq("user_id", user.id)
                .eq("company_id", activeAnalysis.id)
                .order("created_at", { ascending: false })
                .limit(3)
            : Promise.resolve({ data: null, error: null }),
          supabaseUntyped
            .from<ThreatMetricRow>("metric_snapshots")
            .select("value, label, inputs, computed_at")
            .eq("account_id", accountId)
            .eq("metric_key", "competitor.threat_index")
            .order("computed_at", { ascending: false })
            // Window sized so one frequently re-scored competitor cannot evict
            // the others before the latest-per-competitor dedupe below (RF-4-8).
            .limit(100),
          scopedCompetitorsQuery,
        ]);

      // Each section degrades independently — a failed query shows its empty state
      setOpenGapSeverities(
        gapsRes.error
          ? []
          : (gapsRes.data ?? []).map((g) => g.severity as GapSeverity),
      );
      setEvidenceCount(evidenceRes.error ? 0 : evidenceRes.count ?? 0);
      setContextUpdatedAt(
        contextRes.error ? null : contextRes.data?.created_at ?? null,
      );
      setRecentRuns(
        runsRes.error ? [] : ((runsRes.data ?? []) as DashboardRun[]),
      );
      const loops = loopsRes.error ? [] : loopsRes.data ?? [];
      setActiveLoops(loops.filter((l) => l.status === "active").length);
      setPausedLoops(loops.filter((l) => l.status === "paused").length);
      setAttentionLoops(
        loops.filter((l) => l.status !== "active" && l.status !== "paused")
          .length,
      );
      setRecentReports(
        reportsRes.error
          ? []
          : ((reportsRes.data ?? []) as unknown as DashboardReport[]),
      );
      // Null only when scope resolution failed (scoping then degrades open,
      // like the gaps query above); with a scope, a failed/empty entity query
      // yields an empty set and no cross-company card can leak through.
      const scopedCompetitorIds = scope
        ? new Set(
            (scopedCompetitorsRes.error ? [] : scopedCompetitorsRes.data ?? []).map((row) => row.id),
          )
        : null;
      const seenCompetitors = new Set<string>();
      setCompetitorThreats(
        threatRes.error
          ? []
          : (threatRes.data ?? []).flatMap((row) => {
              const inputs = (row.inputs ?? {}) as Record<string, unknown>;
              const competitorId = typeof inputs.competitor_id === "string" ? inputs.competitor_id : "";
              if (!competitorId || seenCompetitors.has(competitorId)) return [];
              if (scopedCompetitorIds && !scopedCompetitorIds.has(competitorId)) return [];
              seenCompetitors.add(competitorId);
              return [{
                competitorId,
                name: row.label ?? "Competitor",
                threatIndex: Number(row.value),
                gapCount: typeof inputs.gap_count === "number" ? inputs.gap_count : 0,
              }];
            }),
      );
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [accountId, accountLoading, user, activeAnalysis?.id]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const healthScore = computeHealthScore(
    openGapSeverities,
    contextUpdatedAt !== null,
  );
  const criticalGaps = openGapSeverities.filter(
    (s) => s === "critical",
  ).length;
  const totalLoops = activeLoops + pausedLoops + attentionLoops;

  return (
    <div className="bg-grid-subtle flex min-h-full flex-col gap-6 p-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {company?.name
            ? `${company.name}'s strategic health at a glance — open gaps, competitor threats, and agent activity, with what needs your attention first.`
            : "Your strategic health at a glance — open gaps, competitor threats, and agent activity, with what needs your attention first."}
        </p>
        {company?.industry && (
          <Badge variant="outline" className="mt-2 text-primary border-primary/30">
            {company.industry}
          </Badge>
        )}
      </div>

      {/* Top row — 4 metric tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricTile
          title="Strategic Health Score"
          value={loading ? "—" : healthScore !== null ? String(healthScore) : "--"}
          subtitle={
            loading
              ? undefined
              : healthScore !== null
                ? healthScore === 100
                  ? "No open competitive gaps"
                  : "Reduced by open gaps, weighted by severity"
                : "Run competitor research to assess"
          }
          icon={Heart}
          hint="Starts at 100 and loses points for every open gap the gap engine finds — critical gaps cost the most. 100 means no known competitive weaknesses; resolve or dismiss gaps in the Gap Register to raise it."
        />
        <MetricTile
          title="Active Gaps"
          value={loading ? "—" : String(openGapSeverities.length)}
          subtitle={
            loading
              ? undefined
              : openGapSeverities.length === 0
                ? "Nothing open — run competitor research to find more"
                : criticalGaps > 0
                  ? `${criticalGaps} critical — review in the Gap Register`
                  : "Review in the Gap Register"
          }
          icon={AlertTriangle}
          hint="Open findings where a competitor covers something your canvas doesn't. Each comes from an evidence-cited comparison of their canvas against yours. Work them in the Gap Register."
        />
        <MetricTile
          title="Context Freshness"
          value={
            loading
              ? "—"
              : contextUpdatedAt
                ? `Updated ${formatDistanceToNowStrict(new Date(contextUpdatedAt), { addSuffix: true })}`
                : "No context"
          }
          subtitle={
            loading
              ? undefined
              : contextUpdatedAt
                ? "Latest business context version"
                : "Awaiting data ingestion"
          }
          icon={Clock}
          hint="When your business context was last updated — by running research, uploading a document on the Knowledge page, or editing the canvas. Stale context means agents reason from old facts."
        />
        <MetricTile
          title="Evidence Coverage"
          value={loading ? "—" : String(evidenceCount)}
          subtitle={
            loading
              ? undefined
              : evidenceCount > 0
                ? `source excerpt${evidenceCount === 1 ? "" : "s"} backing your canvas`
                : "No evidence collected"
          }
          icon={Shield}
          hint="Source excerpts collected from web crawls, documents, and live search. Every verified canvas item cites at least one — more evidence means more of your strategy is backed by something checkable. Counted across your whole workspace, including any previously analyzed companies."
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Competitor Watch
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Threat Index is computed by the gap engine: how many of your nine canvas
            sections a competitor&rsquo;s gaps touch, weighted up if they beat you on pricing.
            Higher means a broader threat.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : competitorThreats.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No competitor threat metrics yet. Run competitor research and the gap engine to populate this strip.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {competitorThreats.map((competitor) => (
                <Link
                  key={competitor.competitorId}
                  to={`/competitors/${competitor.competitorId}/canvas`}
                  className="rounded-lg border border-border/60 bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
                >
                  <p className="truncate text-sm font-medium text-foreground">{competitor.name}</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Threat Index</p>
                      <p className="text-2xl font-semibold tracking-tight">{Math.round(competitor.threatIndex)}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {competitor.gapCount} gaps
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Middle row — 3 equal-height panels */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
        {/* Recent Agent Activity */}
        <Card className="xl:col-span-1 h-full flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              Recent Agent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : recentRuns.length === 0 ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3 py-2">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      No agent activity yet. Agents will run when workspace is configured.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Configure AI providers and playbooks in Settings to begin.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {recentRuns.map((run) => {
                  const statusCfg =
                    RUN_STATUS_CONFIG[run.status] ?? RUN_STATUS_CONFIG.pending;
                  return (
                    <div key={run.id} className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {run.run_type ?? "run"}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs ${statusCfg.className}`}
                          >
                            {statusCfg.label}
                          </Badge>
                        </div>
                        {run.summary && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {run.summary}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(run.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scheduled Loops Status */}
        <Card className="xl:col-span-1 h-full flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              Scheduled Loops
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {activeLoops} Active
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {pausedLoops} Paused
                  </Badge>
                  {attentionLoops > 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs bg-warning/10 text-warning"
                    >
                      {attentionLoops} Needs attention
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {totalLoops === 0
                    ? "No loops configured. Set up scheduled agents in Settings."
                    : `${totalLoops} loop${totalLoops === 1 ? "" : "s"} configured for this workspace.`}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Strategic Health Panel */}
        <StrategicHealthPanel
          className="xl:col-span-1"
          loading={loading}
          score={healthScore}
          openGaps={openGapSeverities.length}
        />
      </div>

      {/* Agent skills — spec 10 catalog (first 5B increment) */}
      <SkillCatalogPanel />

      {/* Bottom row — Recent Reports */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Recent Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : recentReports.length === 0 ? (
            <div className="py-8 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No reports generated.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Run a playbook to create your first report.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentReports.map((report) => (
                <div
                  key={report.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/playbooks/reports/${report.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/playbooks/reports/${report.id}`);
                    }
                  }}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-2.5 transition-colors hover:border-primary/35 hover:bg-muted/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {report.frameworks?.title ?? "Report"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {report.company_name}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {report.created_at
                      ? formatDistanceToNow(new Date(report.created_at), {
                          addSuffix: true,
                        })
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
