import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, Plus, Clock, CheckCircle2, AlertCircle, Loader2, RefreshCw, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccountId } from "@/hooks/useAccountId";
import { AgentRunDetailDialog } from "@/components/AgentRunDetailDialog";
import { AgentInstructionsDialog } from "@/components/AgentInstructionsDialog";
import type { Database } from "@/integrations/supabase/types";

/**
 * Agents page (/agents)
 *
 * Shows the agent registry — the 10 default agent profiles (orchestrator + 9
 * BMC section agents) plus any custom agents. Also shows recent agent runs.
 *
 * Data source: `agent_profiles` + `agent_runs` tables (Phase 2 schema).
 * Falls back to static defaults if no data is in the database yet.
 */

type AgentProfile = Database["public"]["Tables"]["agent_profiles"]["Row"];
type AgentRun = Database["public"]["Tables"]["agent_runs"]["Row"];

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

export default function Agents() {
  const { accountId, loading: accountLoading } = useAccountId();
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [recentRuns, setRecentRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [instructionsAgent, setInstructionsAgent] = useState<AgentProfile | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (accountLoading) return;

    const effectiveAccountId = accountId ?? "00000000-0000-0000-0000-000000000000";
    setLoading(true);
    setError(null);

    try {
      const [agentsRes, runsRes] = await Promise.all([
        supabase
          .from("agent_profiles")
          .select("*")
          .eq("account_id", effectiveAccountId)
          .order("agent_type", { ascending: true })
          .order("display_name", { ascending: true }),
        supabase
          .from("agent_runs")
          .select("id, agent_profile_id, run_type, status, started_at, completed_at, summary, trigger_type")
          .eq("account_id", effectiveAccountId)
          .order("started_at", { ascending: false })
          .limit(10),
      ]);

      if (agentsRes.error) throw agentsRes.error;
      // Runs error is non-fatal — just show empty
      setAgents((agentsRes.data ?? []) as unknown as AgentProfile[]);
      setRecentRuns(
        runsRes.error ? [] : ((runsRes.data ?? []) as unknown as AgentRun[])
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
      setAgents([]);
      setRecentRuns([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, accountLoading]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agent registry — 10 default BMC section agents plus custom agents.
            Each agent owns canvas sections, runs analysis, and produces
            evidence-backed claims.
          </p>
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
          <Button variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            New Agent
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive/40 mx-auto mb-3" />
            <p className="text-sm text-destructive">{error}</p>
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
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Bot className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No agent profiles found. Agent profiles are seeded during
              workspace initialization. Run the seed migration to create the
              10 default agents.
            </p>
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
      ) : (
        <>
          {/* Agent grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map((agent) => {
              const statusCfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.active;
              return (
                <Card key={agent.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                        <CardTitle className="text-sm font-medium truncate">
                          {agent.display_name}
                        </CardTitle>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-xs shrink-0 ${statusCfg.className}`}
                      >
                        <statusCfg.icon className="h-2.5 w-2.5 mr-1" />
                        {statusCfg.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {agent.description && (
                      <p className="text-xs text-muted-foreground mb-3 line-clamp-3">
                        {agent.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {agent.agent_type}
                      </Badge>
                      {agent.model_route_key && (
                        <Badge variant="outline" className="text-xs">
                          Model: {agent.model_route_key}
                        </Badge>
                      )}
                      {agent.assigned_sections &&
                        agent.assigned_sections.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {agent.assigned_sections.length} section
                            {agent.assigned_sections.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => {
                          setInstructionsAgent(agent);
                          setInstructionsOpen(true);
                        }}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Instructions
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Recent runs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-muted-foreground" />
                Recent Agent Runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentRuns.length === 0 ? (
                <div className="py-8 text-center">
                  <Bot className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No agent runs yet. Runs will appear here when agents execute
                    analysis tasks.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentRuns.map((run) => {
                    const statusCfg =
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
                              {run.run_type}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`text-xs ${statusCfg.className}`}
                            >
                              {statusCfg.label}
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
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {run.started_at
                            ? new Date(run.started_at).toLocaleString()
                            : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AgentRunDetailDialog
        runId={detailRunId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      <AgentInstructionsDialog
        agent={instructionsAgent}
        open={instructionsOpen}
        onOpenChange={setInstructionsOpen}
        onSaved={() => void fetchData()}
      />
    </div>
  );
}
