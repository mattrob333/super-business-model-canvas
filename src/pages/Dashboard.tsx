import { useState, useEffect, useCallback } from "react";
import { Heart, AlertTriangle, Clock, Shield, FileText, RefreshCw, Bot, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, formatDistanceToNowStrict } from "date-fns";
import { MetricTile } from "@/components/dashboard/MetricTile";
import { StrategicHealthPanel } from "@/components/dashboard/StrategicHealthPanel";
import { useActiveAnalysis } from "@/hooks/useActiveAnalysis";
import { supabase } from "@/integrations/supabase/client";
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

  const fetchDashboard = useCallback(async () => {
    if (accountLoading) return;

    if (!accountId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [gapsRes, evidenceRes, contextRes, runsRes, loopsRes, reportsRes] =
        await Promise.all([
          supabase
            .from("gaps")
            .select("severity")
            .eq("account_id", accountId)
            .in("status", ["open", "acknowledged", "in_progress"]),
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
          user
            ? supabase
                .from("generated_reports")
                .select("id, company_name, created_at, frameworks(title)")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(3)
            : Promise.resolve({ data: null, error: null }),
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
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [accountId, accountLoading, user]);

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
            ? `Strategy overview for ${company.name}`
            : "Enterprise strategy operating overview"}
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
                ? "Based on open gap severity"
                : "Not yet assessed"
          }
          icon={Heart}
        />
        <MetricTile
          title="Active Gaps"
          value={loading ? "—" : String(openGapSeverities.length)}
          subtitle={
            !loading && criticalGaps > 0
              ? `${criticalGaps} critical`
              : undefined
          }
          icon={AlertTriangle}
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
        />
        <MetricTile
          title="Evidence Coverage"
          value={loading ? "—" : String(evidenceCount)}
          subtitle={
            loading
              ? undefined
              : evidenceCount > 0
                ? `evidence item${evidenceCount === 1 ? "" : "s"} collected`
                : "No evidence collected"
          }
          icon={Shield}
        />
      </div>

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
                  className="flex items-center justify-between gap-3 rounded-lg border p-2.5"
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
