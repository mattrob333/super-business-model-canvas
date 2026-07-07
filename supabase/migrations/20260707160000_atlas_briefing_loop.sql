-- Autonomy: Atlas briefs the owner every morning without being asked.
-- Seeds a daily atlas_briefing scheduled loop per account (11:00 UTC, before
-- a US workday starts), extends provision_account_defaults so future accounts
-- get it, and re-arms any staleness loop parked by the pre-hardening tick
-- bug (triggered_by uuid mismatch made every scheduled enqueue fail, so
-- loops accumulated failure_count through no fault of their own).

-- Provisioning now creates BOTH default loops for new accounts.
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

  -- Default weekly canvas staleness sweep (Mondays 06:00 UTC).
  insert into public.scheduled_loops (
    account_id, agent_profile_id, loop_name, schedule, action_key, status
  )
  select
    _account_id, p.id, 'Canvas staleness sweep', '0 6 * * 1', 'staleness_sweep', 'active'
  from public.agent_profiles p
  where p.account_id = _account_id and p.agent_key = 'orchestrator'
  on conflict (account_id, action_key) where action_key is not null do nothing;

  -- Default daily Atlas briefing (11:00 UTC) — the State of the Union is
  -- waiting when the owner opens the app.
  insert into public.scheduled_loops (
    account_id, agent_profile_id, loop_name, schedule, action_key, status
  )
  select
    _account_id, p.id, 'Morning briefing from Atlas', '0 11 * * *', 'atlas_briefing', 'active'
  from public.agent_profiles p
  where p.account_id = _account_id and p.agent_key = 'orchestrator'
  on conflict (account_id, action_key) where action_key is not null do nothing;
end;
$$;

-- Backfill: the daily briefing loop for every existing account.
insert into public.scheduled_loops (
  account_id, agent_profile_id, loop_name, schedule, action_key, status
)
select
  p.account_id, p.id, 'Morning briefing from Atlas', '0 11 * * *', 'atlas_briefing', 'active'
from public.agent_profiles p
where p.account_id is not null and p.agent_key = 'orchestrator'
on conflict (account_id, action_key) where action_key is not null do nothing;

-- Re-arm loops the broken enqueue path parked: the failures were the tick's
-- bug, not the loops'. Applies only to action-key loops the worker executes.
update public.scheduled_loops
set failure_count = 0,
    status = 'active',
    next_run_at = null,
    updated_at = now()
where action_key is not null
  and status in ('error', 'exhausted_failures');
