import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentJob } from "../queue/types.js";

/**
 * Mark the durable agent_runs row for a job as completed. Handlers that don't
 * stream LLM output (feed_refresh, staleness_sweep) still create runs when
 * enqueued through the agent-run edge function; without this they would sit
 * in `pending` forever. No-op for jobs enqueued without a run row.
 */
export async function markJobRunCompleted(
  client: SupabaseClient,
  job: AgentJob,
  summary: string,
  output: Record<string, unknown> = {},
): Promise<void> {
  if (!job.agent_run_id) return;
  const { error } = await client
    .from("agent_runs")
    .update({
      status: "completed",
      summary,
      output,
      completed_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", job.agent_run_id)
    .eq("account_id", job.account_id);
  if (error) throw new Error(`Failed to mark run completed: ${error.message}`);
}
