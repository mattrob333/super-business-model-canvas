import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Bot,
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  FileText,
  Cpu,
  Coins,
  DollarSign,
  Activity as ActivityIcon,
  Layers,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccountId } from "@/hooks/useAccountId";
import { AgentRunDetailDialog } from "@/components/AgentRunDetailDialog";
import { AgentInstructionsDialog } from "@/components/AgentInstructionsDialog";
import { CANVAS_SECTION_LABELS } from "@/components/canvas/section-types";
import type { Database } from "@/integrations/supabase/types";

/**
 * Agent Profile Detail page (/agents/:agentId)
 *
 * Shows a single agent's full profile: assigned sections, model route,
 * recent runs, and system instructions. Accessed by clicking an agent card
 * on the Agents page.
 *
 * Data source: `agent_profiles` + `agent_runs` + `scheduled_loops` tables.
 */

type AgentProfile = Database["public"]["Tables"]["agent_profiles"]["Row"];
type AgentRun = Database["public"]["Tables"]["agent_runs"]["Row"];
type ScheduledLoop = Database["public"]["Tables"]["scheduled_loops"]["Row"];

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof Bot }> = {
  active: { label: "Active", className: "bg-success/10 text-success", icon: CheckCircle2 },
  paused: { label: "Paused", className: "bg-warning/10 text-warning", icon: Clock },
  draft: { label: "Draft", className: "bg-muted text-muted-foreground", icon: AlertCircle },
  archived: { label: "Archived", className: "bg-muted/50 text-muted-foreground", icon: AlertCircle },
};

const RUN_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  running: { label: "Running", className: "bg-primary/10 text-primary" },
  completed: { label: "Completed", className: "bg-success/10 text-success" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
  timeout: { label: "Timeout", className: "bg-warning/10 text-warning" },
};

function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "—";
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const diffMs = endMs - startMs;
  if (diffMs < 0) return "—";
  if (diffMs < 1000) return `${diffMs}ms`;
  if (diffMs < 60000) return `${(diffMs / 1000).toFixed(1)}s`;
  return `${(diffMs / 60000).toFixed(1)}m`;
}

function getSectionLabel(sectionKey: string): string {
  return CANVAS_SECTION_LABELS[sectionKey as keyof typeof CANVAS_SECTION_LABELS] ?? sectionKey;
}

