-- =============================================================================
-- Phase 1 — work order 1.6: schema verification script
-- =============================================================================
-- Run this in the Supabase SQL editor after applying migrations
--   20260702100000_workspace_orchestration_tables.sql
--   20260702100100_column_additions.sql
--   20260702100200_rls_new_tables.sql
--   20260702100300_seed_phase1.sql
--   20260702110000_agent_job_queue_locking.sql
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
    ('model_routes', 'updated_by'),
    ('agent_jobs', 'claimed_by'),
    ('agent_jobs', 'locked_at'),
    ('agent_jobs', 'heartbeat_at'),
    ('agent_jobs', 'run_after'),
    ('agent_jobs', 'max_attempts'),
    ('agent_jobs', 'last_error')
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

  select 'seed: model_routes has at least 10 task_class default rows',
         case when (
           select count(distinct task_class) from public.model_routes
           where account_id is null and task_class is not null
         ) >= 10 then 'PASS' else 'FAIL' end

  union all

  -- ---- 7. Phase 2.2 queue claim functions exist ----
  select 'function exists: claim_next_agent_job',
         case when exists (
           select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'claim_next_agent_job'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'function exists: fail_agent_job',
         case when exists (
           select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'fail_agent_job'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'index exists: idx_agent_jobs_queue_claim',
         case when exists (
           select 1 from pg_indexes
           where schemaname = 'public' and indexname = 'idx_agent_jobs_queue_claim'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'function restricted: anon cannot claim_next_agent_job',
         case when not has_function_privilege('anon', 'public.claim_next_agent_job(text, integer, integer)', 'EXECUTE')
         then 'PASS' else 'FAIL' end

  union all

  select 'function restricted: authenticated cannot claim_next_agent_job',
         case when not has_function_privilege('authenticated', 'public.claim_next_agent_job(text, integer, integer)', 'EXECUTE')
         then 'PASS' else 'FAIL' end

  union all

  select 'function restricted: anon cannot fail_agent_job',
         case when not has_function_privilege('anon', 'public.fail_agent_job(uuid, text, text)', 'EXECUTE')
         then 'PASS' else 'FAIL' end

  union all

  select 'function restricted: authenticated cannot fail_agent_job',
         case when not has_function_privilege('authenticated', 'public.fail_agent_job(uuid, text, text)', 'EXECUTE')
         then 'PASS' else 'FAIL' end

  union all

  select 'function body: claim_next_agent_job reaps final stale jobs',
         case when exists (
           select 1
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = 'claim_next_agent_job'
             and pg_get_functiondef(p.oid) like '%failed_permanent%'
             and pg_get_functiondef(p.oid) like '%attempts >= coalesce(max_attempts, p_default_max_attempts)%'
         ) then 'PASS' else 'FAIL' end

  union all

  -- ---- 8. Phase 3.1 feed registry/cache ----
  select 'table exists: data_feeds',
         case when to_regclass('public.data_feeds') is not null then 'PASS' else 'FAIL' end

  union all

  select 'table exists: feed_cache',
         case when to_regclass('public.feed_cache') is not null then 'PASS' else 'FAIL' end

  union all

  select 'enum type exists: data_feed_kind',
         case when exists (select 1 from pg_type where typname = 'data_feed_kind' and typtype = 'e')
         then 'PASS' else 'FAIL' end

  union all

  select 'enum type exists: data_feed_health',
         case when exists (select 1 from pg_type where typname = 'data_feed_health' and typtype = 'e')
         then 'PASS' else 'FAIL' end

  union all

  select 'index exists: idx_feed_cache_lookup',
         case when exists (
           select 1 from pg_indexes
           where schemaname = 'public' and indexname = 'idx_feed_cache_lookup'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'index exists: idx_scheduled_loops_action_key',
         case when exists (
           select 1 from pg_indexes
           where schemaname = 'public' and indexname = 'idx_scheduled_loops_action_key'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'seed: 6 global data feeds exist',
         case when (
           select count(distinct feed_key) from public.data_feeds
           where account_id is null
             and feed_key in ('firecrawl_scrape', 'web_search', 'fred_series', 'google_trends', 'gdelt_count', 'github_repo_stats')
         ) = 6 then 'PASS' else 'FAIL' end

  union all

  select 'seed: extract_escalated model route exists',
         case when exists (
           select 1 from public.model_routes
           where account_id is null
             and route_key = 'extract_escalated'
             and task_class = 'extract_escalated'
             and provider = 'anthropic'
             and model_name = 'claude-haiku-4-5-20251001'
         ) then 'PASS' else 'FAIL' end

  union all

  -- ---- 9. RF-3-10 staleness sweep scheduling ----
  select 'index exists: idx_scheduled_loops_account_action (unique partial)',
         case when exists (
           select 1 from pg_indexes
           where schemaname = 'public' and indexname = 'idx_scheduled_loops_account_action'
             and indexdef like '%UNIQUE%' and indexdef like '%action_key IS NOT NULL%'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'provisioning seeds the staleness_sweep loop',
         case when exists (
           select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'provision_account_defaults'
             and pg_get_functiondef(p.oid) like '%staleness_sweep%'
         ) then 'PASS' else 'FAIL' end

  union all

  -- ---- 10. Phase 4.1 competitor entities ----
  select 'table exists: companies',
         case when to_regclass('public.companies') is not null then 'PASS' else 'FAIL' end

  union all

  select 'column exists: companies.is_competitor',
         case when exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'companies' and column_name = 'is_competitor'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'column exists: canvas_section_versions.competitor_id',
         case when exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'canvas_section_versions' and column_name = 'competitor_id'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'rls enabled: companies',
         case when exists (
           select 1 from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'companies' and c.relrowsecurity
         ) then 'PASS' else 'FAIL' end

  union all

  select 'policies exist: companies account scoped',
         case when (
           select count(*) from pg_policies
           where schemaname = 'public'
             and tablename = 'companies'
             and policyname in (
               'companies_select_account',
               'companies_insert_account',
               'companies_update_account',
               'companies_delete_account'
             )
         ) = 4 then 'PASS' else 'FAIL' end

  union all

  select 'index exists: idx_csv_competitor_latest',
         case when exists (
           select 1 from pg_indexes
           where schemaname = 'public' and indexname = 'idx_csv_competitor_latest'
             and indexdef like '%competitor_id%'
         ) then 'PASS' else 'FAIL' end

  union all

  -- ---- 11. Phase 4.3 competitor gap engine ----
  select 'column exists: gaps.competitor_id',
         case when exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'gaps' and column_name = 'competitor_id'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'enum value exists: gap_type.competitive',
         case when exists (
           select 1 from pg_enum e
           join pg_type t on t.oid = e.enumtypid
           where t.typname = 'gap_type' and e.enumlabel = 'competitive'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'enum value exists: gap_status.superseded',
         case when exists (
           select 1 from pg_enum e
           join pg_type t on t.oid = e.enumtypid
           where t.typname = 'gap_status' and e.enumlabel = 'superseded'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'column exists: gaps.score',
         case when exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'gaps' and column_name = 'score'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'column exists: gaps.score_inputs',
         case when exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'gaps' and column_name = 'score_inputs'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'index exists: idx_gaps_competitor',
         case when exists (
           select 1 from pg_indexes
           where schemaname = 'public' and indexname = 'idx_gaps_competitor'
             and indexdef like '%competitor_id%'
         ) then 'PASS' else 'FAIL' end

  union all

  -- ---- 12. Phase 5A knowledge stack ----
  select 'table exists: watched_sources',
         case when to_regclass('public.watched_sources') is not null then 'PASS' else 'FAIL' end

  union all

  select 'table exists: founder_documents',
         case when to_regclass('public.founder_documents') is not null then 'PASS' else 'FAIL' end

  union all

  select 'table exists: agent_documents',
         case when to_regclass('public.agent_documents') is not null then 'PASS' else 'FAIL' end

  union all

  select 'table exists: agent_document_revisions',
         case when to_regclass('public.agent_document_revisions') is not null then 'PASS' else 'FAIL' end

  union all

  select 'table exists: owner_questions',
         case when to_regclass('public.owner_questions') is not null then 'PASS' else 'FAIL' end

  union all

  select 'rls enabled: Phase 5A account-scoped tables',
         case when (
           select count(*) from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public'
             and c.relname in ('watched_sources', 'founder_documents', 'agent_documents', 'agent_document_revisions', 'owner_questions')
             and c.relrowsecurity
         ) = 5 then 'PASS' else 'FAIL' end

  union all

  select 'trigger exists: enforce_owner_question_open_limit',
         case when exists (
           select 1 from pg_trigger
           where tgname = 'enforce_owner_question_open_limit'
             and tgrelid = 'public.owner_questions'::regclass
             and not tgisinternal
         ) then 'PASS' else 'FAIL' end

  union all

  select 'column exists: canvas_section_versions.groundedness_score',
         case when exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'canvas_section_versions' and column_name = 'groundedness_score'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'column exists: canvas_section_versions.groundedness_inputs',
         case when exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'canvas_section_versions' and column_name = 'groundedness_inputs'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'column exists: companies.logo_url',
         case when exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'companies' and column_name = 'logo_url'
         ) then 'PASS' else 'FAIL' end

  union all

  select 'enum type exists: owner_question_status',
         case when exists (select 1 from pg_type where typname = 'owner_question_status' and typtype = 'e')
         then 'PASS' else 'FAIL' end

  union all

  select 'storage bucket exists: founder-documents',
         case when exists (
           select 1 from storage.buckets
           where id = 'founder-documents' and public = false
         ) then 'PASS' else 'FAIL' end

  union all

  select 'storage policies exist: founder documents',
         case when (
           select count(*) from pg_policies
           where schemaname = 'storage'
             and tablename = 'objects'
             and policyname in (
               'founder_documents_storage_select',
               'founder_documents_storage_insert',
               'founder_documents_storage_update',
               'founder_documents_storage_delete'
             )
         ) = 4 then 'PASS' else 'FAIL' end

  union all

  select 'seed: Phase 5A model routes exist',
         case when (
           select count(distinct task_class) from public.model_routes
           where account_id is null
             and task_class in ('onboarding_extract', 'dossier_refresh', 'summary_update', 'summary_update_escalated', 'grounding_suggest', 'skill_run')
         ) = 6 then 'PASS' else 'FAIL' end

  union all

  select 'skill catalog seeded: 27 skills, pricing_teardown implemented',
         case when (select count(*) from public.skill_catalog) >= 27
           and exists (select 1 from public.skill_catalog where skill_key = 'yield.pricing_teardown' and implemented = true)
         then 'PASS' else 'FAIL' end

  union all

  select 'table exists with RLS: skill_artifacts',
         case when exists (
           select 1 from pg_tables pt join pg_class c on c.relname = pt.tablename
           where pt.schemaname = 'public' and pt.tablename = 'skill_artifacts' and c.relrowsecurity = true
         ) then 'PASS' else 'FAIL' end

  union all

  select 'table exists with RLS: grounding_suggestions',
         case when exists (
           select 1 from pg_tables pt
           join pg_class c on c.relname = pt.tablename
           where pt.schemaname = 'public' and pt.tablename = 'grounding_suggestions'
             and c.relrowsecurity = true
         ) then 'PASS' else 'FAIL' end

)
select check_name, status from checks order by
  case status when 'FAIL' then 0 else 1 end,  -- surface failures first
  check_name;
