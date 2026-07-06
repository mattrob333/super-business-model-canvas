-- =============================================================================
-- workspace_chat model route (RF-LIVE-8).
--
-- The seeded agent profiles default to model_route_key 'standard', which is
-- the legacy xai/grok-4.3 row from the pre-runtime era. Workspace chat runs
-- on the Claude Agent SDK (MCP tools, proposal mode), and feeding it a Grok
-- model name made the CLI reply "There's an issue with the selected model
-- (grok 4.3)" as if the agent said it. The worker now ignores non-anthropic
-- routes for chat; this row gives chat a first-class anthropic default so
-- resolution is explicit rather than falling through to section_analysis.
-- =============================================================================

insert into public.model_routes
  (account_id, route_key, label, provider, model_name, params, is_default, task_class, cost_per_1k_in, cost_per_1k_out, updated_by)
values
  (null, 'workspace_chat', 'Workspace Chat (mid)', 'anthropic', 'claude-sonnet-5',
   '{"temperature":0.4,"max_tokens":4000}'::jsonb, false, 'workspace_chat', 0.002, 0.01, 'human')
on conflict (route_key) where account_id is null do update set
  label = excluded.label,
  provider = excluded.provider,
  model_name = excluded.model_name,
  params = excluded.params,
  task_class = excluded.task_class,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  updated_by = excluded.updated_by;
