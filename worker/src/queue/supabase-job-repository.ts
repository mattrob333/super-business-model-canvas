import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentJob, ClaimOptions, JobRepository } from "./types.js";

function assertNoError(error: { message: string } | null, action: string): void {
  if (error) {
    throw new Error(`Failed to ${action}: ${error.message}`);
  }
}

export class SupabaseJobRepository implements JobRepository {
  constructor(private readonly client: SupabaseClient) {}

  async claimNext(workerId: string, options: ClaimOptions): Promise<AgentJob | null> {
    const { data, error } = await this.client.rpc("claim_next_agent_job", {
      p_worker_id: workerId,
      p_stale_after_seconds: options.staleAfterSeconds,
      p_default_max_attempts: options.defaultMaxAttempts,
    });
    assertNoError(error, "claim next agent job");
    const rows = Array.isArray(data) ? data : [];
    return (rows[0] as AgentJob | undefined) ?? null;
  }

  async heartbeat(jobId: string, workerId: string): Promise<void> {
    const { error } = await this.client
      .from("agent_jobs")
      .update({ heartbeat_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("claimed_by", workerId)
      .eq("status", "running");
    assertNoError(error, "heartbeat agent job");
  }

  async complete(jobId: string, workerId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.client
      .from("agent_jobs")
      .update({
        status: "completed",
        heartbeat_at: now,
        last_error: null,
      })
      .eq("id", jobId)
      .eq("claimed_by", workerId)
      .eq("status", "running");
    assertNoError(error, "complete agent job");
  }

  async fail(jobId: string, workerId: string, error: Error): Promise<void> {
    const { error: updateError } = await this.client.rpc("fail_agent_job", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_error: error.message,
    });
    assertNoError(updateError, "fail agent job");
  }
}
