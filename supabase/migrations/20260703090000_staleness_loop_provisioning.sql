-- Phase 3.6 (RF-3-10): the staleness sweep must actually be scheduled.
-- Seeds a default weekly staleness_sweep scheduled loop per account (bound to
-- the account's orchestrator profile), provisions it for future accounts, and
-- guarantees one loop per action per account.

-- One loop per (account, action) — required for idempotent seeding below.
create unique index if not exists idx_scheduled_loops_account_action
  on public.scheduled_loops(account_id, action_key)
  where action_key is not null;

-- Provision defaults now also creates the staleness loop for new accounts.
create or replace function public.provision_account_defaults(_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Clone the 10 template agents (account_id IS NULL) into this account.
  insert into public.agent_profiles (
    account_id, agent_key, display_name, agent_type, description,
    assigned_sections, model_route_key, status,
    system_instructions_summary, system_instructions
  )
  select
    _account_id, agent_key, display_name, agent_type, description,
    assigned_sections, model_route_key, status,
    system_instructions_summary, system_instructions
  from public.agent_profiles
  where account_id is null
  on conflict (account_id, agent_key) do nothing;

  -- Copy global model routes (account_id IS NULL) into this account.
  insert into public.model_routes (
    account_id, route_key, label, provider, model_name, params,
    fallback_route_key, is_default
  )
  select
    _account_id, route_key, label, provider, model_name, params,
    fallback_route_key, is_default
  from public.model_routes
  where account_id is null
  on conflict (account_id, route_key) do nothing;

  -- Default weekly canvas staleness sweep (Mondays 06:00 UTC), owned by the
  -- account's orchestrator. The loop tick enqueues a staleness_sweep worker job.
  insert into public.scheduled_loops (
    account_id, agent_profile_id, loop_name, schedule, action_key, status
  )
  select
    _account_id, p.id, 'Canvas staleness sweep', '0 6 * * 1', 'staleness_sweep', 'active'
  from public.agent_profiles p
  where p.account_id = _account_id and p.agent_key = 'orchestrator'
  on conflict (account_id, action_key) where action_key is not null do nothing;
end;
$$;

-- Backfill: create the loop for every existing account with an orchestrator.
insert into public.scheduled_loops (
  account_id, agent_profile_id, loop_name, schedule, action_key, status
)
select
  p.account_id, p.id, 'Canvas staleness sweep', '0 6 * * 1', 'staleness_sweep', 'active'
from public.agent_profiles p
where p.account_id is not null and p.agent_key = 'orchestrator'
on conflict (account_id, action_key) where action_key is not null do nothing;
