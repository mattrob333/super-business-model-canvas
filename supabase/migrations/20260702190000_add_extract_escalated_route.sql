-- Phase 3.4: explicit escalated extraction route.

insert into public.model_routes
  (account_id, route_key, label, provider, model_name, params, is_default, task_class, cost_per_1k_in, cost_per_1k_out, updated_by)
values
  (null, 'extract_escalated', 'Extract Escalated (mid)', 'anthropic', 'claude-haiku-4-5-20251001',
   '{"temperature":0.2,"max_tokens":3000}'::jsonb, false, 'extract_escalated', 0.001, 0.005, 'human')
on conflict (route_key) where account_id is null do update set
  label = excluded.label,
  provider = excluded.provider,
  model_name = excluded.model_name,
  params = excluded.params,
  is_default = excluded.is_default,
  task_class = excluded.task_class,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  updated_by = excluded.updated_by,
  updated_at = now();
