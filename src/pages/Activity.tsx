import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Bot, Clock, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccountId } from "@/hooks/useAccountId";
import type { Database } from "@/integrations/supabase/types";

/**
 * Activity page (/activity)
 *
 * Shows the real-time activity stream — agent runs, canvas edits, gap
 * discoveries, evidence collection, and scheduled loop executions.
 *
 * Data source: `agent_runs` table (Phase 2 schema).
 */

type AgentRun = Database["public"]["Tables"]["agent_runs"]["Row"];

const RUN_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  running: { label: "Running", className: "bg-primary/10 text-primary" },
  completed: { label: "Completed", className: "bg-success/10 text-success" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
  timeout: { label: "Timeout", className: "bg-warning/10 text-warning" },
};

const RUN_TYPE_ICONS: Record<string, typeof Bot> = {
  analysis: Bot,
  canvas_edit: Activity,
  gap_discovery: Clock,
  scheduled_loop: RefreshCw,
};

export default function ActivityPage() {
  const { accountId, loading: accountLoading } = useAccountId();
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    if (accountLoading) return;

    const effectiveAccountId = accountId ?? "00000000-0000-0000-0000-000000000000";
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("agent_runs")
        .select(
          "id, agent_profile_id, run_type, trigger_type, status, summary, started_at, completed_at, model_provider, model_name"
        )
        .eq("account_id", effectiveAccountId)
        .order("started_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setRuns((data ?? []) as unknown as AgentRun[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity");
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, accountLoading]);

  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time activity stream — agent runs, canvas edits, gap
            discoveries, evidence collection, and scheduled loop executions.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Refresh"
          onClick={() => void fetchRuns()}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Activity types legend */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="text-xs gap-1.5">
          <Bot className="h-3 w-3" />
          Agent Run
        </Badge>
        <Badge variant="outline" className="text-xs gap-1.5">
          <Activity className="h-3 w-3" />
          Canvas Edit
        </Badge>
        <Badge variant="outline" className="text-xs gap-1.5">
          <Clock className="h-3 w-3" />
          Gap Discovery
        </Badge>
        <Badge variant="outline" className="text-xs gap-1.5">
          <RefreshCw className="h-3 w-3" />
          Scheduled Loop
        </Badge>
      </div>

      {/* Activity stream */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Activity Stream
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <AlertCircle className="h-8 w-8 text-destructive/40 mx-auto mb-3" />
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void fetchRuns()}
              >
                Retry
              </Button>
            </div>
          ) : runs.length === 0 ? (
            <div className="py-12 text-center">
              <Activity className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No activity yet. Agent runs, canvas edits, and gap discoveries
                will appear here in real time.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Configure AI providers in Settings and run a playbook to begin.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => {
                const statusCfg =
                  RUN_STATUS_CONFIG[run.status] ?? RUN_STATUS_CONFIG.pending;
                const Icon = RUN_TYPE_ICONS[run.run_type] ?? Bot;
                return (
                  <div
                    key={run.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
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
                        <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                          {run.summary}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        {run.model_provider && (
                          <span className="text-xs text-muted-foreground">
                            {run.model_provider}
                            {run.model_name ? ` · ${run.model_name}` : ""}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {run.started_at
                            ? new Date(run.started_at).toLocaleString()
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
