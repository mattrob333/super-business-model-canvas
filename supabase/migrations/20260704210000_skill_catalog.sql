-- Spec 10: the skill catalog + skill artifacts.
-- skill_catalog: global registry of the 27 signature skills (implemented flags
-- gate what the UI may offer — no fake completeness). skill_artifacts: typed
-- outputs (markdown + JSON payload) written by the worker, owner-readable.

create table if not exists public.skill_catalog (
  skill_key text primary key,
  agent_key text not null,
  title text not null,
  description text not null,
  trigger_kinds text[] not null default '{manual}',
  output_kind text not null,
  implemented boolean not null default false,
  orchestrator_can_trigger boolean not null default true,
  sort_order integer not null default 0
);

alter table public.skill_catalog enable row level security;
drop policy if exists "skill_catalog_read_all" on public.skill_catalog;
create policy "skill_catalog_read_all" on public.skill_catalog
  for select to authenticated using (true);

create table if not exists public.skill_artifacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  skill_key text not null references public.skill_catalog(skill_key),
  title text not null,
  body_md text not null,
  payload jsonb not null default '{}'::jsonb,
  evidence_ids uuid[] not null default '{}',
  inputs jsonb not null default '{}'::jsonb,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_skill_artifacts_account
  on public.skill_artifacts(account_id, skill_key, created_at desc);

alter table public.skill_artifacts enable row level security;
drop policy if exists "skill_artifacts_select_account" on public.skill_artifacts;
create policy "skill_artifacts_select_account" on public.skill_artifacts
  for select to authenticated using (public.is_account_member(account_id));

