-- =============================================================================
-- Phase 1 — work order 1.6: schema verification script
-- =============================================================================
-- Run this in the Supabase SQL editor after applying migrations
--   20260702100000_workspace_orchestration_tables.sql
--   20260702100100_column_additions.sql
--   20260702100200_rls_new_tables.sql
--   20260702100300_seed_phase1.sql
-- It asserts (via information_schema / pg_catalog) that every new table
-- exists, every new column exists on the altered tables, and every new
-- table has RLS enabled with at least one policy. Prints one PASS/FAIL row
-- per assertion — read top to bottom, any FAIL means the migration didn't
-- apply as expected.

with checks as (

  -- ---- 1. new tables exist ----
  select 'table exists: ' || t as check_name,
         case when exists (
           select 1 from information_schema.tables
           where table_schema = 'public' and table_name = t
         ) then 'PASS' else 'FAIL' end as status
  from unnest(array[
    'workspace_threads', 'workspace_messages', 'context_sources',
    'insights', 'agenda_items', 'approvals', 'agent_jobs',
    'cascades', 'cascade_steps', 'cascade_runs',
    'metric_snapshots', 'agent_profile_revisions'
  ]) as t

  union all

  -- ---- 2. new columns exist on altered tables ----
  select 'column exists: ' || tbl || '.' || col,
         case when exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = tbl and column_name = col
         ) then 'PASS' else 'FAIL' end
  from (values
    ('agent_profiles', 'behavior'),
    ('agent_profiles', 'avatar'),
    ('agent_skills', 'orchestrator_can_trigger'),
    ('agent_skills', 'action_kind'),
    ('scheduled_loops', 'action_key'),
    ('scheduled_loops', 'created_by_agent'),
    ('generated_reports', 'account_id'),
    ('generated_reports', 'source_cascade_run_id'),
    ('model_routes', 'task_class'),
    ('model_routes', 'max_tokens_in'),
    ('model_routes', 'max_tokens_out'),
    ('model_routes', 'cost_per_1k_in'),
    ('model_routes', 'cost_per_1k_out'),
    ('model_routes', 'eval_score'),
    ('model_routes', 'updated_by')
  ) as cols(tbl, col)

  union all

  -- ---- 3. RLS enabled on every new table ----
  select 'RLS enabled: ' || t,
         case when exists (
           select 1 from pg_tables pt
           join pg_class c on c.relname = pt.tablename
           where pt.schemaname = 'public' and pt.tablename = t
             and c.relrowsecurity = true
         ) then 'PASS' else 'FAIL' end
  from unnest(array[
    'workspace_threads', 'workspace_messages', 'context_sources',
    'insights', 'agenda_items', 'approvals', 'agent_jobs',
    'cascades', 'cascade_steps', 'cascade_runs',
    'metric_snapshots', 'agent_profile_revisions'
  ]) as t

  union all

  -- ---- 4. at least one RLS policy exists per new table ----
  select 'has RLS policy: ' || t,
         case when exists (
           select 1 from pg_policies
           where schemaname = 'public' and tablename = t
         ) then 'PASS' else 'FAIL' end
  from unnest(array[
    'workspace_threads', 'workspace_messages', 'context_sources',
    'insights', 'agenda_items', 'approvals', 'agent_jobs',
    'cascades', 'cascade_steps', 'cascade_runs',
    'metric_snapshots', 'agent_profile_revisions'
  ]) as t

  union all

  -- ---- 5. new enum types exist ----
  select 'enum type exists: ' || e,
         case when exists (
           select 1 from pg_type where typname = e and typtype = 'e'
         ) then 'PASS' else 'FAIL' end
  from unnest(array[
    'workspace_message_kind', 'context_source_type', 'insight_severity',
    'agenda_item_status', 'approval_kind', 'approval_status', 'cascade_run_status'
  ]) as e

  union all

  -- ---- 6. seed data sanity (Phase 1.4) ----
  select 'seed: 10 template agent_profiles have avatar set',
         case when (
           select count(*) from public.agent_profiles
           where account_id is null and avatar is not null
         ) = 10 then 'PASS' else 'FAIL' end

  union all

  select 'seed: 7 template cascades exist',
         case when (
           select count(*) from public.cascades where account_id is null
         ) = 7 then 'PASS' else 'FAIL' end

  union all

  select 'seed: cascade_steps rows exist for template cascades',
         case when exists (
           select 1 from public.cascade_steps cs
           join public.cascades c on c.id = cs.cascade_id
           where c.account_id is null
         ) then 'PASS' else 'FAIL' end

  union all

  select 'seed: model_routes has 9 task_class default rows',
         case when (
           select count(distinct task_class) from public.model_routes
           where account_id is null and task_class is not null
         ) = 9 then 'PASS' else 'FAIL' end

)
select check_name, status from checks order by
  case status when 'FAIL' then 0 else 1 end,  -- surface failures first
  check_name;
