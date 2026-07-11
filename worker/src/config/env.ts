import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  XAI_API_KEY: z.string().min(1).optional(),
  XAI_MODEL: z.string().min(1).optional(),
  EXA_API_KEY: z.string().min(1).optional(),
  FIRECRAWL_API_KEY: z.string().min(1).optional(),
  FRED_API_KEY: z.string().min(1).optional(),
  GOOGLE_TRENDS_API_KEY: z.string().min(1).optional(),
  GITHUB_TOKEN: z.string().min(1).optional(),
  SEC_EDGAR_USER_AGENT: z.string().min(1).optional(),
  WORKER_ID: z.string().min(1).optional(),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  JOB_HEARTBEAT_STALE_SECONDS: z.coerce.number().int().positive().default(120),
  JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  SECTION_ANALYSIS_MAX_TURNS: z.coerce.number().int().positive().default(40),
  SECTION_ANALYSIS_TASK_BUDGET_TOKENS: z.coerce.number().int().positive().default(64000),
  SECTION_ANALYSIS_MAX_BUDGET_USD: z.coerce.number().positive().optional(),
  WORKSPACE_CHAT_MAX_TURNS: z.coerce.number().int().positive().default(40),
  WORKSPACE_CHAT_TASK_BUDGET_TOKENS: z.coerce.number().int().positive().default(64000),
  WORKSPACE_CHAT_MAX_BUDGET_USD: z.coerce.number().positive().optional(),
});

export type WorkerConfig = z.infer<typeof envSchema> & {
  workerId: string;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = envSchema.parse(source);
  return {
    ...parsed,
    workerId: parsed.WORKER_ID ?? `worker-${process.pid}`,
  };
}
