import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity as ActivityIcon, AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

/**
 * Spec 02 zone 3 (bottom) — the run queue, first piece of the actions panel:
 * this agent's recent + in-flight runs from agent_runs, polled while anything
 * is active. Skills/Templates/Frameworks tabs land with the actions-panel
 * slice; nothing fake is rendered meanwhile.
 */

interface RunRow {
  id: string;
  run_type: string | null;
  status: string;
  summary: string | null;
  error: string | null;
  created_at: string;
}

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-primary/10 text-primary",
  completed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  timeout: "bg-warning/10 text-warning",
};

export function WorkspaceRunQueue({
  accountId,
  agentProfileId,
  onLatestRun,
}: {
  accountId: string;
  agentProfileId: string;
  onLatestRun?: (run: { status: string; error: string | null } | null) => void;
}) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("id, run_type, status, summary, error, created_at")
        .eq("account_id", accountId)
        .eq("agent_profile_id", agentProfileId)
        .order("created_at", { ascending: false })
        .limit(8);
      if (cancelled) return;
      setLoading(false);
      if (!error && data) {
        setRuns(data as RunRow[]);
        onLatestRun?.(data[0] ? { status: data[0].status, error: data[0].error } : null);
        const anyActive = data.some((run) => run.status === "pending" || run.status === "running");
        if (anyActive) timer = setTimeout(() => setTick((value) => value + 1), 5_000);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // onLatestRun is a stable setter passed from the page; tick drives the poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, agentProfileId, tick]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Run queue
        </h2>
        <Link to="/activity" className="text-[11px] font-medium text-primary hover:underline">
          All activity
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : runs.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          No runs yet. Chat messages and canvas analyses land here as durable runs.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {runs.map((run) => (
            <li key={run.id} className="rounded-md border border-border/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                  {run.status === "running" ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
                  ) : run.status === "failed" || run.status === "timeout" ? (
                    <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
                  ) : (
                    <ActivityIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{run.run_type ?? "run"}</span>
                </span>
                <Badge variant="outline" className={`shrink-0 text-[10px] ${STATUS_CLASS[run.status] ?? ""}`}>
                  {run.status}
                </Badge>
              </div>
              {(run.summary || run.error) && (
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                  {run.error ?? run.summary}
                </p>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                {new Date(run.created_at).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
