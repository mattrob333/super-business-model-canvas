import { loadConfig } from "./config/env.js";
import { createServiceClient } from "./db/supabase.js";
import { JobLoop } from "./queue/job-loop.js";
import { SupabaseJobRepository } from "./queue/supabase-job-repository.js";
import { createJobDispatcher } from "./jobs/dispatch.js";
import { taskLimitsFromConfig } from "./agent/limits.js";

const config = loadConfig();
const client = createServiceClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
const repository = new SupabaseJobRepository(client);
const handler = createJobDispatcher({
  client,
  xaiApiKey: process.env.XAI_API_KEY,
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
  taskLimits: taskLimitsFromConfig(config),
});

const loop = new JobLoop(
  config.workerId,
  repository,
  handler,
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
