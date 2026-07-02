import { loadConfig } from "./config/env.js";
import { createServiceClient } from "./db/supabase.js";
import { JobLoop } from "./queue/job-loop.js";
import { SupabaseJobRepository } from "./queue/supabase-job-repository.js";
import type { AgentJob } from "./queue/types.js";

const config = loadConfig();
const client = createServiceClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
const repository = new SupabaseJobRepository(client);

const loop = new JobLoop(
  config.workerId,
  repository,
  async (job: AgentJob) => {
    throw new Error(`Unsupported job kind for Phase 2.1-2.2 skeleton: ${job.kind}`);
  },
  {
    pollIntervalMs: config.POLL_INTERVAL_MS,
    heartbeatIntervalMs: Math.max(1000, Math.floor(config.POLL_INTERVAL_MS / 2)),
    staleAfterSeconds: config.JOB_HEARTBEAT_STALE_SECONDS,
    defaultMaxAttempts: config.JOB_MAX_ATTEMPTS,
  },
);

process.on("SIGINT", () => loop.stop());
process.on("SIGTERM", () => loop.stop());

await loop.runForever();
