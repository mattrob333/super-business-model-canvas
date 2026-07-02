-- =============================================================================
-- PHASE 1 — work order 1.2: column additions to existing tables
-- =============================================================================
-- Applies after 20260702100000_workspace_orchestration_tables.sql because the
-- generated_reports.source_cascade_run_id FK targets cascade_runs, created in
-- that prior file.

-- ---- agent_profiles ----
alter table public.agent_profiles
  add column if not exists behavior jsonb not null default '{}'::jsonb;
alter table public.agent_profiles
  add column if not exists avatar jsonb;
comment on column public.agent_profiles.avatar is
  'Shape: {"icon": string, "accent": string} — deterministic per-agent avatar (spec 01 naming table).';

-- ---- agent_skills ----
alter table public.agent_skills
  add column if not exists orchestrator_can_trigger boolean not null default false;
alter table public.agent_skills
  add column if not exists action_kind text;
comment on column public.agent_skills.action_kind is
  'Expected values: skill | template | framework. Not enumerated at the DB level (spec 04 §5 lists it as a bare "action_kind" without a bracketed value set unlike the other new enum columns) — conservative choice, kept as free text per BUILD_PLAN Part I rule 5.';

-- ---- scheduled_loops ----
alter table public.scheduled_loops
  add column if not exists action_key text;
alter table public.scheduled_loops
  add column if not exists created_by_agent boolean not null default false;

-- ---- model_routes ----
alter table public.model_routes
  add column if not exists task_class text;
alter table public.model_routes
  add column if not exists max_tokens_in integer;
alter table public.model_routes
  add column if not exists max_tokens_out integer;
alter table public.model_routes
  add column if not exists cost_per_1k_in numeric(10,6);
alter table public.model_routes
  add column if not exists cost_per_1k_out numeric(10,6);
alter table public.model_routes
  add column if not exists eval_score numeric;
alter table public.model_routes
  add column if not exists updated_by text;
comment on column public.model_routes.updated_by is
  'Expected values: human | sweep. Kept as free text (see agent_skills.action_kind note above for the same conservative-enum rationale).';

create index if not exists idx_model_routes_task_class on public.model_routes(task_class);

-- ---- generated_reports ----
-- generated_reports today is user_id-scoped only (no account_id). We add both
-- new columns nullable, backfill account_id for existing rows, and leave the
-- column nullable afterwards (per work order 1.2's explicit instruction) since
-- a user could theoretically have zero account_members rows and would then be
-- unbackfillable — we do not want a NOT NULL constraint to fail the migration
-- in that edge case.
alter table public.generated_reports
  add column if not exists account_id uuid references public.accounts(id) on delete cascade;
alter table public.generated_reports
  add column if not exists source_cascade_run_id uuid references public.cascade_runs(id) on delete set null;

-- Backfill logic (documented per work order 1.2):
--   For each generated_reports row with account_id still NULL, look up the
--   user's account via account_members.user_id = generated_reports.user_id,
--   and take the EARLIEST-CREATED account_members row for that user (in case
--   a user belongs to multiple accounts — this is a real, if rare, case since
--   account_members has no uniqueness constraint on user_id alone). This is a
--   best-effort heuristic: a user's "first" account membership is not
--   necessarily the account the report was actually generated for, but it is
--   the most defensible default absent any other signal on the
--   generated_reports row (there is no company_id -> account_id path either,
--   since saved_analyses is also user_id-scoped, not account-scoped).
-- Any row whose user has no account_members row at all is left with
-- account_id = NULL and a NOTICE is raised (not a migration failure).
do $$
declare
  _updated_count integer;
  _unbackfilled_count integer;
begin
  update public.generated_reports gr
  set account_id = am.account_id
  from (
    select distinct on (user_id) user_id, account_id
    from public.account_members
    order by user_id, created_at asc
  ) am
  where gr.user_id = am.user_id
    and gr.account_id is null;

  get diagnostics _updated_count = row_count;

  select count(*) into _unbackfilled_count
  from public.generated_reports
  where account_id is null;

  raise notice 'generated_reports.account_id backfill: % rows updated, % rows still NULL (user has no account_members row)',
    _updated_count, _unbackfilled_count;
end $$;

create index if not exists idx_generated_reports_account on public.generated_reports(account_id);
create index if not exists idx_generated_reports_source_cascade_run on public.generated_reports(source_cascade_run_id);
