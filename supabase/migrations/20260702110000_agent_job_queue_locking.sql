-- Phase 2.2: worker queue locking and crash recovery.
--
-- The worker uses the service-role key, so RLS is not the concurrency boundary.
-- Claiming must be atomic inside Postgres. `claim_next_agent_job` selects one
-- queued or stale-running job with FOR UPDATE SKIP LOCKED, then marks it running
-- for the caller. `fail_agent_job` centralizes retry/dead-letter state.

alter table public.agent_jobs
  add column if not exists claimed_by text,
  add column if not exists locked_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists run_after timestamptz not null default now(),
  add column if not exists max_attempts integer not null default 3,
  add column if not exists last_error text;

create index if not exists idx_agent_jobs_queue_claim
  on public.agent_jobs(status, run_after, created_at)
  where status in ('queued', 'running');

create index if not exists idx_agent_jobs_heartbeat
  on public.agent_jobs(status, heartbeat_at)
  where status = 'running';

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

create or replace function public.fail_agent_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text
)
returns public.agent_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.agent_jobs;
  v_delay_seconds integer;
begin
  select *
    into v_job
  from public.agent_jobs
  where id = p_job_id
    and claimed_by = p_worker_id
    and status = 'running'
  for update;

  if not found then
    raise exception 'agent job % is not running for worker %', p_job_id, p_worker_id;
  end if;

  if v_job.attempts >= v_job.max_attempts then
    update public.agent_jobs
    set
      status = 'failed_permanent',
      heartbeat_at = now(),
      last_error = p_error
    where id = p_job_id
    returning * into v_job;
  else
    v_delay_seconds := least(900, power(2, greatest(v_job.attempts - 1, 0))::integer * 30);

    update public.agent_jobs
    set
      status = 'queued',
      claimed_by = null,
      locked_at = null,
      heartbeat_at = null,
      run_after = now() + make_interval(secs => v_delay_seconds),
      last_error = p_error
    where id = p_job_id
    returning * into v_job;
  end if;

  return v_job;
end;
$$;

comment on column public.agent_jobs.claimed_by is
  'Worker id that currently owns a running job claim.';
comment on column public.agent_jobs.heartbeat_at is
  'Updated by the worker while running; stale heartbeats are reclaimable.';
comment on column public.agent_jobs.run_after is
  'Earliest time a queued job is eligible for retry/claim.';
comment on column public.agent_jobs.max_attempts is
  'Maximum attempts before fail_agent_job moves the job to failed_permanent.';
comment on column public.agent_jobs.last_error is
  'Last failure message, safe for operator/debug display. Secrets must not be written here.';

revoke all on function public.claim_next_agent_job(text, integer, integer) from public;
revoke all on function public.claim_next_agent_job(text, integer, integer) from anon;
revoke all on function public.claim_next_agent_job(text, integer, integer) from authenticated;
grant execute on function public.claim_next_agent_job(text, integer, integer) to service_role;

revoke all on function public.fail_agent_job(uuid, text, text) from public;
revoke all on function public.fail_agent_job(uuid, text, text) from anon;
revoke all on function public.fail_agent_job(uuid, text, text) from authenticated;
grant execute on function public.fail_agent_job(uuid, text, text) to service_role;
