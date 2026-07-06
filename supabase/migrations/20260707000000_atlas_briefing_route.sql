-- =============================================================================
-- atlas_briefing model route (spec 12, Atlas "State of the Union").
--
-- The briefing job runs on the Claude Agent SDK, so it needs a first-class
-- anthropic route: an opus-class model synthesizing the whole board — canvas
-- coverage, competitors, gaps, artifacts — into one strategic opener. Without
-- this row the worker falls back to the workspace_chat anthropic route; this
-- makes the resolution explicit and lets accounts override it per-account.
-- =============================================================================

insert into public.model_routes
  (account_id, route_key, label, provider, model_name, params, is_default, task_class, cost_per_1k_in, cost_per_1k_out, updated_by)
values
  (null, 'atlas_briefing', 'Atlas Briefing (top)', 'anthropic', 'claude-opus-4-8',
   '{"temperature":0.3,"max_tokens":4000}'::jsonb, false, 'atlas_briefing', 0.015, 0.075, 'human')
on conflict (route_key) where account_id is null do update set
  label = excluded.label,
  provider = excluded.provider,
  model_name = excluded.model_name,
  params = excluded.params,
  task_class = excluded.task_class,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  updated_by = excluded.updated_by;