export default function AgentDetail() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { accountId, loading: accountLoading } = useAccountId();
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [recentRuns, setRecentRuns] = useState<AgentRun[]>([]);
  const [loops, setLoops] = useState<ScheduledLoop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (accountLoading || !agentId) return;

    const effectiveAccountId = accountId ?? "00000000-0000-0000-0000-000000000000";
    setLoading(true);
    setError(null);

    try {
      const [agentRes, runsRes, loopsRes] = await Promise.all([
        supabase
          .from("agent_profiles")
          .select("*")
          .eq("id", agentId)
          .maybeSingle(),
        supabase
          .from("agent_runs")
          .select("id, run_type, trigger_type, status, summary, started_at, completed_at, model_provider, model_name, tokens_in, tokens_out, estimated_cost")
          .eq("agent_profile_id", agentId)
          .eq("account_id", effectiveAccountId)
          .order("started_at", { ascending: false })
          .limit(20),
        supabase
          .from("scheduled_loops")
          .select("id, loop_name, schedule, status, last_run_at, next_run_at, failure_count, max_consecutive_failures")
          .eq("agent_profile_id", agentId)
          .eq("account_id", effectiveAccountId)
          .order("next_run_at", { ascending: true })
          .limit(10),
      ]);

      if (agentRes.error) throw agentRes.error;
      setAgent(agentRes.data as unknown as AgentProfile);
      setRecentRuns(runsRes.error ? [] : ((runsRes.data ?? []) as unknown as AgentRun[]));
      setLoops(loopsRes.error ? [] : ((loopsRes.data ?? []) as unknown as ScheduledLoop[]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent");
      setAgent(null);
      setRecentRuns([]);
      setLoops([]);
    } finally {
      setLoading(false);
    }
  }, [agentId, accountId, accountLoading]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit gap-2"
          onClick={() => navigate("/agents")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Agents
        </Button>
        <Card>
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive/40 mx-auto mb-3" />
            <p className="text-sm text-destructive">{error ?? "Agent not found"}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void fetchData()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.active;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back link + header */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => navigate("/agents")}
        >
          <ArrowLeft className="h-4 w-4" />
          Agents
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {agent.display_name}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                {agent.agent_type}
              </Badge>
              <Badge variant="outline" className={`text-xs ${statusCfg.className}`}>
                <statusCfg.icon className="h-2.5 w-2.5 mr-1" />
                {statusCfg.label}
              </Badge>
              {agent.model_route_key && (
                <Badge variant="outline" className="text-xs">
                  Model: {agent.model_route_key}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Refresh"
            onClick={() => void fetchData()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setInstructionsOpen(true)}
          >
            <FileText className="h-4 w-4" />
            Instructions
          </Button>
        </div>
      </div>

      {/* Description */}
      {agent.description && (
        <p className="text-sm text-muted-foreground">{agent.description}</p>
      )}

      {/* Summary cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Assigned sections */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              Assigned Sections
            </CardTitle>
          </CardHeader>
          <CardContent>
            {agent.assigned_sections && agent.assigned_sections.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {agent.assigned_sections.map((section) => (
                  <Badge key={section} variant="outline" className="text-xs w-fit">
                    {getSectionLabel(section)}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No sections assigned</p>
            )}
          </CardContent>
        </Card>

        {/* Model route */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5" />
              Model Route
            </CardTitle>
          </CardHeader>
          <CardContent>
            {agent.model_route_key ? (
              <Badge variant="secondary" className="text-xs capitalize">
                {agent.model_route_key}
              </Badge>
            ) : (
              <p className="text-xs text-muted-foreground">Default routing</p>
            )}
          </CardContent>
        </Card>

        {/* Total runs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <ActivityIcon className="h-3.5 w-3.5" />
              Recent Runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{recentRuns.length}</p>
            <p className="text-xs text-muted-foreground">last 20</p>
          </CardContent>
        </Card>

        {/* Scheduled loops */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Scheduled Loops
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{loops.length}</p>
            <p className="text-xs text-muted-foreground">active schedules</p>
          </CardContent>
        </Card>
      </div>

      {/* Scheduled loops */}
      {loops.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Scheduled Loops
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {loops.map((loop) => (
                <div
                  key={loop.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {loop.loop_name}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          loop.status === "active"
                            ? "bg-success/10 text-success"
                            : loop.status === "paused"
                            ? "bg-warning/10 text-warning"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {loop.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground font-mono">
                        {loop.schedule}
                      </span>
                      {loop.next_run_at && (
                        <span className="text-xs text-muted-foreground">
                          Next: {formatTimestamp(loop.next_run_at)}
                        </span>
                      )}
                      {loop.failure_count > 0 && (
                        <span className="text-xs text-destructive">
                          Failures: {loop.failure_count}
                          {loop.max_consecutive_failures
                            ? ` / ${loop.max_consecutive_failures}`
                            : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    Last: {formatTimestamp(loop.last_run_at)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent runs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ActivityIcon className="h-4 w-4 text-muted-foreground" />
            Recent Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentRuns.length === 0 ? (
            <div className="py-8 text-center">
              <Bot className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No runs yet. This agent hasn't executed any analysis tasks.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentRuns.map((run) => {
                const runStatusCfg =
                  RUN_STATUS_CONFIG[run.status] ?? RUN_STATUS_CONFIG.pending;
                return (
                  <div
                    key={run.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => {
                      setDetailRunId(run.id);
                      setDetailOpen(true);
                    }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {run.run_type ?? "—"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-xs ${runStatusCfg.className}`}
                        >
                          {runStatusCfg.label}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {run.trigger_type}
                        </Badge>
                      </div>
                      {run.summary && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {run.summary}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {run.model_provider && (
                          <span className="text-xs text-muted-foreground">
                            {run.model_provider}
                            {run.model_name ? ` / ${run.model_name}` : ""}
                          </span>
                        )}
                        {run.tokens_in !== null && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Coins className="h-3 w-3" />
                            {run.tokens_in?.toLocaleString() ?? "—"}
                          </span>
                        )}
                        {run.estimated_cost !== null && run.estimated_cost > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <DollarSign className="h-3 w-3" />
                            {`$${run.estimated_cost.toFixed(4)}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(run.started_at)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDuration(run.started_at, run.completed_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* System instructions summary */}
      {agent.system_instructions_summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Instructions Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {agent.system_instructions_summary}
            </p>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Agent metadata */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Agent Key:</span>
          <code className="text-xs">{agent.agent_key}</code>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Agent ID:</span>
          <code className="text-xs">{agent.id}</code>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Created:</span>
          <span>{formatTimestamp(agent.created_at)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Updated:</span>
          <span>{formatTimestamp(agent.updated_at)}</span>
        </div>
      </div>

      <AgentRunDetailDialog
        runId={detailRunId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      <AgentInstructionsDialog
        agent={agent}
        open={instructionsOpen}
        onOpenChange={setInstructionsOpen}
        onSaved={() => void fetchData()}
      />
    </div>
  );
}
