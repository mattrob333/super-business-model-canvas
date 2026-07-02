-- Schedule the scheduled-loop-tick edge function via pg_cron + pg_net.
--
-- Prerequisite (one-time, run manually in the SQL Editor — never commit the key):
--   select vault.create_secret('<service-role-key>', 'service_role_key');
--
-- The tick runs every 5 minutes and processes all due rows in scheduled_loops.
-- The edge function itself enforces per-loop schedules (next_run_at), failure
-- limits, and monthly budgets, so a frequent tick is cheap when nothing is due.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Re-create idempotently
do $$
begin
  if exists (select 1 from cron.job where jobname = 'scheduled-loop-tick') then
    perform cron.unschedule('scheduled-loop-tick');
  end if;
end $$;

select cron.schedule(
  'scheduled-loop-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://mehhuxzamnpxnkbrslls.supabase.co/functions/v1/scheduled-loop-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'service_role_key' limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
