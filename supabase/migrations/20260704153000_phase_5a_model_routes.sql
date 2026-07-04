-- =============================================================================
-- PHASE 5A - model routes for knowledge jobs
-- Spec reference: docs/specs/08_KNOWLEDGE_AND_STRATEGY_ENGINE.md section 8
-- =============================================================================

insert into public.model_routes
  (account_id, route_key, label, provider, model_name, params, is_default, task_class, cost_per_1k_in, cost_per_1k_out, updated_by)
values
  (null, 'onboarding_extract', 'Onboarding Extract (mid)', 'anthropic', 'claude-sonnet-5',
   '{"temperature":0.2,"max_tokens":5000}'::jsonb, false, 'onboarding_extract', 0.002, 0.01, 'human'),
  (null, 'dossier_refresh', 'Dossier Refresh (mid)', 'anthropic', 'claude-sonnet-5',
   '{"temperature":0.3,"max_tokens":5000}'::jsonb, false, 'dossier_refresh', 0.002, 0.01, 'human'),
  (null, 'summary_update', 'Atlas Summary Update (budget)', 'openrouter', 'anthropic/claude-haiku-4.5',
   '{"temperature":0.2,"max_tokens":1800}'::jsonb, false, 'summary_update', 0.001, 0.005, 'human')
on conflict (route_key) where account_id is null do update set
  label = excluded.label,
  provider = excluded.provider,
  model_name = excluded.model_name,
  params = excluded.params,
  task_class = excluded.task_class,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  updated_by = excluded.updated_by;
