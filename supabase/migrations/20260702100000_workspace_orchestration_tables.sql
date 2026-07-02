-- =============================================================================
-- PHASE 1 (Super BMC build plan) — work order 1.1
-- Data model wave 1: workspace & orchestration tables
-- Spec reference: docs/specs/04_ORCHESTRATION_AND_CASCADES.md §5
-- =============================================================================
--
-- ORDERING PROOF (never applied to a live database — this is the structural
-- review the reviewer asked for in lieu of a local Supabase/Docker run):
--
-- The work order lists tables in this order:
--   workspace_threads, workspace_messages, context_sources, insights,
--   agenda_items, approvals, agent_jobs, cascades, cascade_steps,
--   cascade_runs, metric_snapshots, agent_profile_revisions
--
-- That literal order contains a forward reference: `agent_jobs.cascade_run_id`
-- points at `cascade_runs`, which is listed AFTER `agent_jobs`. Postgres
-- evaluates `create table` statements top-to-bottom in a single file, so a
-- table cannot reference a FK target that hasn't been created yet. To keep
-- this migration applying cleanly in a single pass, this file creates tables
-- in true dependency order instead:
--
--   1. workspace_threads      -> accounts, agent_profiles          (pre-existing tables)
--   2. workspace_messages     -> workspace_threads (1), agent_runs (pre-existing)
--   3. context_sources        -> accounts, agent_profiles, workspace_threads (1)
--   4. insights               -> accounts, agent_profiles, agent_runs
--   5. agenda_items           -> accounts, agent_runs
--   6. approvals              -> accounts, agent_profiles
--   7. cascades               -> accounts (nullable; null = template library)
--   8. cascade_steps          -> cascades (7)
--   9. cascade_runs           -> accounts, cascades (7)
--  10. agent_jobs             -> accounts, agent_runs, cascade_runs (9)
--  11. metric_snapshots       -> accounts
--  12. agent_profile_revisions -> agent_profiles
--
-- Every FK target in this list is either a table that already exists on
-- `main` (accounts, agent_profiles, agent_runs) or a table created earlier in
-- this same file. No table below references a table defined later in the
-- file, so this migration applies cleanly on top of the existing schema in a
-- single pass. This was verified by manual read-through of every `references`
-- clause below, not by running it against a real Postgres instance (no
-- Supabase CLI/Docker is available in this environment).
--
-- All enums use the existing guarded-create convention from schema.sql
-- (`do $$ begin create type ... exception when duplicate_object then null; end $$;`).
-- =============================================================================


-- =============================================================================
-- ENUMS
-- =============================================================================
do $$ begin create type public.workspace_message_kind as enum ('text', 'tool_call', 'artifact', 'proposal', 'delegation'); exception when duplicate_object then null; end $$;
do $$ begin create type public.context_source_type as enum ('file', 'url', 'evidence_query', 'note'); exception when duplicate_object then null; end $$;
do $$ begin create type public.insight_severity as enum ('info', 'notable', 'warning', 'critical'); exception when duplicate_object then null; end $$;
do $$ begin create type public.agenda_item_status as enum ('proposed', 'accepted', 'dismissed', 'done'); exception when duplicate_object then null; end $$;
do $$ begin create type public.approval_kind as enum ('outreach', 'canvas_change', 'schedule_change'); exception when duplicate_object then null; end $$;
do $$ begin create type public.approval_status as enum ('pending', 'approved', 'declined'); exception when duplicate_object then null; end $$;
do $$ begin create type public.cascade_run_status as enum ('running', 'completed', 'partial', 'failed'); exception when duplicate_object then null; end $$;

-- NOTE on agent_jobs.status: the work order lists `status` for agent_jobs
-- without an explicit value enumeration (unlike insights/agenda_items/
-- approvals/cascade_runs, which all have bracketed value lists in the spec).
-- Phase 2 (the worker service, not yet built) owns the job-claim state
-- machine and will very likely need additional statuses beyond a first guess
-- here (e.g. `failed_permanent` for the dead-letter case described in
-- BUILD_PLAN.md 2.2). Locking this into an enum now would force a Phase-2
-- migration just to add a value. Conservative choice: `status text not null
-- default 'queued'` with a documented expected value set in the column
-- comment, no CHECK constraint. This is the most conservative interpretation
-- per BUILD_PLAN.md Part I rule 5 (avoid overspecifying an under-specified
-- work order) and is noted as a BLOCKER-adjacent judgment call in
-- docs/BUILD_STATE.md.


-- =============================================================================
-- 1. workspace_threads
-- =============================================================================
create table if not exists public.workspace_threads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_profile_id uuid not null references public.agent_profiles(id) on delete cascade,
  title text,
  created_by uuid,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.workspace_threads is
  'A chat room between a human and one agent profile (Spec 02/03 workspaces). One agent can have many threads.';

-- =============================================================================
-- 2. workspace_messages
-- =============================================================================
create table if not exists public.workspace_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.workspace_threads(id) on delete cascade,
  role text not null,
  kind public.workspace_message_kind not null default 'text',
  content jsonb not null default '{}'::jsonb,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on column public.workspace_messages.role is
  'Free-text sender role (e.g. user | agent | system). Not enumerated in spec 04 §5, kept as text.';

