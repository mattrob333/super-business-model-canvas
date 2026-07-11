import { loadConfig } from "./config/env.js";
import { createServiceClient } from "./db/supabase.js";
import { JobLoop } from "./queue/job-loop.js";
import { SupabaseJobRepository } from "./queue/supabase-job-repository.js";
import { createJobDispatcher } from "./jobs/dispatch.js";
import { ClaudeAgentRunner } from "./agent/runner.js";
import { taskLimitsFromConfig } from "./agent/limits.js";

const config = loadConfig();

/**
 * Boot-time self-check (live incident 2026-07-06: chat/skill CLI children
 * died with "exited with code 1" and no captured reason). One tiny SDK call
 * per boot, result or full failure printed to stdout — readable via
 * `fly logs` / the Diagnose workflow. Never blocks the job loop.
 */
async function claudeSelfCheck(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[self-check] ANTHROPIC_API_KEY is NOT set — Claude runs will fail");
    return;
  }
  try {
    const result = await new ClaudeAgentRunner().run({
      prompt: "Reply with exactly: OK",
      systemPrompt: "You are a health check. Reply with exactly: OK",
      model: "claude-sonnet-5",
      maxTurns: 1,
      maxBudgetUsd: 0.3,
      mcpServers: {},
      allowedTools: [],
    });
    console.log(`[self-check] claude ok: "${result.resultText.slice(0, 40)}" cost=${result.costUsd ?? "?"}`);
  } catch (error) {
    console.error("[self-check] claude FAILED:", error instanceof Error ? error.message : String(error));
  }
}
void claudeSelfCheck();
const client = createServiceClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
const repository = new SupabaseJobRepository(client);
const handler = createJobDispatcher({
  client,
  openRouterApiKey: config.OPENROUTER_API_KEY,
  xaiApiKey: config.XAI_API_KEY,
  xaiModel: config.XAI_MODEL,
  exaApiKey: config.EXA_API_KEY,
  firecrawlApiKey: config.FIRECRAWL_API_KEY,
  fredApiKey: config.FRED_API_KEY,
  googleTrendsApiKey: config.GOOGLE_TRENDS_API_KEY,
  githubToken: config.GITHUB_TOKEN,
  secEdgarUserAgent: config.SEC_EDGAR_USER_AGENT,
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
