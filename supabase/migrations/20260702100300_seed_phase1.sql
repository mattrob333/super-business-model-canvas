-- =============================================================================
-- PHASE 1 — work order 1.4: seed data
-- =============================================================================
-- All inserts are idempotent, matching the style of
-- supabase/migrations/20250624000002_seed_agent_profiles.sql (ON CONFLICT DO
-- NOTHING against the existing partial unique indexes for template rows).

-- =============================================================================
-- 1.4a — Rename template agent_profiles to callsigns (spec 01 naming table)
-- =============================================================================
-- display_name -> "<Callsign> — <Role title>"; avatar -> {"icon", "accent"}
-- (both lowercase per work order 1.4). Source: docs/specs/01_AGENT_ROSTER.md
-- "Naming system" table.

update public.agent_profiles set
  display_name = 'Atlas — Chief Strategist',
  avatar = '{"icon": "globe", "accent": "indigo"}'::jsonb
where agent_key = 'orchestrator' and account_id is null;

update public.agent_profiles set
  display_name = 'Compass — Head of Market Intelligence',
  avatar = '{"icon": "compass", "accent": "teal"}'::jsonb
where agent_key = 'agent_customer_segments' and account_id is null;

update public.agent_profiles set
  display_name = 'Forge — Head of Product Value',
  avatar = '{"icon": "anvil", "accent": "orange"}'::jsonb
where agent_key = 'agent_value_propositions' and account_id is null;

update public.agent_profiles set
  display_name = 'Relay — Head of Distribution',
  avatar = '{"icon": "signal-tower", "accent": "sky"}'::jsonb
where agent_key = 'agent_channels' and account_id is null;

update public.agent_profiles set
  display_name = 'Anchor — Head of Customer Success',
  avatar = '{"icon": "anchor", "accent": "emerald"}'::jsonb
where agent_key = 'agent_customer_relationships' and account_id is null;

update public.agent_profiles set
  display_name = 'Yield — Head of Monetization',
  avatar = '{"icon": "ascending-chart", "accent": "gold"}'::jsonb
where agent_key = 'agent_revenue_streams' and account_id is null;

update public.agent_profiles set
  display_name = 'Vault — Head of Assets & Capabilities',
  avatar = '{"icon": "vault-door", "accent": "slate"}'::jsonb
where agent_key = 'agent_key_resources' and account_id is null;

update public.agent_profiles set
  display_name = 'Tempo — Head of Operations',
  avatar = '{"icon": "metronome", "accent": "violet"}'::jsonb
where agent_key = 'agent_key_activities' and account_id is null;

update public.agent_profiles set
  display_name = 'Envoy — Head of Alliances',
  avatar = '{"icon": "handshake", "accent": "rose"}'::jsonb
where agent_key = 'agent_key_partnerships' and account_id is null;

update public.agent_profiles set
  display_name = 'Ledger — Head of Cost & Efficiency',
  avatar = '{"icon": "ledger-book", "accent": "zinc"}'::jsonb
where agent_key = 'agent_cost_structure' and account_id is null;

-- (These UPDATEs are naturally idempotent — re-running them just re-applies
-- the same values, matching the "safe to run more than once" convention of
-- schema.sql.)


