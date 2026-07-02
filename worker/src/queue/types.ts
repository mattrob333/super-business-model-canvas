export type AgentJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "failed_permanent"
  | "cancelled";

export interface AgentJob {
  id: string;
  account_id: string;
  kind: string;
  payload: Record<string, unknown>;
  status: AgentJobStatus;
  attempts: number;
  max_attempts: number;
  agent_run_id: string | null;
  parent_run_id: string | null;
  cascade_run_id: string | null;
  claimed_by: string | null;
  locked_at: string | null;
  heartbeat_at: string | null;
  run_after: string;
  last_error: string | null;
  created_at: string;
}

export interface JobRepository {
  claimNext(workerId: string, options: ClaimOptions): Promise<AgentJob | null>;
  heartbeat(jobId: string, workerId: string): Promise<void>;
  complete(jobId: string, workerId: string): Promise<void>;
  fail(jobId: string, workerId: string, error: Error): Promise<void>;
}

export interface ClaimOptions {
  staleAfterSeconds: number;
  defaultMaxAttempts: number;
}

export type JobHandler = (job: AgentJob) => Promise<void>;