insert into public.skill_catalog (skill_key, agent_key, title, description, trigger_kinds, output_kind, implemented, sort_order) values
  ('yield.pricing_teardown', 'agent_revenue_streams', 'Pricing teardown', 'Crawls competitor pricing, normalizes models and price points into a matrix, positions yours, recommends a strategy with scenarios.', '{manual,atlas}', 'matrix_board', true, 1),
  ('yield.monetization_gaps', 'agent_revenue_streams', 'Monetization gaps', 'Revenue streams competitors run that you do not, with adoption evidence.', '{manual,atlas}', 'ranked_list', false, 2),
  ('yield.wtp_signals', 'agent_revenue_streams', 'Willingness-to-pay signals', 'Mines review language about price per segment; flags under/over-pricing signals.', '{manual,cadence}', 'report', false, 3),
  ('envoy.supply_chain_map', 'agent_key_partnerships', 'Supply-chain map', 'Maps upstream/downstream of the industry; scores partnership candidates by fit with evidence.', '{manual,atlas}', 'target_map', false, 1),
  ('envoy.partner_outreach', 'agent_key_partnerships', 'Partner outreach drafts', 'Drafts personalized outreach for approved targets; drafts land in the approvals queue, never sent autonomously.', '{manual}', 'approvals_draft', false, 2),
  ('envoy.ecosystem_watch', 'agent_key_partnerships', 'Ecosystem watch', 'Competitor partnership announcements trigger counter-partner suggestions.', '{event}', 'memo', false, 3),
  ('relay.channel_gap_scan', 'agent_channels', 'Channel gap scan', 'Where competitors get distribution versus you, ranked by effort and impact.', '{manual,atlas}', 'strategy_board', false, 1),
  ('relay.watering_holes', 'agent_channels', 'Watering holes', 'Where the ICP congregates, with an entry strategy per hole.', '{manual}', 'report', false, 2),
  ('relay.channel_economics', 'agent_channels', 'Channel economics', 'CAC posture per channel from public signals; pairs with Ledger.', '{manual}', 'table', false, 3),
  ('compass.avatar_refinement', 'agent_customer_segments', 'Avatar refinement', 'Mines reviews/communities for the segment''s own words; updates ICP cards and messaging hooks.', '{manual,cadence,atlas}', 'icp_cards', false, 1),
  ('compass.segment_expansion', 'agent_customer_segments', 'Segment expansion scan', 'Adjacent segments competitors serve, scored by fit with your capabilities.', '{manual,atlas}', 'ranked_list', false, 2),
  ('compass.message_market_fit', 'agent_customer_segments', 'Message-market fit', 'Compares your language to the segment''s language; rewrite suggestions in their words.', '{manual}', 'before_after_table', false, 3),
  ('forge.differentiator_audit', 'agent_value_propositions', 'Differentiator audit', 'Uniqueness score per value-prop claim versus competitor claims; flags parity claims.', '{manual,atlas}', 'matrix_board', false, 1),
  ('forge.proof_gap_scan', 'agent_value_propositions', 'Proof gap scan', 'Claims lacking public proof versus competitor proof density; evidence-building plan.', '{manual}', 'ranked_list', false, 2),
  ('forge.positioning_brief', 'agent_value_propositions', 'Positioning brief', 'One-page positioning statement synthesized from differentiation and segment language.', '{manual,atlas}', 'brief', false, 3),
  ('anchor.churn_signal_audit', 'agent_customer_relationships', 'Churn signal audit', 'Clusters complaint themes from your and competitor reviews; maps each to a retention play.', '{manual,cadence}', 'report', false, 1),
  ('anchor.lifecycle_map', 'agent_customer_relationships', 'Lifecycle map', 'Customer journey touchpoints versus competitor motions; marks your gaps.', '{manual}', 'map_board', false, 2),
  ('anchor.advocacy_engine_scan', 'agent_customer_relationships', 'Advocacy engine scan', 'How competitors manufacture advocates; actionable equivalents for your scale.', '{manual}', 'playbook', false, 3),
  ('tempo.operational_benchmark', 'agent_key_activities', 'Operational benchmark', 'Hiring mix and ship velocity across competitors as activity-investment proxies.', '{manual,cadence}', 'gap_analysis', false, 1),
  ('tempo.build_vs_buy', 'agent_key_activities', 'Build vs buy', 'In-house activities the market sells as a service, with switching sketches.', '{manual}', 'ranked_list', false, 2),
  ('tempo.velocity_watch', 'agent_key_activities', 'Velocity watch', 'Ship-velocity deltas trigger they-are-outshipping-you insights.', '{event}', 'insight', false, 3),
  ('vault.moat_audit', 'agent_key_resources', 'Moat audit', 'Classifies resources by defensibility with evidence; scores durability.', '{manual,atlas}', 'matrix_board', false, 1),
  ('vault.single_point_scan', 'agent_key_resources', 'Single-point-of-failure scan', 'Key-person, single-supplier, and platform-dependency concentration risks.', '{manual}', 'risk_register', false, 2),
  ('vault.talent_radar', 'agent_key_resources', 'Talent radar', 'Competitor hiring by function over time reveals investment ahead of announcements.', '{cadence}', 'report', false, 3),
  ('ledger.cost_benchmark', 'agent_cost_structure', 'Cost benchmark', 'Typical cost structure for your archetype versus yours; owner questions fill private gaps.', '{manual}', 'memo', false, 1),
  ('ledger.unit_economics_frame', 'agent_cost_structure', 'Unit economics frame', 'CAC/LTV/payback frame from what is known; owner questions for the rest, never invented.', '{manual,atlas}', 'one_pager', false, 2),
  ('ledger.efficiency_scan', 'agent_cost_structure', 'Efficiency scan', 'Vendors and tooling that attack your named top cost drivers, with adoption evidence.', '{manual}', 'ranked_list', false, 3)
on conflict (skill_key) do update set
  agent_key = excluded.agent_key,
  title = excluded.title,
  description = excluded.description,
  trigger_kinds = excluded.trigger_kinds,
  output_kind = excluded.output_kind,
  sort_order = excluded.sort_order;

insert into public.model_routes
  (account_id, route_key, label, provider, model_name, params, is_default, task_class, cost_per_1k_in, cost_per_1k_out, updated_by)
values
  (null, 'skill_run', 'Skill Run (mid)', 'anthropic', 'claude-sonnet-5',
   '{"temperature":0.3,"max_tokens":6000}'::jsonb, false, 'skill_run', 0.002, 0.01, 'human')
on conflict (route_key) where account_id is null do update set
  label = excluded.label, provider = excluded.provider, model_name = excluded.model_name,
  params = excluded.params, task_class = excluded.task_class,
  cost_per_1k_in = excluded.cost_per_1k_in, cost_per_1k_out = excluded.cost_per_1k_out,
  updated_by = excluded.updated_by;
