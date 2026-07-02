import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  WORKER_ID: z.string().min(1).optional(),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  JOB_HEARTBEAT_STALE_SECONDS: z.coerce.number().int().positive().default(120),
  JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
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