-- =============================================================================
-- 3. context_sources
-- =============================================================================
create table if not exists public.context_sources (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_profile_id uuid not null references public.agent_profiles(id) on delete cascade,
  thread_id uuid references public.workspace_threads(id) on delete set null,
  type public.context_source_type not null default 'note',
  name text not null,
  uri text,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  refreshed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 4. insights
-- =============================================================================
create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_profile_id uuid not null references public.agent_profiles(id) on delete cascade,
  severity public.insight_severity not null default 'info',
  title text not null,
  body text,
  section_key text,
  tags text[] not null default '{}',
  evidence_ids uuid[] not null default '{}',
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 5. agenda_items
-- =============================================================================
create table if not exists public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null,
  rationale text,
  impact text,
  effort text,
  rank integer,
  status public.agenda_item_status not null default 'proposed',
  dismissed_reason text,
  linked_gap_ids uuid[] not null default '{}',
  linked_insight_ids uuid[] not null default '{}',
  created_by_agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- 6. approvals
-- =============================================================================
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind public.approval_kind not null,
  payload jsonb not null default '{}'::jsonb,
  status public.approval_status not null default 'pending',
  requested_by_agent_profile_id uuid not null references public.agent_profiles(id) on delete cascade,
  decided_by uuid,
  decided_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 7. cascades  (account_id NULL = template library)
-- =============================================================================
create table if not exists public.cascades (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  cascade_key text not null,
  name text not null,
  description text,
  output_kind text,
  version integer not null default 1,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partial unique index for the GLOBAL (account_id IS NULL) template rows,
-- mirroring the existing agent_profiles_global_key_unique /
-- model_routes_global_key_unique pattern in schema.sql. Makes the cascade
-- seed migration idempotent via `on conflict`.
create unique index if not exists cascades_global_key_unique
  on public.cascades(cascade_key) where account_id is null;

-- =============================================================================
-- 8. cascade_steps
-- =============================================================================
create table if not exists public.cascade_steps (
  id uuid primary key default gen_random_uuid(),
  cascade_id uuid not null references public.cascades(id) on delete cascade,
  step_key text not null,
  order_group integer not null default 1,
  agent_key text not null,
  action_key text not null,
  input_template jsonb not null default '{}'::jsonb,
  depends_on text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (cascade_id, step_key)
);

-- =============================================================================
-- 9. cascade_runs
-- =============================================================================
create table if not exists public.cascade_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  cascade_id uuid not null references public.cascades(id) on delete cascade,
  status public.cascade_run_status not null default 'running',
  step_states jsonb not null default '{}'::jsonb,
  total_cost numeric(10,4),
  triggered_by text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

-- =============================================================================
-- 10. agent_jobs
-- =============================================================================
create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempts integer not null default 0,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  parent_run_id uuid references public.agent_runs(id) on delete set null,
  cascade_run_id uuid references public.cascade_runs(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on column public.agent_jobs.status is
  'Expected values (Phase 2 worker owns the state machine): queued | running | completed | failed | failed_permanent | cancelled. Not enumerated at the DB level — see migration header comment.';

-- =============================================================================
-- 11. metric_snapshots
-- =============================================================================
create table if not exists public.metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  metric_key text not null,
  section_key text,
  value numeric not null,
  label text,
  inputs jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now()
);

-- =============================================================================
-- 12. agent_profile_revisions
-- =============================================================================
create table if not exists public.agent_profile_revisions (
  id uuid primary key default gen_random_uuid(),
  agent_profile_id uuid not null references public.agent_profiles(id) on delete cascade,
  system_instructions text,
  behavior jsonb not null default '{}'::jsonb,
  changed_by uuid,
  created_at timestamptz not null default now()
);


-- =============================================================================
-- INDEXES
-- =============================================================================
create index if not exists idx_workspace_threads_account on public.workspace_threads(account_id);
create index if not exists idx_workspace_threads_agent_profile on public.workspace_threads(agent_profile_id);
create index if not exists idx_workspace_messages_thread on public.workspace_messages(thread_id, created_at);
create index if not exists idx_context_sources_account on public.context_sources(account_id);
create index if not exists idx_context_sources_agent_profile on public.context_sources(agent_profile_id);
create index if not exists idx_context_sources_thread on public.context_sources(thread_id);
create index if not exists idx_insights_account on public.insights(account_id, created_at desc);
create index if not exists idx_insights_severity on public.insights(severity);
create index if not exists idx_agenda_items_account on public.agenda_items(account_id, rank);
create index if not exists idx_agenda_items_status on public.agenda_items(status);
create index if not exists idx_approvals_account on public.approvals(account_id, status);
create index if not exists idx_cascades_account on public.cascades(account_id);
create index if not exists idx_cascade_steps_cascade on public.cascade_steps(cascade_id, order_group);
create index if not exists idx_cascade_runs_account on public.cascade_runs(account_id, started_at desc);
create index if not exists idx_cascade_runs_cascade on public.cascade_runs(cascade_id);
create index if not exists idx_agent_jobs_account on public.agent_jobs(account_id, status);
create index if not exists idx_agent_jobs_status on public.agent_jobs(status);
create index if not exists idx_agent_jobs_cascade_run on public.agent_jobs(cascade_run_id);
create index if not exists idx_metric_snapshots_account on public.metric_snapshots(account_id, metric_key, computed_at desc);
create index if not exists idx_agent_profile_revisions_profile on public.agent_profile_revisions(agent_profile_id, created_at desc);


-- =============================================================================
-- updated_at TRIGGERS (only tables with an updated_at column)
-- =============================================================================
do $$
declare t text;
begin
  for t in select unnest(array['agenda_items', 'cascades']) loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
