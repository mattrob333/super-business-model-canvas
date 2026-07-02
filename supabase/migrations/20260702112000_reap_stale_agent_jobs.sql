-- RF-2-1: stale-running final-attempt jobs must not remain zombies.
--
-- If a worker crashes after claiming a job's final allowed attempt, no worker
-- can call fail_agent_job as the original owner. Reap those stale rows to
-- failed_permanent before claiming the next eligible job.

create or replace function public.claim_next_agent_job(
  p_worker_id text,
  p_stale_after_seconds integer default 120,
  p_default_max_attempts integer default 3
)
returns setof public.agent_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  update public.agent_jobs
  set
    status = 'failed_permanent',
    heartbeat_at = now(),
    last_error = coalesce(last_error, 'Worker heartbeat expired after final attempt')
  where status = 'running'
    and coalesce(heartbeat_at, locked_at, created_at) < now() - make_interval(secs => p_stale_after_seconds)
    and attempts >= coalesce(max_attempts, p_default_max_attempts);

  select id
    into v_job_id
  from public.agent_jobs
  where
    (
      status = 'queued'
      and run_after <= now()
      and attempts < coalesce(max_attempts, p_default_max_attempts)
    )
    or (
      status = 'running'
      and coalesce(heartbeat_at, locked_at, created_at) < now() - make_interval(secs => p_stale_after_seconds)
      and attempts < coalesce(max_attempts, p_default_max_attempts)
    )
  order by run_after asc, created_at asc
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  return query
  update public.agent_jobs
  set
    status = 'running',
    attempts = attempts + 1,
    max_attempts = coalesce(max_attempts, p_default_max_attempts),
    claimed_by = p_worker_id,
    locked_at = now(),
    heartbeat_at = now(),
    last_error = null
  where id = v_job_id
  returning *;
end;
$$;

revoke all on function public.claim_next_agent_job(text, integer, integer) from public;
revoke all on function public.claim_next_agent_job(text, integer, integer) from anon;
revoke all on function public.claim_next_agent_job(text, integer, integer) from authenticated;
grant execute on function public.claim_next_agent_job(text, integer, integer) to service_role;