-- =============================================================================
-- 1.4b — Seed the 7 template cascades (spec 04 §3) + their steps
-- =============================================================================
-- ASSUMPTIONS (documented per work order 1.4's "use best structured judgment,
-- document any assumption" instruction):
--
-- 1. "Research refresh" (Full Recon step 1) and "metric refresh" (Board Pack
--    step 1) are not agent-specific work in spec 04 §3's prose — they are
--    system/data-layer jobs (Phase 3's company_research / Phase 7's metric
--    families), not one of the ten named agents. We assign agent_key
--    'orchestrator' to these steps since Atlas is the one who kicks off a
--    cascade and these steps aren't owned by a single section agent. The
--    actual job dispatch logic (Phase 2/3/7, not yet built) is expected to
--    special-case these action_keys rather than truly running them "as"
--    Atlas.
-- 2. Likewise "gap engine" / "gap engine delta" steps (Full Recon, Competitor
--    Delta Sweep) are a dedicated job kind (Phase 4's gap engine), not an
--    agent — assigned agent_key 'orchestrator' with a distinct action_key so
--    the worker can route it correctly.
-- 3. "3 at a time" concurrency for Full Recon's 9 parallel section steps is a
--    runtime execution parameter (the delegation concurrency cap mentioned in
--    spec 04 §3's "Execution" paragraph), not a column on cascade_steps in
--    the spec 04 §5 table — it is NOT stored here. All 9 steps share
--    order_group 2; the worker's DAG executor is expected to apply the
--    concurrency cap when it walks a parallel order_group (this is a Phase 6
--    build item — "Atlas: run_cascade" — not Phase 1's job).
-- 4. Every step_key below is invented from the prose ("Yield pricing diff" ->
--    step_key 'pricing_diff', agent_key 'agent_revenue_streams') since the
--    spec gives agent+verb phrases, not literal step_keys.
-- 5. input_template is left as '{}'::jsonb for all seeded steps — the spec's
--    `{{steps.X.output}}` templating example (spec 04 §3) is illustrative,
--    not a concrete requirement for the v1 seed; wiring real input templates
--    per step is deferred to whichever phase actually implements the DAG
--    executor (Phase 6) and can validate the template syntax against real
--    step outputs.

insert into public.cascades (account_id, cascade_key, name, description, output_kind, version, enabled) values
  (null, 'full_recon', 'Full Recon',
   'Research refresh, all 9 section agents in parallel, gap engine, then Atlas synthesis.',
   'canvas_and_brief', 1, true),
  (null, 'competitor_delta_sweep', 'Competitor Delta Sweep',
   'Weekly parallel competitor-signal watches across pricing, claims, channels, alliances, and velocity, rolled into a gap-engine delta and an Atlas digest.',
   'digest', 1, true),
  (null, 'board_pack', 'Board Pack',
   'Monthly metric refresh, per-agent section summaries, and an Atlas board memo assembled from the board-pack template.',
   'pdf', 1, true),
  (null, 'pricing_war_response', 'Pricing War Response',
   'Triggered by a Yield critical insight: deep pricing analysis, margin floor check, price-sensitivity read, then an Atlas options memo.',
   'decision_memo', 1, true),
  (null, 'unit_economics_duet', 'Unit Economics Duet',
   'Parallel revenue-model and cost-model analysis joined into a unit-economics report.',
   'report', 1, true),
  (null, 'launch_readiness', 'Launch Readiness',
   'Parallel positioning, channel plan, onboarding readiness, and ops checks rolled into an Atlas go/no-go brief.',
   'scorecard', 1, true),
  (null, 'cost_down_sprint', 'Cost-Down Sprint',
   'Ledger savings candidates checked for feasibility by Vault and Tempo, then ranked by Atlas into a cost-down brief.',
   'brief', 1, true)
on conflict (cascade_key) where account_id is null do nothing;

-- ---- Full Recon ----
insert into public.cascade_steps (cascade_id, step_key, order_group, agent_key, action_key, input_template, depends_on)
select c.id, s.step_key, s.order_group, s.agent_key, s.action_key, '{}'::jsonb, s.depends_on
from public.cascades c
cross join (values
  ('research_refresh',              1, 'orchestrator',                   'research_refresh',    array[]::text[]),
  ('section_customer_segments',     2, 'agent_customer_segments',        'section_analysis',    array['research_refresh']),
  ('section_value_propositions',    2, 'agent_value_propositions',       'section_analysis',    array['research_refresh']),
  ('section_channels',              2, 'agent_channels',                 'section_analysis',    array['research_refresh']),
  ('section_customer_relationships',2, 'agent_customer_relationships',   'section_analysis',    array['research_refresh']),
  ('section_revenue_streams',       2, 'agent_revenue_streams',          'section_analysis',    array['research_refresh']),
  ('section_key_resources',         2, 'agent_key_resources',            'section_analysis',    array['research_refresh']),
  ('section_key_activities',        2, 'agent_key_activities',           'section_analysis',    array['research_refresh']),
  ('section_key_partnerships',      2, 'agent_key_partnerships',         'section_analysis',    array['research_refresh']),
  ('section_cost_structure',        2, 'agent_cost_structure',           'section_analysis',    array['research_refresh']),
  ('gap_engine',                    3, 'orchestrator',                   'gap_engine',          array['section_customer_segments','section_value_propositions','section_channels','section_customer_relationships','section_revenue_streams','section_key_resources','section_key_activities','section_key_partnerships','section_cost_structure']),
  ('atlas_synthesis',               4, 'orchestrator',                   'strategy_synthesis',  array['gap_engine'])
) as s(step_key, order_group, agent_key, action_key, depends_on)
where c.cascade_key = 'full_recon' and c.account_id is null
on conflict (cascade_id, step_key) do nothing;

-- ---- Competitor Delta Sweep ----
insert into public.cascade_steps (cascade_id, step_key, order_group, agent_key, action_key, input_template, depends_on)
select c.id, s.step_key, s.order_group, s.agent_key, s.action_key, '{}'::jsonb, s.depends_on
from public.cascades c
cross join (values
  ('pricing_diff',       1, 'agent_revenue_streams',      'pricing_diff',      array[]::text[]),
  ('claim_diff',         1, 'agent_value_propositions',   'claim_diff',        array[]::text[]),
  ('channel_watch',      1, 'agent_channels',              'channel_watch',     array[]::text[]),
  ('alliance_watch',     1, 'agent_key_partnerships',      'alliance_watch',    array[]::text[]),
  ('velocity_watch',     1, 'agent_key_activities',        'velocity_watch',    array[]::text[]),
  ('gap_engine_delta',   2, 'orchestrator',                'gap_engine_delta',  array['pricing_diff','claim_diff','channel_watch','alliance_watch','velocity_watch']),
  ('atlas_delta_digest', 3, 'orchestrator',                'strategy_synthesis',array['gap_engine_delta'])
) as s(step_key, order_group, agent_key, action_key, depends_on)
where c.cascade_key = 'competitor_delta_sweep' and c.account_id is null
on conflict (cascade_id, step_key) do nothing;

-- ---- Board Pack ----
insert into public.cascade_steps (cascade_id, step_key, order_group, agent_key, action_key, input_template, depends_on)
select c.id, s.step_key, s.order_group, s.agent_key, s.action_key, '{}'::jsonb, s.depends_on
from public.cascades c
cross join (values
  ('metric_refresh',                    1, 'orchestrator',                   'metric_refresh',      array[]::text[]),
  ('summary_customer_segments',         2, 'agent_customer_segments',        'section_summary',     array['metric_refresh']),
  ('summary_value_propositions',        2, 'agent_value_propositions',       'section_summary',     array['metric_refresh']),
  ('summary_channels',                  2, 'agent_channels',                 'section_summary',     array['metric_refresh']),
  ('summary_customer_relationships',    2, 'agent_customer_relationships',   'section_summary',     array['metric_refresh']),
  ('summary_revenue_streams',           2, 'agent_revenue_streams',          'section_summary',     array['metric_refresh']),
  ('summary_key_resources',             2, 'agent_key_resources',            'section_summary',     array['metric_refresh']),
  ('summary_key_activities',            2, 'agent_key_activities',           'section_summary',     array['metric_refresh']),
  ('summary_key_partnerships',          2, 'agent_key_partnerships',         'section_summary',     array['metric_refresh']),
  ('summary_cost_structure',            2, 'agent_cost_structure',           'section_summary',     array['metric_refresh']),
  ('atlas_board_memo',                  3, 'orchestrator',                   'draft_document',      array['summary_customer_segments','summary_value_propositions','summary_channels','summary_customer_relationships','summary_revenue_streams','summary_key_resources','summary_key_activities','summary_key_partnerships','summary_cost_structure'])
) as s(step_key, order_group, agent_key, action_key, depends_on)
where c.cascade_key = 'board_pack' and c.account_id is null
on conflict (cascade_id, step_key) do nothing;

-- ---- Pricing War Response (sequential, triggered by a Yield critical insight) ----
insert into public.cascade_steps (cascade_id, step_key, order_group, agent_key, action_key, input_template, depends_on)
select c.id, s.step_key, s.order_group, s.agent_key, s.action_key, '{}'::jsonb, s.depends_on
from public.cascades c
cross join (values
  ('deep_pricing_analysis',   1, 'agent_revenue_streams', 'deep_pricing_analysis', array[]::text[]),
  ('margin_floor',            2, 'agent_cost_structure',  'margin_floor',          array['deep_pricing_analysis']),
  ('price_sensitivity_read',  3, 'agent_customer_segments','price_sensitivity_read',array['margin_floor']),
  ('atlas_options_memo',      4, 'orchestrator',           'strategy_synthesis',    array['price_sensitivity_read'])
) as s(step_key, order_group, agent_key, action_key, depends_on)
where c.cascade_key = 'pricing_war_response' and c.account_id is null
on conflict (cascade_id, step_key) do nothing;

-- ---- Unit Economics Duet ----
insert into public.cascade_steps (cascade_id, step_key, order_group, agent_key, action_key, input_template, depends_on)
select c.id, s.step_key, s.order_group, s.agent_key, s.action_key, '{}'::jsonb, s.depends_on
from public.cascades c
cross join (values
  ('revenue_model',        1, 'agent_revenue_streams', 'revenue_model',        array[]::text[]),
  ('cost_model',           1, 'agent_cost_structure',  'cost_model',           array[]::text[]),
  ('joint_unit_econ_report',2, 'orchestrator',          'draft_document',       array['revenue_model','cost_model'])
) as s(step_key, order_group, agent_key, action_key, depends_on)
where c.cascade_key = 'unit_economics_duet' and c.account_id is null
on conflict (cascade_id, step_key) do nothing;

-- ---- Launch Readiness ----
insert into public.cascade_steps (cascade_id, step_key, order_group, agent_key, action_key, input_template, depends_on)
select c.id, s.step_key, s.order_group, s.agent_key, s.action_key, '{}'::jsonb, s.depends_on
from public.cascades c
cross join (values
  ('positioning',           1, 'agent_value_propositions',     'positioning',           array[]::text[]),
  ('channel_plan',          1, 'agent_channels',                'channel_plan',          array[]::text[]),
  ('onboarding_readiness',  1, 'agent_customer_relationships',  'onboarding_readiness',  array[]::text[]),
  ('ops_check',             1, 'agent_key_activities',          'ops_check',             array[]::text[]),
  ('atlas_go_no_go_brief',  2, 'orchestrator',                  'strategy_synthesis',    array['positioning','channel_plan','onboarding_readiness','ops_check'])
) as s(step_key, order_group, agent_key, action_key, depends_on)
where c.cascade_key = 'launch_readiness' and c.account_id is null
on conflict (cascade_id, step_key) do nothing;

-- ---- Cost-Down Sprint ----
insert into public.cascade_steps (cascade_id, step_key, order_group, agent_key, action_key, input_template, depends_on)
select c.id, s.step_key, s.order_group, s.agent_key, s.action_key, '{}'::jsonb, s.depends_on
from public.cascades c
cross join (values
  ('savings_candidates',      1, 'agent_cost_structure', 'savings_candidates',      array[]::text[]),
  ('vault_feasibility_check', 2, 'agent_key_resources',  'feasibility_check',       array['savings_candidates']),
  ('tempo_feasibility_check', 2, 'agent_key_activities',  'feasibility_check',       array['savings_candidates']),
  ('atlas_ranked_savings_plan',3, 'orchestrator',         'strategy_synthesis',      array['vault_feasibility_check','tempo_feasibility_check'])
) as s(step_key, order_group, agent_key, action_key, depends_on)
where c.cascade_key = 'cost_down_sprint' and c.account_id is null
on conflict (cascade_id, step_key) do nothing;


-- =============================================================================
-- 1.4c — Default model_routes rows per task_class (spec 06 §1 matrix)
-- =============================================================================
-- NOTE: these are v1 placeholder-but-plausible model slugs. Exact current
-- model identifiers drift constantly (new Claude/Gemini/Grok point releases
-- ship monthly) — Phase 7's model-scout sweep job (spec 06, BUILD_PLAN 7.6)
-- is the authoritative mechanism for keeping these current. Do not treat the
-- model_name values below as verified-available on any provider today.
--
-- RF-1-2 (Phase 1 review, MEDIUM, fixed in this revision): the original
-- seed referenced deprecated/retired model IDs (claude-opus-4-1,
-- claude-3-5-haiku, gemini-flash-1.5, grok-4, claude-sonnet-4-5) that would
-- 404 on first live use. Replaced with current slugs, cross-checked against
-- the live OpenRouter catalog and this repo's own existing model references
-- (supabase/functions/_shared/xai-models.ts already standardizes on
-- grok-4.3; supabase/functions/recommend-frameworks/index.ts already uses
-- google/gemini-2.5-flash) so these seeds stay consistent with the rest of
-- the codebase, not just internally consistent with each other. Pricing
-- (cost_per_1k_in/out) updated to match each model's current catalog price.
--
-- route_key is set equal to the task_class for these rows so they're easy to
-- find/join by name; account_id NULL makes them global defaults, consistent
-- with the existing premium/standard/economy/local rows already seeded in
-- schema.sql section 14a.

insert into public.model_routes
  (account_id, route_key, label, provider, model_name, params, is_default, task_class, cost_per_1k_in, cost_per_1k_out, updated_by)
values
  (null, 'extract', 'Extract (budget)', 'openrouter', 'google/gemini-2.5-flash-lite',
   '{"temperature":0.2,"max_tokens":2000}'::jsonb, false, 'extract', 0.0001, 0.0004, 'human'),
  (null, 'classify', 'Classify (budget)', 'openrouter', 'qwen/qwen-2.5-7b-instruct',
   '{"temperature":0.1,"max_tokens":500}'::jsonb, false, 'classify', 0.00005, 0.00015, 'human'),
  (null, 'summarize', 'Summarize (budget-mid)', 'openrouter', 'anthropic/claude-haiku-4.5',
   '{"temperature":0.3,"max_tokens":1500}'::jsonb, false, 'summarize', 0.001, 0.005, 'human'),
  (null, 'embed', 'Embed', 'openrouter', 'openai/text-embedding-3-small',
   '{}'::jsonb, false, 'embed', 0.00002, 0.0, 'human'),
  (null, 'section_analysis', 'Section Analysis (mid)', 'anthropic', 'claude-sonnet-5',
   '{"temperature":0.4,"max_tokens":4000}'::jsonb, false, 'section_analysis', 0.002, 0.01, 'human'),
  (null, 'research_verify', 'Research Verify (mid — never downgraded)', 'anthropic', 'claude-sonnet-5',
   '{"temperature":0.1,"max_tokens":2000}'::jsonb, false, 'research_verify', 0.002, 0.01, 'human'),
  (null, 'draft_document', 'Draft Document (mid)', 'anthropic', 'claude-sonnet-5',
   '{"temperature":0.5,"max_tokens":6000}'::jsonb, false, 'draft_document', 0.002, 0.01, 'human'),
  (null, 'strategy_synthesis', 'Strategy Synthesis (premium)', 'anthropic', 'claude-opus-4-8',
   '{"temperature":0.4,"max_tokens":8000}'::jsonb, false, 'strategy_synthesis', 0.005, 0.025, 'human'),
  (null, 'live_search', 'Live Search (fixed: Grok)', 'xai', 'grok-4.3',
   '{"temperature":0.3,"max_tokens":2000}'::jsonb, false, 'live_search', 0.00125, 0.0025, 'human')
on conflict (route_key) where account_id is null do nothing;
