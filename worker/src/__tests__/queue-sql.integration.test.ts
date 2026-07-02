import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.WORKER_TEST_DATABASE_URL;
const maybeIt = databaseUrl ? it : it.skip;

describe("agent job queue SQL", () => {
  maybeIt("reaps stale final-attempt running jobs instead of orphaning them", async () => {
    const sql = `
      begin;
      insert into public.accounts (id, name, slug)
      values ('11111111-1111-4111-8111-111111111111', 'Worker SQL Test', 'worker-sql-test')
      on conflict (id) do nothing;

      insert into public.agent_jobs (
        id,
        account_id,
        kind,
        payload,
        status,
        attempts,
        max_attempts,
        claimed_by,
        locked_at,
        heartbeat_at,
        run_after,
        created_at
      )
      values (
        '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111',
        'canvas_section_analysis',
        '{"section_key":"value_propositions"}'::jsonb,
        'running',
        3,
        3,
        'crashed-worker',
        now() - interval '10 minutes',
        now() - interval '10 minutes',
        now() - interval '10 minutes',
        now() - interval '10 minutes'
      )
      on conflict (id) do update set
        status = excluded.status,
        attempts = excluded.attempts,
        max_attempts = excluded.max_attempts,
        claimed_by = excluded.claimed_by,
        locked_at = excluded.locked_at,
        heartbeat_at = excluded.heartbeat_at,
        run_after = excluded.run_after,
        last_error = null;

      select count(*) from public.claim_next_agent_job('rescuer-worker', 120, 3);
      select status, last_error from public.agent_jobs where id = '22222222-2222-4222-8222-222222222222';
      rollback;
    `;

    const { stdout } = await execFileAsync("psql", [databaseUrl as string, "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--command", sql]);

    expect(stdout).toContain("0");
    expect(stdout).toContain("failed_permanent|Worker heartbeat expired after final attempt");
  });
});
