import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Copy,
  Check,
  AlertCircle,
  Clock,
  Cpu,
  DollarSign,
  Coins,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * AgentRunDetailDialog
 *
 * Shows the full details of a single agent run — input, output, tokens,
 * cost, model, error, timestamps. Opened by clicking a run in the
 * Activity or Agents page.
 *
 * Data source: `agent_runs` table (full row by id).
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

function formatCost(cost: number | null): string {
  if (cost === null) return "—";
  return `$${cost.toFixed(4)}`;
}

function formatTokens(tokens: number | null): string {
  if (tokens === null) return "—";
  return tokens.toLocaleString();
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  const [copied, setCopied] = useState(false);
  const jsonStr = data ? JSON.stringify(data, null, 2) : null;

  const handleCopy = () => {
    if (jsonStr) {
      navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {jsonStr && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </div>
      <pre className="rounded-lg border bg-muted/30 p-3 text-xs overflow-auto max-h-48 whitespace-pre-wrap break-words">
        {jsonStr ?? "—"}
      </pre>
    </div>
  );
}

export interface AgentRunDetailDialogProps {
  runId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentRunDetailDialog({
  runId,
  open,
  onOpenChange,
}: AgentRunDetailDialogProps) {
  const [run, setRun] = useState<AgentRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRun = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("*")
        .eq("id", runId)
        .maybeSingle();
      if (error) throw error;
      setRun(data as unknown as AgentRun);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run");
      setRun(null);
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    if (open && runId) {
      void fetchRun();
    }
  }, [open, runId, fetchRun]);

  const statusCfg = run
    ? RUN_STATUS_CONFIG[run.status] ?? RUN_STATUS_CONFIG.pending
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-muted-foreground" />
            Agent Run Detail
          </DialogTitle>
          <DialogDescription>
            Full details of a single agent execution.
          </DialogDescription>
        </DialogHeader>

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
              onClick={() => void fetchRun()}
            >
              Retry
            </Button>
          </div>
        ) : run ? (
          <div className="space-y-4">
            {/* Status + type badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {statusCfg && (
                <Badge variant="outline" className={statusCfg.className}>
                  {statusCfg.label}
                </Badge>
              )}
              {run.run_type && (
                <Badge variant="secondary" className="text-xs">
                  {run.run_type}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {run.trigger_type}
              </Badge>
            </div>

            {/* Summary */}
            {run.summary && (
              <p className="text-sm text-muted-foreground">{run.summary}</p>
            )}

            {/* Error message */}
            {run.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-xs font-medium text-destructive">
                    Error
                  </span>
                </div>
                <p className="text-xs text-destructive whitespace-pre-wrap">
                  {run.error}
                </p>
              </div>
            )}

            {/* Timing */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Started</span>
                </div>
                <p className="text-xs font-medium">
                  {formatTimestamp(run.started_at)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Completed</span>
                </div>
                <p className="text-xs font-medium">
                  {formatTimestamp(run.completed_at)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Duration</span>
                </div>
                <p className="text-xs font-medium">
                  {formatDuration(run.started_at, run.completed_at)}
                </p>
              </div>
            </div>

            {/* Model + tokens + cost */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border p-3">
                <span className="text-xs text-muted-foreground block mb-1">
                  Provider
                </span>
                <p className="text-xs font-medium">
                  {run.model_provider ?? "—"}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1 mb-1">
                  <Coins className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Tokens In</span>
                </div>
                <p className="text-xs font-medium">
                  {formatTokens(run.tokens_in)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1 mb-1">
                  <Coins className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Tokens Out</span>
                </div>
                <p className="text-xs font-medium">
                  {formatTokens(run.tokens_out)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1 mb-1">
                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Cost</span>
                </div>
                <p className="text-xs font-medium">
                  {formatCost(run.estimated_cost)}
                </p>
              </div>
            </div>

            {run.model_name && (
              <div className="rounded-lg border p-3">
                <span className="text-xs text-muted-foreground block mb-1">
                  Model
                </span>
                <p className="text-xs font-medium">{run.model_name}</p>
              </div>
            )}

            <Separator />

            {/* Input / Output JSON */}
            <div className="space-y-3">
              <JsonBlock label="Input" data={run.input} />
              <JsonBlock label="Output" data={run.output} />
            </div>

            {/* IDs */}
            <Separator />
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">Run ID:</span>
                <code className="text-xs">{run.id}</code>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">Agent Profile ID:</span>
                <code className="text-xs">{run.agent_profile_id}</code>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No run data.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
