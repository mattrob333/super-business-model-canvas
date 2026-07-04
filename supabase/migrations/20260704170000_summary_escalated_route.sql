-- RF-5A-1: summary_update budget->mid escalation route (spec 08 section 8).
-- The budget tier tries first; unparseable output escalates here instead of
-- ever writing a fallback/empty atlas_summary.

insert into public.model_routes
  (account_id, route_key, label, provider, model_name, params, is_default, task_class, cost_per_1k_in, cost_per_1k_out, updated_by)
values
  (null, 'summary_update_escalated', 'Atlas Summary Update (escalated, mid)', 'anthropic', 'claude-sonnet-5',
   '{"temperature":0.2,"max_tokens":1800}'::jsonb, false, 'summary_update_escalated', 0.002, 0.01, 'human')
on conflict (route_key) where account_id is null do update set
  label = excluded.label,
  provider = excluded.provider,
  model_name = excluded.model_name,
  params = excluded.params,
  task_class = excluded.task_class,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  updated_by = excluded.updated_by;
