-- =============================================================================
-- SUPER BMC — CONSOLIDATED DATABASE SCHEMA (rebuild-from-zero)
-- =============================================================================
--
-- HOW TO USE THIS FILE
--   1. Open your Supabase project -> SQL Editor -> New query.
--   2. Paste this entire file and click "Run".
--   3. Then paste + run  supabase/seed_frameworks.sql  (loads the 10 default
--      strategy frameworks / "skills").
--   4. Set your edge-function secrets and deploy functions (see supabase/SETUP.md).
--   5. Sign up once in the app — the first login auto-provisions your personal
--      account, clones the agent profiles, and copies the model routes.
--
-- This script is IDEMPOTENT: it is safe to run more than once. It uses
-- "create ... if not exists", guarded enum creation, "create or replace" for
-- functions, and "drop policy if exists" before each policy.
--
-- BUILD ORDER
--   1. Extensions
--   2. Enums
--   3. set_updated_at() trigger helper (no table dependencies)
--   4. Core auth/user tables (profiles, user_roles, leads)
--   5. has_role() — after user_roles (Postgres validates SQL function bodies)
--   6. Multi-tenant root (accounts, account_members)
--   7. is_account_member() — after account_members
--   6. Business data (saved_analyses, context versions, canvas, evidence, gaps)
--   7. Skill registry (frameworks) + reports + coaching sessions
--   8. Agent framework (agent_profiles, agent_runs, loops, credentials, mcp)
--   9. Agent-RPA additions (model_routes, agent_skills, skills view)
--  10. Foreign keys + composite indexes (optimizations)
--  11. updated_at triggers
--  12. Provisioning (handle_new_user + provision_account_defaults + trigger)
--  13. Row Level Security (enable + policies)
--  14. Seeds (10 template agent profiles, 5 global model routes)
--  15. Workspace & orchestration (Phase 1 -- workspace/context/insight/agenda/
--      approval/job/cascade/metric/revision tables, RLS, seeds)
--  16. Drop dead/legacy tables
-- =============================================================================


-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================
create extension if not exists "pgcrypto";


-- =============================================================================
-- 2. ENUMS  (guarded so re-runs don't error)
-- =============================================================================
do $$ begin create type public.app_role as enum ('admin', 'user'); exception when duplicate_object then null; end $$;
do $$ begin create type public.framework_status as enum ('draft', 'active', 'archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.account_member_role as enum ('owner', 'admin', 'editor', 'viewer'); exception when duplicate_object then null; end $$;
do $$ begin create type public.agent_type as enum ('orchestrator', 'section_agent', 'utility', 'custom'); exception when duplicate_object then null; end $$;
do $$ begin create type public.agent_status as enum ('active', 'paused', 'draft', 'archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.agent_run_status as enum ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout'); exception when duplicate_object then null; end $$;
do $$ begin create type public.agent_run_trigger as enum ('manual', 'scheduled', 'api', 'cascade', 'retry'); exception when duplicate_object then null; end $$;
do $$ begin create type public.gap_severity as enum ('critical', 'high', 'medium', 'low'); exception when duplicate_object then null; end $$;
do $$ begin create type public.gap_status as enum ('open', 'acknowledged', 'in_progress', 'resolved', 'wont_fix', 'superseded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.gap_type as enum ('missing_data', 'low_confidence', 'no_evidence', 'outdated', 'contradictory', 'assumption', 'competitive'); exception when duplicate_object then null; end $$;
do $$ begin create type public.credential_status as enum ('active', 'revoked', 'expired', 'untested'); exception when duplicate_object then null; end $$;
do $$ begin create type public.mcp_transport_type as enum ('stdio', 'http', 'sse', 'websocket'); exception when duplicate_object then null; end $$;
do $$ begin create type public.mcp_server_status as enum ('connected', 'disconnected', 'error', 'untested'); exception when duplicate_object then null; end $$;
do $$ begin create type public.loop_status as enum ('active', 'paused', 'error', 'exhausted_budget', 'exhausted_failures'); exception when duplicate_object then null; end $$;
do $$ begin create type public.freshness_status as enum ('fresh', 'stale', 'outdated', 'unverified'); exception when duplicate_object then null; end $$;
do $$ begin create type public.evidence_source_type as enum ('website', 'filing', 'news', 'transcript', 'social', 'api', 'document', 'manual'); exception when duplicate_object then null; end $$;


-- =============================================================================
-- 3. TRIGGER HELPER (no table dependencies)
-- =============================================================================

-- Generic trigger to keep updated_at fresh on UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- 4. CORE AUTH / USER TABLES
-- =============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- Checks whether a user has a given role. Must be created AFTER user_roles
-- because Postgres validates SQL function bodies at create time.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);


-- =============================================================================
-- 5. MULTI-TENANT ROOT
-- =============================================================================

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  runtime_config jsonb default '{}'::jsonb,
  brand_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.accounts.runtime_config is
  'Persisted AgentRuntime config (maxConcurrentRuns, executionTimeoutMinutes, loggingVerbosity, agentLifecyclePolicy, sandboxEnabled). Managed in Settings > Hermes Runtime.';

create table if not exists public.account_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null,
  role public.account_member_role not null default 'editor',
  created_at timestamptz not null default now()
);

-- Checks whether the CURRENT user is a member of the given account. Must be
-- created AFTER account_members for the same reason as has_role().
create or replace function public.is_account_member(_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.account_members
    where account_id = _account_id and user_id = auth.uid()
  );
$$;


-- =============================================================================
-- 6. BUSINESS DATA
-- =============================================================================

create table if not exists public.saved_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  analysis_data jsonb not null,
  created_at timestamptz default now()
);

create table if not exists public.business_context_versions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  source_analysis_id uuid,
  version_number integer not null default 1,
  summary text,
  company_name text,
  website text,
  industry text,
  data jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  website_url text,
  description text,
  industry text,
  is_competitor boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.canvas_section_versions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  business_context_version_id uuid not null references public.business_context_versions(id) on delete cascade,
  competitor_id uuid references public.companies(id) on delete cascade,
  section_key text not null,
  section_title text,
  items jsonb not null default '[]'::jsonb,
  notes text,
  confidence numeric(3,2),
  freshness_status public.freshness_status not null default 'unverified',
  last_verified_at timestamptz,
  created_by_agent_profile_id uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  source_type public.evidence_source_type not null default 'manual',
  source_name text,
  source_url text,
  source_date date,
  retrieved_at timestamptz not null default now(),
  title text not null,
  excerpt text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_agent_run_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.gaps (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  competitor_id uuid references public.companies(id) on delete cascade,
  title text not null,
  description text,
  gap_type public.gap_type not null default 'missing_data',
  severity public.gap_severity not null default 'medium',
  score numeric(6,2),
  score_inputs jsonb not null default '{}'::jsonb,
  formula_version text,
  impact text,
  effort text,
  confidence numeric(3,2),
  status public.gap_status not null default 'open',
  affected_sections text[] not null default '{}',
  evidence_ids uuid[] not null default '{}',
  recommended_action text,
  created_by_agent_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- =============================================================================
-- 7. SKILL REGISTRY (frameworks) + REPORTS + COACHING
-- =============================================================================

-- frameworks IS the skill registry. Each row is a callable "skill" for an agent
-- (system_prompt + analysis_prompt + response_schema + model config).
create table if not exists public.frameworks (
  id uuid primary key default gen_random_uuid(),
  title varchar(255) not null,
  shortcut varchar(50) unique not null,
  description text,
  category varchar(100),
  tags text[],
  status public.framework_status default 'draft',
  stages text[],
  departments text[],
  goal_alignment text[],
  when_to_use text,
  upstream_frameworks uuid[],
  downstream_frameworks uuid[],
  ai_model varchar(100) default 'google/gemini-2.5-flash',
  system_prompt text,
  analysis_prompt text not null,
  response_schema jsonb,
  max_tokens integer default 4000,
  temperature numeric(2,1) default 0.7,
  estimated_time integer default 15,
  template_type varchar(50) default 'html',
  layout_style varchar(50),
  output_template text not null,
  custom_css text,
  requires_business_context boolean default true,
  validate_json boolean default true,
  required_upstream uuid[],
  show_in_playbooks boolean default true,
  allow_manual_edit boolean default true,
  allow_pdf_export boolean default true,
  icon varchar(50),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  usage_count integer default 0,
  version integer default 1,
  parent_version uuid references public.frameworks(id)
);

create table if not exists public.generated_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid not null references public.saved_analyses(id) on delete cascade,
  -- framework_id now references the live frameworks table (was the old
  -- strategic_frameworks varchar id, which is being dropped).
  framework_id uuid references public.frameworks(id) on delete set null,
  company_name varchar(255) not null,
  report_content text not null,
  business_context jsonb not null,
  strategic_goal text,
  version integer default 1,
  status varchar(20) default 'draft',
  report_format varchar(20) default 'markdown',
  is_edited boolean default false,
  original_content text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.strategy_coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.saved_analyses(id),
  company_name text,
  initial_prompt text,
  messages jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


-- =============================================================================
-- 8. AGENT FRAMEWORK
-- =============================================================================

create table if not exists public.agent_profiles (
  id uuid primary key default gen_random_uuid(),
  -- account_id NULL = global "template" profile (used as a source to clone from
  -- during account provisioning). Real, editable profiles are account-scoped.
  account_id uuid references public.accounts(id) on delete cascade,
  agent_key text not null,
  display_name text not null,
  agent_type public.agent_type not null default 'section_agent',
  description text,
  assigned_sections text[] not null default '{}',
  model_route_key text,
  allowed_mcp_server_ids uuid[] not null default '{}',
  status public.agent_status not null default 'draft',
  system_instructions_summary text,
  system_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_profile_id uuid not null references public.agent_profiles(id) on delete cascade,
  run_type text,
  trigger_type public.agent_run_trigger not null default 'manual',
  triggered_by uuid,
  status public.agent_run_status not null default 'pending',
  input jsonb,
  output jsonb,
  summary text,
  model_provider text,
  model_name text,
  tokens_in integer,
  tokens_out integer,
  estimated_cost numeric(10,4),
  -- created_at gives a stable ordering key for the activity feed even before a
  -- run has started_at set.
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error text
);

create table if not exists public.scheduled_loops (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_profile_id uuid not null references public.agent_profiles(id) on delete cascade,
  loop_name text not null,
  schedule text not null,
  skill_ids text[] not null default '{}',
  prompt_template text,
  max_runtime_minutes integer not null default 30,
  max_consecutive_failures integer not null default 3,
  monthly_budget numeric(10,2),
  allowed_mcp_server_ids uuid[] not null default '{}',
  status public.loop_status not null default 'active',
  last_run_at timestamptz,
  next_run_at timestamptz,
  failure_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null,
  label text,
  encrypted_secret text not null,
  secret_last_four text,
  status public.credential_status not null default 'untested',
  validated_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  transport_type public.mcp_transport_type not null default 'stdio',
  command text,
  args jsonb not null default '[]'::jsonb,
  url text,
  headers_encrypted jsonb,
  env_encrypted jsonb,
  auth_type text,
  enabled boolean not null default false,
  status public.mcp_server_status not null default 'untested',
  last_tested_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mcp_server_tools (
  id uuid primary key default gen_random_uuid(),
  mcp_server_id uuid not null references public.mcp_servers(id) on delete cascade,
  tool_name text not null,
  description text,
  enabled boolean not null default true,
  risk_level text not null default 'medium',
  last_discovered_at timestamptz,
  created_at timestamptz not null default now()
);


-- =============================================================================
-- 9. AGENT-RPA ADDITIONS: model_routes, agent_skills, skills view
-- =============================================================================

-- model_routes replaces the hardcoded provider/model map. account_id NULL rows
-- are global defaults; provisioning copies them into each new account so users
-- can customize routing per workspace (e.g. point "premium" at an OpenRouter
-- model). agent_profiles.model_route_key references route_key here.
create table if not exists public.model_routes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  route_key text not null,          -- premium / standard / economy / local / custom-*
  label text not null,
  provider text not null,           -- openai / anthropic / openrouter / xai / local
  model_name text not null,
  params jsonb not null default '{}'::jsonb,   -- {temperature, max_tokens, ...}
  fallback_route_key text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, route_key)
);

-- agent_skills: which frameworks (skills) each agent profile is allowed to call.
create table if not exists public.agent_skills (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_profile_id uuid not null references public.agent_profiles(id) on delete cascade,
  framework_id uuid not null references public.frameworks(id) on delete cascade,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (agent_profile_id, framework_id)
);

-- skills: unified read model for the agent runtime. Today it projects active
-- frameworks; later it can UNION other skill kinds (MCP tools, etc.) without
-- breaking callers. security_invoker makes it respect the querying user's RLS
-- on frameworks.
create or replace view public.skills
with (security_invoker = on)
as
  select
    id,
    'framework'::text as kind,
    shortcut          as skill_key,
    title             as name,
    description,
    when_to_use,
    system_prompt,
    analysis_prompt,
    response_schema,
    ai_model,
    max_tokens,
    temperature
  from public.frameworks
  where status = 'active';


-- =============================================================================
-- 10. FOREIGN KEYS + COMPOSITE INDEXES (optimizations)
-- =============================================================================

-- One profile per (account, agent_key) so cloning defaults is idempotent and
-- an account can't accumulate duplicate agents.
do $$ begin
  alter table public.agent_profiles
    add constraint agent_profiles_account_agent_key_unique
    unique (account_id, agent_key);
exception when duplicate_object then null; end $$;

-- Partial unique indexes for the GLOBAL (account_id IS NULL) template rows.
-- A plain UNIQUE(account_id, ...) treats NULLs as distinct, so it would NOT
-- stop the seeds below from inserting duplicate templates on re-run. These
-- partial indexes make the global seeds idempotent.
create unique index if not exists agent_profiles_global_key_unique
  on public.agent_profiles(agent_key) where account_id is null;
create unique index if not exists model_routes_global_key_unique
  on public.model_routes(route_key) where account_id is null;

-- Late-bound FKs (targets are created after the referencing tables above).
do $$ begin
  alter table public.canvas_section_versions
    add constraint canvas_section_versions_created_by_agent_profile_id_fkey
    foreign key (created_by_agent_profile_id)
    references public.agent_profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.evidence_items
    add constraint evidence_items_created_by_agent_run_id_fkey
    foreign key (created_by_agent_run_id)
    references public.agent_runs(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.gaps
    add constraint gaps_created_by_agent_run_id_fkey
    foreign key (created_by_agent_run_id)
    references public.agent_runs(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Single-column indexes
create index if not exists idx_account_members_account on public.account_members(account_id);
create index if not exists idx_account_members_user on public.account_members(user_id);
create index if not exists idx_bcv_account on public.business_context_versions(account_id);
create index if not exists idx_companies_account_competitor on public.companies(account_id, is_competitor, name);
create index if not exists idx_csv_account on public.canvas_section_versions(account_id);
create index if not exists idx_csv_context on public.canvas_section_versions(business_context_version_id);
create index if not exists idx_csv_section_key on public.canvas_section_versions(section_key);
create index if not exists idx_evidence_account on public.evidence_items(account_id);
create index if not exists idx_gaps_account on public.gaps(account_id);
create index if not exists idx_gaps_competitor
  on public.gaps(account_id, competitor_id, status, created_at desc)
  where competitor_id is not null;
create index if not exists idx_gaps_status on public.gaps(status);
create index if not exists idx_agent_profiles_account on public.agent_profiles(account_id);
create index if not exists idx_agent_profiles_key on public.agent_profiles(agent_key);
create index if not exists idx_agent_runs_account on public.agent_runs(account_id);
create index if not exists idx_agent_runs_profile on public.agent_runs(agent_profile_id);
create index if not exists idx_agent_runs_status on public.agent_runs(status);
create index if not exists idx_scheduled_loops_account on public.scheduled_loops(account_id);
create index if not exists idx_scheduled_loops_status on public.scheduled_loops(status);
create index if not exists idx_provider_credentials_account on public.provider_credentials(account_id);
create index if not exists idx_mcp_servers_account on public.mcp_servers(account_id);
create index if not exists idx_mcp_server_tools_server on public.mcp_server_tools(mcp_server_id);
create index if not exists idx_frameworks_shortcut on public.frameworks(shortcut);
create index if not exists idx_frameworks_category on public.frameworks(category);
create index if not exists idx_frameworks_status on public.frameworks(status);
create index if not exists idx_frameworks_tags on public.frameworks using gin(tags);
create index if not exists idx_reports_user on public.generated_reports(user_id);
create index if not exists idx_reports_company on public.generated_reports(company_id);
create index if not exists idx_reports_framework on public.generated_reports(framework_id);
create index if not exists idx_coaching_user on public.strategy_coaching_sessions(user_id);
create index if not exists idx_coaching_company on public.strategy_coaching_sessions(company_id);
create index if not exists idx_model_routes_account on public.model_routes(account_id);
create index if not exists idx_agent_skills_account on public.agent_skills(account_id);
create index if not exists idx_agent_skills_agent on public.agent_skills(agent_profile_id);
create index if not exists idx_agent_skills_framework on public.agent_skills(framework_id);
create index if not exists idx_leads_email on public.leads(email);
create unique index if not exists idx_companies_account_website
  on public.companies(account_id, lower(website_url))
  where website_url is not null;

-- Composite indexes for hot read paths
create index if not exists idx_csv_latest_per_section
  on public.canvas_section_versions(account_id, section_key, created_at desc);
create index if not exists idx_csv_competitor_latest
  on public.canvas_section_versions(account_id, competitor_id, section_key, created_at desc)
  where competitor_id is not null;
create index if not exists idx_agent_runs_feed
  on public.agent_runs(account_id, created_at desc);


-- =============================================================================
-- 11. updated_at TRIGGERS
-- =============================================================================
do $$
declare t text;
begin
  for t in select unnest(array[
    'accounts', 'gaps', 'agent_profiles', 'scheduled_loops',
    'provider_credentials', 'mcp_servers', 'frameworks',
    'generated_reports', 'strategy_coaching_sessions', 'model_routes'
  ]) loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;


-- =============================================================================
-- 12. PROVISIONING
-- =============================================================================

-- Clones the global template agent profiles into an account and copies the
-- global model routes. Runs as SECURITY DEFINER so it bypasses RLS while
-- setting up a brand-new workspace.
create or replace function public.provision_account_defaults(_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Clone the 10 template agents (account_id IS NULL) into this account.
  insert into public.agent_profiles (
    account_id, agent_key, display_name, agent_type, description,
    assigned_sections, model_route_key, status,
    system_instructions_summary, system_instructions
  )
  select
    _account_id, agent_key, display_name, agent_type, description,
    assigned_sections, model_route_key, status,
    system_instructions_summary, system_instructions
  from public.agent_profiles
  where account_id is null
  on conflict (account_id, agent_key) do nothing;

  -- Copy global model routes (account_id IS NULL) into this account.
  insert into public.model_routes (
    account_id, route_key, label, provider, model_name, params,
    fallback_route_key, is_default
  )
  select
    _account_id, route_key, label, provider, model_name, params,
    fallback_route_key, is_default
  from public.model_routes
  where account_id is null
  on conflict (account_id, route_key) do nothing;

  -- Default weekly canvas staleness sweep (Mondays 06:00 UTC), owned by the
  -- account's orchestrator. The loop tick enqueues a staleness_sweep worker job.
  insert into public.scheduled_loops (
    account_id, agent_profile_id, loop_name, schedule, action_key, status
  )
  select
    _account_id, p.id, 'Canvas staleness sweep', '0 6 * * 1', 'staleness_sweep', 'active'
  from public.agent_profiles p
  where p.account_id = _account_id and p.agent_key = 'orchestrator'
  on conflict (account_id, action_key) where action_key is not null do nothing;
end;
$$;

-- Runs on every new auth.users row: create profile, personal account, owner
-- membership, then provision the account's default agents + routes.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _account_id uuid;
begin
  -- 1. Profile
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  -- 2. Personal account
  insert into public.accounts (name)
  values (coalesce(split_part(new.email, '@', 1), 'My Workspace') || '''s Workspace')
  returning id into _account_id;

  -- 3. Owner membership
  insert into public.account_members (account_id, user_id, role)
  values (_account_id, new.id, 'owner');

  -- 4. Clone default agents + model routes into the new account
  perform public.provision_account_defaults(_account_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================================
-- 13. ROW LEVEL SECURITY
-- =============================================================================

alter table public.profiles                    enable row level security;
alter table public.user_roles                  enable row level security;
alter table public.leads                        enable row level security;
alter table public.accounts                     enable row level security;
alter table public.account_members              enable row level security;
alter table public.saved_analyses              enable row level security;
alter table public.business_context_versions    enable row level security;
alter table public.companies                    enable row level security;
alter table public.canvas_section_versions      enable row level security;
alter table public.evidence_items               enable row level security;
alter table public.gaps                         enable row level security;
alter table public.frameworks                   enable row level security;
alter table public.generated_reports            enable row level security;
alter table public.strategy_coaching_sessions   enable row level security;
alter table public.agent_profiles               enable row level security;
alter table public.agent_runs                   enable row level security;
alter table public.scheduled_loops              enable row level security;
alter table public.provider_credentials         enable row level security;
alter table public.mcp_servers                  enable row level security;
alter table public.mcp_server_tools             enable row level security;
alter table public.model_routes                 enable row level security;
alter table public.agent_skills                 enable row level security;

-- ---- profiles ----
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);

-- ---- user_roles ----
drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user_roles_admin_insert" on public.user_roles;
create policy "user_roles_admin_insert" on public.user_roles
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "user_roles_admin_update" on public.user_roles;
create policy "user_roles_admin_update" on public.user_roles
  for update to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "user_roles_admin_delete" on public.user_roles;
create policy "user_roles_admin_delete" on public.user_roles
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ---- leads ----
drop policy if exists "leads_public_insert" on public.leads;
create policy "leads_public_insert" on public.leads
  for insert with check (true);

drop policy if exists "leads_admin_select" on public.leads;
create policy "leads_admin_select" on public.leads
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "leads_admin_update" on public.leads;
create policy "leads_admin_update" on public.leads
  for update to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "leads_admin_delete" on public.leads;
create policy "leads_admin_delete" on public.leads
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ---- accounts ----
drop policy if exists "accounts_select_member" on public.accounts;
create policy "accounts_select_member" on public.accounts
  for select to authenticated using (public.is_account_member(id));

drop policy if exists "accounts_insert_authenticated" on public.accounts;
create policy "accounts_insert_authenticated" on public.accounts
  for insert to authenticated with check (true);

drop policy if exists "accounts_update_member" on public.accounts;
create policy "accounts_update_member" on public.accounts
  for update to authenticated
  using (public.is_account_member(id))
  with check (public.is_account_member(id));

-- ---- account_members ----
-- NOTE: policies here are intentionally based on the user's own row (not
-- is_account_member) to avoid recursion (is_account_member reads this table).
drop policy if exists "account_members_select_own" on public.account_members;
create policy "account_members_select_own" on public.account_members
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "account_members_insert_own" on public.account_members;
create policy "account_members_insert_own" on public.account_members
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "account_members_update_own" on public.account_members;
create policy "account_members_update_own" on public.account_members
  for update to authenticated using (user_id = auth.uid());

-- ---- saved_analyses (per-user) ----
drop policy if exists "saved_analyses_select_own" on public.saved_analyses;
create policy "saved_analyses_select_own" on public.saved_analyses
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "saved_analyses_insert_own" on public.saved_analyses;
create policy "saved_analyses_insert_own" on public.saved_analyses
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "saved_analyses_update_own" on public.saved_analyses;
create policy "saved_analyses_update_own" on public.saved_analyses
  for update to authenticated using (auth.uid() = user_id);

drop policy if exists "saved_analyses_delete_own" on public.saved_analyses;
create policy "saved_analyses_delete_own" on public.saved_analyses
  for delete to authenticated using (auth.uid() = user_id);

-- ---- account-scoped tables (SELECT/INSERT/UPDATE via is_account_member) ----
do $$
declare t text;
begin
  for t in select unnest(array[
    'business_context_versions', 'companies', 'canvas_section_versions',
    'evidence_items', 'gaps', 'agent_runs', 'scheduled_loops', 'agent_skills'
  ]) loop
    execute format('drop policy if exists "%s_select_account" on public.%I', t, t);
    execute format(
      'create policy "%s_select_account" on public.%I
         for select to authenticated using (public.is_account_member(account_id))', t, t);

    execute format('drop policy if exists "%s_insert_account" on public.%I', t, t);
    execute format(
      'create policy "%s_insert_account" on public.%I
         for insert to authenticated with check (public.is_account_member(account_id))', t, t);

    execute format('drop policy if exists "%s_update_account" on public.%I', t, t);
    execute format(
      'create policy "%s_update_account" on public.%I
         for update to authenticated using (public.is_account_member(account_id))', t, t);

    execute format('drop policy if exists "%s_delete_account" on public.%I', t, t);
    execute format(
      'create policy "%s_delete_account" on public.%I
         for delete to authenticated using (public.is_account_member(account_id))', t, t);
  end loop;
end $$;

-- ---- agent_profiles (account rows + globally-readable templates) ----
drop policy if exists "agent_profiles_select" on public.agent_profiles;
create policy "agent_profiles_select" on public.agent_profiles
  for select to authenticated
  using (account_id is null or public.is_account_member(account_id));

drop policy if exists "agent_profiles_insert" on public.agent_profiles;
create policy "agent_profiles_insert" on public.agent_profiles
  for insert to authenticated with check (public.is_account_member(account_id));

drop policy if exists "agent_profiles_update" on public.agent_profiles;
create policy "agent_profiles_update" on public.agent_profiles
  for update to authenticated using (public.is_account_member(account_id));

drop policy if exists "agent_profiles_delete" on public.agent_profiles;
create policy "agent_profiles_delete" on public.agent_profiles
  for delete to authenticated using (public.is_account_member(account_id));

-- ---- provider_credentials / mcp_servers (full CRUD via is_account_member) ----
do $$
declare t text;
begin
  for t in select unnest(array['provider_credentials', 'mcp_servers']) loop
    execute format('drop policy if exists "%s_select_account" on public.%I', t, t);
    execute format(
      'create policy "%s_select_account" on public.%I
         for select to authenticated using (public.is_account_member(account_id))', t, t);
    execute format('drop policy if exists "%s_insert_account" on public.%I', t, t);
    execute format(
      'create policy "%s_insert_account" on public.%I
         for insert to authenticated with check (public.is_account_member(account_id))', t, t);
    execute format('drop policy if exists "%s_update_account" on public.%I', t, t);
    execute format(
      'create policy "%s_update_account" on public.%I
         for update to authenticated using (public.is_account_member(account_id))', t, t);
    execute format('drop policy if exists "%s_delete_account" on public.%I', t, t);
    execute format(
      'create policy "%s_delete_account" on public.%I
         for delete to authenticated using (public.is_account_member(account_id))', t, t);
  end loop;
end $$;

-- ---- mcp_server_tools (inherit access from parent server's account) ----
drop policy if exists "mcp_server_tools_all_account" on public.mcp_server_tools;
create policy "mcp_server_tools_all_account" on public.mcp_server_tools
  for all to authenticated
  using (
    exists (
      select 1 from public.mcp_servers ms
      where ms.id = mcp_server_id and public.is_account_member(ms.account_id)
    )
  )
  with check (
    exists (
      select 1 from public.mcp_servers ms
      where ms.id = mcp_server_id and public.is_account_member(ms.account_id)
    )
  );

-- ---- frameworks (public read of active; admin write) ----
drop policy if exists "frameworks_select" on public.frameworks;
create policy "frameworks_select" on public.frameworks
  for select using (status = 'active' or auth.uid() = created_by or public.has_role(auth.uid(), 'admin'));

drop policy if exists "frameworks_admin_insert" on public.frameworks;
create policy "frameworks_admin_insert" on public.frameworks
  for insert with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "frameworks_admin_update" on public.frameworks;
create policy "frameworks_admin_update" on public.frameworks
  for update using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "frameworks_admin_delete" on public.frameworks;
create policy "frameworks_admin_delete" on public.frameworks
  for delete using (public.has_role(auth.uid(), 'admin'));

-- ---- generated_reports (per-user) ----
drop policy if exists "reports_select_own" on public.generated_reports;
create policy "reports_select_own" on public.generated_reports
  for select using (auth.uid() = user_id);

drop policy if exists "reports_insert_own" on public.generated_reports;
create policy "reports_insert_own" on public.generated_reports
  for insert with check (auth.uid() = user_id);

drop policy if exists "reports_update_own" on public.generated_reports;
create policy "reports_update_own" on public.generated_reports
  for update using (auth.uid() = user_id);

drop policy if exists "reports_delete_own" on public.generated_reports;
create policy "reports_delete_own" on public.generated_reports
  for delete using (auth.uid() = user_id);

-- ---- strategy_coaching_sessions (per-user) ----
drop policy if exists "coaching_select_own" on public.strategy_coaching_sessions;
create policy "coaching_select_own" on public.strategy_coaching_sessions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "coaching_insert_own" on public.strategy_coaching_sessions;
create policy "coaching_insert_own" on public.strategy_coaching_sessions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "coaching_update_own" on public.strategy_coaching_sessions;
create policy "coaching_update_own" on public.strategy_coaching_sessions
  for update to authenticated using (auth.uid() = user_id);

drop policy if exists "coaching_delete_own" on public.strategy_coaching_sessions;
create policy "coaching_delete_own" on public.strategy_coaching_sessions
  for delete to authenticated using (auth.uid() = user_id);

-- ---- model_routes (global readable; account rows via is_account_member) ----
drop policy if exists "model_routes_select" on public.model_routes;
create policy "model_routes_select" on public.model_routes
  for select to authenticated
  using (account_id is null or public.is_account_member(account_id));

drop policy if exists "model_routes_insert_account" on public.model_routes;
create policy "model_routes_insert_account" on public.model_routes
  for insert to authenticated with check (public.is_account_member(account_id));

drop policy if exists "model_routes_update_account" on public.model_routes;
create policy "model_routes_update_account" on public.model_routes
  for update to authenticated using (public.is_account_member(account_id));

drop policy if exists "model_routes_delete_account" on public.model_routes;
create policy "model_routes_delete_account" on public.model_routes
  for delete to authenticated using (public.is_account_member(account_id));


-- =============================================================================
-- 14. SEEDS
-- =============================================================================

-- ---- 14a. Global model routes (account_id NULL = template defaults) ----
insert into public.model_routes (account_id, route_key, label, provider, model_name, params, fallback_route_key, is_default) values
  (null, 'premium',  'Premium',  'xai',        'grok-4.3',                   '{"temperature":0.4,"max_tokens":2000,"reasoning_effort":"medium"}'::jsonb, 'standard', false),
  (null, 'standard', 'Standard', 'xai',        'grok-4.3',                   '{"temperature":0.4,"max_tokens":2000,"reasoning_effort":"low"}'::jsonb,    'economy',  true),
  (null, 'economy',  'Economy',  'openrouter', 'openai/gpt-4o-mini',         '{"temperature":0.4,"max_tokens":2000}'::jsonb, null,       false),
  (null, 'local',    'Local',    'local',      'llama-3.1-8b-instruct',      '{"temperature":0.4,"max_tokens":2000}'::jsonb, 'standard', false)
on conflict (route_key) where account_id is null do nothing;

-- ---- 14b. Template agent profiles (account_id NULL = cloned on signup) ----
-- Orchestrator + 9 BMC section agents. model_route_key defaults to 'standard'
-- so the UI shows a valid route out of the box.
insert into public.agent_profiles
  (account_id, agent_key, display_name, agent_type, description, assigned_sections, model_route_key, status, system_instructions_summary)
values
  (null, 'orchestrator', 'Strategy Orchestrator', 'orchestrator',
   'Coordinates multi-agent runs, cascades BMC section agents, aggregates results, and manages the gap register.',
   array['all']::text[], 'standard', 'active',
   'You are the Strategy Orchestrator. You coordinate section agents, aggregate their outputs into a coherent business model canvas, identify gaps, and prioritize next actions.'),
  (null, 'agent_customer_segments', 'Customer Segments Agent', 'section_agent',
   'Analyzes and enriches the Customer Segments block of the Business Model Canvas. Identifies distinct segments, personas, and jobs-to-be-done.',
   array['customer_segments']::text[], 'standard', 'active',
   'You are the Customer Segments agent. You identify distinct customer segments, personas, jobs-to-be-done, and segment economics.'),
  (null, 'agent_value_propositions', 'Value Propositions Agent', 'section_agent',
   'Analyzes and enriches the Value Propositions block. Maps pains, gains, and pain relievers / gain creators to customer segments.',
   array['value_propositions']::text[], 'standard', 'active',
   'You are the Value Propositions agent. You map value propositions to customer pains and gains, using evidence to validate claims.'),
  (null, 'agent_channels', 'Channels Agent', 'section_agent',
   'Analyzes and enriches the Channels block. Maps distribution, communication, and sales channels to customer segments.',
   array['channels']::text[], 'standard', 'active',
   'You are the Channels agent. You identify and evaluate distribution, communication, and sales channels.'),
  (null, 'agent_customer_relationships', 'Customer Relationships Agent', 'section_agent',
   'Analyzes and enriches the Customer Relationships block. Maps acquisition, retention, and upsell strategies per segment.',
   array['customer_relationships']::text[], 'standard', 'active',
   'You are the Customer Relationships agent. You identify acquisition, retention, and upsell strategies for each customer segment.'),
  (null, 'agent_revenue_streams', 'Revenue Streams Agent', 'section_agent',
   'Analyzes and enriches the Revenue Streams block. Identifies pricing models, recurring vs one-time revenue, and unit economics.',
   array['revenue_streams']::text[], 'standard', 'active',
   'You are the Revenue Streams agent. You identify pricing models, revenue types, and unit economics with evidence-backed claims.'),
  (null, 'agent_key_resources', 'Key Resources Agent', 'section_agent',
   'Analyzes and enriches the Key Resources block. Identifies physical, intellectual, human, and financial resources.',
   array['key_resources']::text[], 'standard', 'active',
   'You are the Key Resources agent. You identify physical, intellectual, human, and financial resources critical to the business model.'),
  (null, 'agent_key_activities', 'Key Activities Agent', 'section_agent',
   'Analyzes and enriches the Key Activities block. Maps production, problem-solving, and platform/network activities.',
   array['key_activities']::text[], 'standard', 'active',
   'You are the Key Activities agent. You identify production, problem-solving, and platform/network activities that drive the business model.'),
  (null, 'agent_key_partnerships', 'Key Partnerships Agent', 'section_agent',
   'Analyzes and enriches the Key Partnerships block. Maps strategic alliances, joint ventures, supplier relationships, and coopetition.',
   array['key_partners']::text[], 'standard', 'active',
   'You are the Key Partnerships agent. You identify strategic alliances, joint ventures, supplier relationships, and coopetition dynamics.'),
  (null, 'agent_cost_structure', 'Cost Structure Agent', 'section_agent',
   'Analyzes and enriches the Cost Structure block. Identifies fixed vs variable costs, economies of scale/scope, and cost drivers.',
   array['cost_structure']::text[], 'standard', 'active',
   'You are the Cost Structure agent. You identify fixed and variable costs, economies of scale and scope, and key cost drivers.')
on conflict (agent_key) where account_id is null do nothing;

-- ---- 14c. Full system_instructions for each template agent ----
update public.agent_profiles set system_instructions = $INST$You are the Strategy Orchestrator, the coordinator of the Enterprise Strategy Workspace agent system.

Your role:
- Coordinate multi-agent runs by delegating to BMC section agents
- Cascade analysis across all 9 BMC sections in priority order
- Aggregate outputs into a coherent business model canvas
- Identify cross-section gaps and contradictions
- Prioritize next actions based on strategic impact

When analyzing a business model canvas:
1. Review the current state of all 9 sections
2. Identify the weakest sections (lowest confidence, fewest evidence items, most gaps)
3. Recommend which section agents to run and in what order
4. After section agents complete, synthesize findings into a strategic summary
5. Flag contradictions between sections (e.g., value proposition doesn't match customer segments)
6. Update the gap register with cross-section findings

Output format: Always respond with valid JSON containing:
- items: prioritized list of strategic actions
- notes: synthesis of current canvas state
- confidence: 0.0-1.0 reflecting evidence quality across all sections
- summary: one sentence strategic overview

Guardrail: You coordinate, you do not duplicate section-level analysis. Each section agent owns its domain.$INST$
where agent_key = 'orchestrator' and account_id is null;

update public.agent_profiles set system_instructions = $INST$You are the Customer Segments Agent for the Enterprise Strategy Workspace.

Your domain: The Customer Segments block of the Business Model Canvas.

Your role:
- Identify distinct customer segments using demographic, behavioral, and psychographic criteria
- Build persona profiles for each segment (goals, pains, jobs-to-be-done)
- Assess segment attractiveness (size, growth, accessibility, willingness to pay)
- Identify underserved or emerging segments
- Evaluate segment fit with the current value proposition

Analysis framework:
1. Segment identification: Who are the distinct groups the business serves or could serve?
2. Persona development: For each segment, what are their jobs-to-be-done, pains, and gains?
3. Segment economics: What is the estimated size, growth rate, and revenue potential?
4. Evidence assessment: What evidence supports these segments? What's missing?
5. Gap identification: Are there underserved segments? Over-segmentation? Missing personas?

Guidelines:
- Provide 3-5 specific, actionable items per analysis
- Every claim should reference evidence or be marked as low confidence
- If existing items are present, refine and expand rather than repeat
- Use specific numbers where possible (market size, growth rates)

Output: Valid JSON with items, notes, confidence, summary.$INST$
where agent_key = 'agent_customer_segments' and account_id is null;

update public.agent_profiles set system_instructions = $INST$You are the Value Propositions Agent for the Enterprise Strategy Workspace.

Your domain: The Value Propositions block of the Business Model Canvas.

Your role:
- Map value propositions to customer segment pains and gains
- Identify pain relievers and gain creators for each proposition
- Assess differentiation vs. competitors
- Evaluate proposition-segment fit
- Flag unsubstantiated claims or value props without target segments

Analysis framework:
1. Pain-gain mapping: For each customer segment, what are their top 3 pains and gains?
2. Proposition alignment: How does each value proposition address specific pains or create gains?
3. Competitive differentiation: How do these propositions differ from alternatives?
4. Evidence quality: What proof supports these value claims? Testimonials? Data? Research?
5. Gap identification: Are there pains without solutions? Solutions without target segments?

Guidelines:
- Map each proposition to at least one customer segment
- Flag any proposition that lacks evidence as low confidence
- Identify propositions that could be strengthened with minor adjustments
- Suggest new propositions for unaddressed pains

Output: Valid JSON with items, notes, confidence, summary.$INST$
where agent_key = 'agent_value_propositions' and account_id is null;

update public.agent_profiles set system_instructions = $INST$You are the Channels Agent for the Enterprise Strategy Workspace.

Your domain: The Channels block of the Business Model Canvas.

Your role:
- Map distribution, communication, and sales channels to customer segments
- Evaluate channel effectiveness and reach
- Identify channel gaps and opportunities for optimization
- Assess channel-fit with customer segment preferences
- Flag channels that are underutilized or misaligned

Analysis framework:
1. Channel inventory: What channels are currently used for awareness, evaluation, purchase, delivery, and after-sales?
2. Channel-segment fit: Which channels reach which segments? Are there segments with no channel coverage?
3. Channel performance: What is the effectiveness and cost of each channel?
4. Channel optimization: Where can channels be improved, combined, or replaced?
5. Gap identification: Are there missing channels? Over-reliance on a single channel?

Guidelines:
- Map each channel to at least one customer segment
- Flag single-channel dependencies as risks
- Suggest omni-channel opportunities where segments overlap
- Reference evidence for channel performance claims

Output: Valid JSON with items, notes, confidence, summary.$INST$
where agent_key = 'agent_channels' and account_id is null;

update public.agent_profiles set system_instructions = $INST$You are the Customer Relationships Agent for the Enterprise Strategy Workspace.

Your domain: The Customer Relationships block of the Business Model Canvas.

Your role:
- Identify acquisition, retention, and upsell strategies per customer segment
- Evaluate relationship types (transactional, long-term, self-service, automated, community)
- Assess customer lifetime value drivers
- Identify churn risks and mitigation strategies
- Flag relationship gaps between segments and channels

Analysis framework:
1. Relationship type mapping: What type of relationship does each segment expect and receive?
2. Acquisition strategy: How are customers acquired? Is the acquisition cost sustainable?
3. Retention strategy: What keeps customers coming back? What are the churn drivers?
4. Upsell/cross-sell: What opportunities exist to increase LTV?
5. Gap identification: Are there segments without defined relationship strategies? Automation opportunities?

Guidelines:
- Reference LTV/CAC ratios where possible
- Flag high-churn segments with low retention investment
- Suggest relationship automation opportunities (self-service, AI)
- Every claim should reference evidence or be marked low confidence

Output: Valid JSON with items, notes, confidence, summary.$INST$
where agent_key = 'agent_customer_relationships' and account_id is null;

update public.agent_profiles set system_instructions = $INST$You are the Revenue Streams Agent for the Enterprise Strategy Workspace.

Your domain: The Revenue Streams block of the Business Model Canvas.

Your role:
- Identify pricing models and revenue types (one-time, recurring, usage-based, licensing)
- Assess unit economics and contribution margins per stream
- Evaluate revenue diversification and concentration risk
- Identify pricing optimization opportunities
- Flag revenue streams disconnected from value propositions

Analysis framework:
1. Revenue stream inventory: What are all revenue sources? How is each priced?
2. Unit economics: What is the margin, CAC, and LTV for each stream?
3. Diversification: Is revenue concentrated in one stream? What is the risk?
4. Pricing optimization: Are there underpriced or overpriced offerings?
5. Gap identification: Are there value propositions without revenue streams? Unused monetization opportunities?

Guidelines:
- Use specific numbers for pricing, margins, and volumes when available
- Flag revenue streams with negative unit economics
- Suggest alternative pricing models where appropriate
- Map each revenue stream to its corresponding value proposition

Output: Valid JSON with items, notes, confidence, summary.$INST$
where agent_key = 'agent_revenue_streams' and account_id is null;

update public.agent_profiles set system_instructions = $INST$You are the Key Resources Agent for the Enterprise Strategy Workspace.

Your domain: The Key Resources block of the Business Model Canvas.

Your role:
- Identify physical, intellectual, human, and financial resources
- Assess resource adequacy and strategic fit
- Evaluate resource scarcity and competitive moats
- Identify resource gaps and acquisition priorities
- Flag underutilized resources and redundancy

Analysis framework:
1. Resource inventory: What physical, intellectual, human, and financial resources exist?
2. Strategic fit: Which resources are critical to the value proposition? Which are nice-to-have?
3. Competitive moat: Which resources create barriers to entry? Patents? Talent? Data?
4. Resource gaps: What resources are missing to execute the strategy?
5. Utilization: Are any resources underutilized? Can they be leveraged elsewhere?

Guidelines:
- Prioritize resources by strategic importance (critical vs. supporting)
- Flag single points of failure (key person, single supplier, etc.)
- Identify resources that could be shared across sections
- Reference evidence for resource valuation claims

Output: Valid JSON with items, notes, confidence, summary.$INST$
where agent_key = 'agent_key_resources' and account_id is null;

update public.agent_profiles set system_instructions = $INST$You are the Key Activities Agent for the Enterprise Strategy Workspace.

Your domain: The Key Activities block of the Business Model Canvas.

Your role:
- Identify production, problem-solving, and platform/network activities
- Map activities to value propositions and customer segments
- Assess operational efficiency and bottleneck risks
- Identify activities that can be automated or outsourced
- Flag activities disconnected from value delivery

Analysis framework:
1. Activity inventory: What are the core activities required to deliver the value proposition?
2. Activity-value mapping: Which activities directly create value? Which are supporting?
3. Efficiency assessment: Where are the bottlenecks? What activities are manual vs. automated?
4. Outsourcing potential: Which activities could be outsourced or automated?
5. Gap identification: Are there value propositions without defined activities? Missing capabilities?

Guidelines:
- Prioritize activities by impact on value delivery
- Flag manual activities that could be automated
- Identify activities shared across multiple value propositions
- Reference process evidence or operational metrics

Output: Valid JSON with items, notes, confidence, summary.$INST$
where agent_key = 'agent_key_activities' and account_id is null;

update public.agent_profiles set system_instructions = $INST$You are the Key Partnerships Agent for the Enterprise Strategy Workspace.

Your domain: The Key Partnerships block of the Business Model Canvas.

Your role:
- Map strategic alliances, joint ventures, supplier relationships, and coopetition
- Assess partnership dependency risks and benefits
- Evaluate partnership performance and alignment
- Identify partnership opportunities for resource/activity gaps
- Flag partnerships that create single points of failure

Analysis framework:
1. Partnership inventory: Who are the key partners and what type (supplier, distributor, strategic, coopetition)?
2. Dependency analysis: Which partnerships are critical? What happens if they end?
3. Performance assessment: Are partnerships delivering value? Are there underperforming partners?
4. Gap identification: Are there resource/activity gaps that partnerships could fill?
5. Risk assessment: Are there concentration risks (single supplier, single distributor)?

Guidelines:
- Map each partnership to the resource or activity it supports
- Flag single-source dependencies as risks
- Suggest partnership opportunities for identified gaps
- Reference evidence for partnership performance claims

Output: Valid JSON with items, notes, confidence, summary.$INST$
where agent_key = 'agent_key_partnerships' and account_id is null;

update public.agent_profiles set system_instructions = $INST$You are the Cost Structure Agent for the Enterprise Strategy Workspace.

Your domain: The Cost Structure block of the Business Model Canvas.

Your role:
- Identify fixed vs. variable costs and cost drivers
- Assess economies of scale and scope
- Evaluate cost efficiency and optimization opportunities
- Map costs to value propositions and revenue streams
- Flag unsustainable cost structures and burn rate risks

Analysis framework:
1. Cost inventory: What are the major cost categories (fixed vs. variable, direct vs. indirect)?
2. Cost drivers: What drives costs in each category? Volume? Complexity? Headcount?
3. Scale economics: Where do economies of scale apply? Where are there diseconomies?
4. Cost-value alignment: Do costs align with value delivery? Are there costs not tied to value?
5. Gap identification: Are there hidden costs? Underestimated cost categories? Burn rate concerns?

Guidelines:
- Use specific numbers for cost figures when available
- Flag cost categories growing faster than revenue
- Suggest specific cost optimization opportunities
- Map costs to the activities and resources that generate them
- Reference financial evidence for cost claims

Output: Valid JSON with items, notes, confidence, summary.$INST$
where agent_key = 'agent_cost_structure' and account_id is null;


-- =============================================================================
-- 15. WORKSPACE & ORCHESTRATION (Phase 1)
-- =============================================================================
-- Mirrors migrations 20260702100000_workspace_orchestration_tables.sql,
-- 20260702100100_column_additions.sql, 20260702100200_rls_new_tables.sql, and
-- 20260702100300_seed_phase1.sql. See those files for the full ordering-proof
-- and assumption comments; reproduced verbatim below for the single-apply path.

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
  max_attempts integer not null default 3,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  parent_run_id uuid references public.agent_runs(id) on delete set null,
  cascade_run_id uuid references public.cascade_runs(id) on delete set null,
  claimed_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  run_after timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now()
);
comment on column public.agent_jobs.status is
  'Expected values (Phase 2 worker owns the state machine): queued | running | completed | failed | failed_permanent | cancelled. Not enumerated at the DB level — see migration header comment.';

comment on column public.agent_jobs.claimed_by is
  'Worker id that currently owns a running job claim.';
comment on column public.agent_jobs.heartbeat_at is
  'Updated by the worker while running; stale heartbeats are reclaimable.';
comment on column public.agent_jobs.run_after is
  'Earliest time a queued job is eligible for retry/claim.';
comment on column public.agent_jobs.max_attempts is
  'Maximum attempts before fail_agent_job moves the job to failed_permanent.';
comment on column public.agent_jobs.last_error is
  'Last failure message, safe for operator/debug display. Secrets must not be written here.';

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
create index if not exists idx_agent_jobs_queue_claim
  on public.agent_jobs(status, run_after, created_at)
  where status in ('queued', 'running');
create index if not exists idx_agent_jobs_heartbeat
  on public.agent_jobs(status, heartbeat_at)
  where status = 'running';
create index if not exists idx_metric_snapshots_account on public.metric_snapshots(account_id, metric_key, computed_at desc);
create index if not exists idx_agent_profile_revisions_profile on public.agent_profile_revisions(agent_profile_id, created_at desc);

create or replace function public.claim_next_agent_job(
  p_worker_id text,
  p_stale_after_seconds integer default 120,
  p_default_max_attempts integer default 3
)
returns setof public.agent_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  update public.agent_jobs
  set
    status = 'failed_permanent',
    heartbeat_at = now(),
    last_error = coalesce(last_error, 'Worker heartbeat expired after final attempt')
  where status = 'running'
    and coalesce(heartbeat_at, locked_at, created_at) < now() - make_interval(secs => p_stale_after_seconds)
    and attempts >= coalesce(max_attempts, p_default_max_attempts);

  select id
    into v_job_id
  from public.agent_jobs
  where
    (
      status = 'queued'
      and run_after <= now()
      and attempts < coalesce(max_attempts, p_default_max_attempts)
    )
    or (
      status = 'running'
      and coalesce(heartbeat_at, locked_at, created_at) < now() - make_interval(secs => p_stale_after_seconds)
      and attempts < coalesce(max_attempts, p_default_max_attempts)
    )
  order by run_after asc, created_at asc
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  return query
  update public.agent_jobs
  set
    status = 'running',
    attempts = attempts + 1,
    max_attempts = coalesce(max_attempts, p_default_max_attempts),
    claimed_by = p_worker_id,
    locked_at = now(),
    heartbeat_at = now(),
    last_error = null
  where id = v_job_id
  returning *;
end;
$$;

create or replace function public.fail_agent_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text
)
returns public.agent_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.agent_jobs;
  v_delay_seconds integer;
begin
  select *
    into v_job
  from public.agent_jobs
  where id = p_job_id
    and claimed_by = p_worker_id
    and status = 'running'
  for update;

  if not found then
    raise exception 'agent job % is not running for worker %', p_job_id, p_worker_id;
  end if;

  if v_job.attempts >= v_job.max_attempts then
    update public.agent_jobs
    set
      status = 'failed_permanent',
      heartbeat_at = now(),
      last_error = p_error
    where id = p_job_id
    returning * into v_job;
  else
    v_delay_seconds := least(900, power(2, greatest(v_job.attempts - 1, 0))::integer * 30);

    update public.agent_jobs
    set
      status = 'queued',
      claimed_by = null,
      locked_at = null,
      heartbeat_at = null,
      run_after = now() + make_interval(secs => v_delay_seconds),
      last_error = p_error
    where id = p_job_id
    returning * into v_job;
  end if;

  return v_job;
end;
$$;

revoke all on function public.claim_next_agent_job(text, integer, integer) from public;
revoke all on function public.claim_next_agent_job(text, integer, integer) from anon;
revoke all on function public.claim_next_agent_job(text, integer, integer) from authenticated;
grant execute on function public.claim_next_agent_job(text, integer, integer) to service_role;

revoke all on function public.fail_agent_job(uuid, text, text) from public;
revoke all on function public.fail_agent_job(uuid, text, text) from anon;
revoke all on function public.fail_agent_job(uuid, text, text) from authenticated;
grant execute on function public.fail_agent_job(uuid, text, text) to service_role;

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
-- =============================================================================
-- PHASE 1 — work order 1.3: RLS on every new table
-- =============================================================================
-- Follows the exact patterns already established in schema.sql:
--   (a) the generic account-scoped CRUD loop (`is_account_member(account_id)`)
--   (b) the template-readable pattern used by agent_profiles / model_routes
--       (`account_id is null or is_account_member(account_id)`)
--   (c) explicit child-table policies that join to a parent's account_id
--       (mirrors mcp_server_tools_all_account's join-through pattern)
--
-- Per BUILD_PLAN 1.3 exceptions:
--   - insights, agenda_items: SELECT only for authenticated account members.
--     No insert/update/delete policy for `authenticated` — the worker writes
--     via the service role key, which bypasses RLS entirely.
--   - approvals: SELECT + UPDATE for account members (so a human can decide
--     pending approvals), no INSERT/DELETE for `authenticated` — only the
--     service role inserts new approval requests.

alter table public.workspace_threads          enable row level security;
alter table public.workspace_messages         enable row level security;
alter table public.context_sources            enable row level security;
alter table public.insights                   enable row level security;
alter table public.agenda_items               enable row level security;
alter table public.approvals                  enable row level security;
alter table public.agent_jobs                 enable row level security;
alter table public.cascades                   enable row level security;
alter table public.cascade_steps              enable row level security;
alter table public.cascade_runs               enable row level security;
alter table public.metric_snapshots           enable row level security;
alter table public.agent_profile_revisions    enable row level security;

-- ---- straightforward account-scoped CRUD (extend the existing loop pattern) ----
-- workspace_threads, context_sources, agent_jobs, metric_snapshots, and
-- cascade_runs all carry a direct account_id column and a plain
-- is_account_member CRUD policy is the correct, conservative default for
-- each (agent_jobs/cascade_runs/metric_snapshots are primarily written by
-- the worker via service role, which bypasses RLS regardless, so granting
-- authenticated CRUD here does not create a new write path in practice — it
-- only helps the frontend read/poll these tables and lets a human cancel a
-- job or dismiss a stale run if the worker exposes that later).
do $$
declare t text;
begin
  for t in select unnest(array[
    'workspace_threads', 'context_sources', 'agent_jobs',
    'metric_snapshots', 'cascade_runs'
  ]) loop
    execute format('drop policy if exists "%s_select_account" on public.%I', t, t);
    execute format(
      'create policy "%s_select_account" on public.%I
         for select to authenticated using (public.is_account_member(account_id))', t, t);

    execute format('drop policy if exists "%s_insert_account" on public.%I', t, t);
    execute format(
      'create policy "%s_insert_account" on public.%I
         for insert to authenticated with check (public.is_account_member(account_id))', t, t);

    execute format('drop policy if exists "%s_update_account" on public.%I', t, t);
    execute format(
      'create policy "%s_update_account" on public.%I
         for update to authenticated using (public.is_account_member(account_id))', t, t);

    execute format('drop policy if exists "%s_delete_account" on public.%I', t, t);
    execute format(
      'create policy "%s_delete_account" on public.%I
         for delete to authenticated using (public.is_account_member(account_id))', t, t);
  end loop;
end $$;

-- ---- insights (SELECT-only for members; writes are service-role only) ----
drop policy if exists "insights_select_account" on public.insights;
create policy "insights_select_account" on public.insights
  for select to authenticated using (public.is_account_member(account_id));

-- ---- agenda_items (SELECT-only for members; writes are service-role only) ----
drop policy if exists "agenda_items_select_account" on public.agenda_items;
create policy "agenda_items_select_account" on public.agenda_items
  for select to authenticated using (public.is_account_member(account_id));

-- ---- approvals (SELECT + UPDATE for members; INSERT/DELETE service-role only) ----
drop policy if exists "approvals_select_account" on public.approvals;
create policy "approvals_select_account" on public.approvals
  for select to authenticated using (public.is_account_member(account_id));

drop policy if exists "approvals_update_account" on public.approvals;
create policy "approvals_update_account" on public.approvals
  for update to authenticated using (public.is_account_member(account_id));

-- ---- cascades (template rows account_id IS NULL readable by everyone;
--       account rows follow is_account_member; template rows are not
--       writable by `authenticated` — they ship via seed migrations only) ----
drop policy if exists "cascades_select" on public.cascades;
create policy "cascades_select" on public.cascades
  for select to authenticated
  using (account_id is null or public.is_account_member(account_id));

drop policy if exists "cascades_insert_account" on public.cascades;
create policy "cascades_insert_account" on public.cascades
  for insert to authenticated with check (public.is_account_member(account_id));

drop policy if exists "cascades_update_account" on public.cascades;
create policy "cascades_update_account" on public.cascades
  for update to authenticated using (public.is_account_member(account_id));

drop policy if exists "cascades_delete_account" on public.cascades;
create policy "cascades_delete_account" on public.cascades
  for delete to authenticated using (public.is_account_member(account_id));

-- ---- cascade_steps (child of cascades; inherit access via parent's
--       account_id, which may be NULL for template cascades) ----
drop policy if exists "cascade_steps_select" on public.cascade_steps;
create policy "cascade_steps_select" on public.cascade_steps
  for select to authenticated
  using (
    exists (
      select 1 from public.cascades c
      where c.id = cascade_id
        and (c.account_id is null or public.is_account_member(c.account_id))
    )
  );

drop policy if exists "cascade_steps_all_account" on public.cascade_steps;
create policy "cascade_steps_all_account" on public.cascade_steps
  for all to authenticated
  using (
    exists (
      select 1 from public.cascades c
      where c.id = cascade_id and c.account_id is not null
        and public.is_account_member(c.account_id)
    )
  )
  with check (
    exists (
      select 1 from public.cascades c
      where c.id = cascade_id and c.account_id is not null
        and public.is_account_member(c.account_id)
    )
  );

-- ---- workspace_messages (child of workspace_threads; inherit access via
--       parent's account_id) ----
drop policy if exists "workspace_messages_all_account" on public.workspace_messages;
create policy "workspace_messages_all_account" on public.workspace_messages
  for all to authenticated
  using (
    exists (
      select 1 from public.workspace_threads wt
      where wt.id = thread_id and public.is_account_member(wt.account_id)
    )
  )
  with check (
    exists (
      select 1 from public.workspace_threads wt
      where wt.id = thread_id and public.is_account_member(wt.account_id)
    )
  );

-- ---- agent_profile_revisions (child of agent_profiles; inherit access via
--       parent's account_id, which may be NULL for template profiles — a
--       revision on a template profile should be readable by any
--       authenticated user, matching the agent_profiles template pattern) ----
drop policy if exists "agent_profile_revisions_select" on public.agent_profile_revisions;
create policy "agent_profile_revisions_select" on public.agent_profile_revisions
  for select to authenticated
  using (
    exists (
      select 1 from public.agent_profiles ap
      where ap.id = agent_profile_id
        and (ap.account_id is null or public.is_account_member(ap.account_id))
    )
  );

drop policy if exists "agent_profile_revisions_insert" on public.agent_profile_revisions;
create policy "agent_profile_revisions_insert" on public.agent_profile_revisions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.agent_profiles ap
      where ap.id = agent_profile_id
        and ap.account_id is not null
        and public.is_account_member(ap.account_id)
    )
  );

-- DELETE mirrors INSERT scope (RF-5B3-2: settings-sheet last-10 pruning needs
-- it; template-profile revisions stay undeletable by clients).
drop policy if exists "agent_profile_revisions_delete" on public.agent_profile_revisions;
create policy "agent_profile_revisions_delete" on public.agent_profile_revisions
  for delete to authenticated
  using (
    exists (
      select 1 from public.agent_profiles ap
      where ap.id = agent_profile_id
        and ap.account_id is not null
        and public.is_account_member(ap.account_id)
    )
  );
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
  (null, 'extract_escalated', 'Extract Escalated (mid)', 'anthropic', 'claude-haiku-4-5-20251001',
   '{"temperature":0.2,"max_tokens":3000}'::jsonb, false, 'extract_escalated', 0.001, 0.005, 'human'),
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


-- =============================================================================
-- 16. DROP DEAD / LEGACY TABLES
-- =============================================================================
-- These were superseded by frameworks + generated_reports and are referenced
-- only in generated types, never in app code. Safe to remove.
drop table if exists public.framework_executions cascade;
drop table if exists public.strategy_sessions cascade;
drop table if exists public.strategic_frameworks cascade;

-- =============================================================================
-- DONE. Next: run supabase/seed_frameworks.sql, then set secrets + deploy
-- edge functions (see supabase/SETUP.md).
-- =============================================================================

-- =============================================================================
-- PHASE 3.1: data feed registry and TTL cache
-- =============================================================================
do $$ begin
  create type public.data_feed_kind as enum ('api', 'scrape', 'search');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.data_feed_health as enum ('ok', 'degraded', 'failing');
exception when duplicate_object then null; end $$;

create table if not exists public.data_feeds (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  feed_key text not null,
  name text not null,
  kind public.data_feed_kind not null,
  tier text not null default 'T2',
  config jsonb not null default '{}'::jsonb,
  cadence text not null default 'weekly',
  ttl_seconds integer not null default 86400,
  last_run_at timestamptz,
  health public.data_feed_health not null default 'degraded',
  last_error text,
  cost_class text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct(account_id, feed_key)
);
comment on table public.data_feeds is
  'Phase 3 feed registry. account_id null rows are global defaults; account rows override by feed_key.';
comment on column public.data_feeds.config is
  'Fetcher-specific JSON config such as URL targets, FRED series IDs, Trends keywords, GDELT query, or GitHub repos.';

create table if not exists public.feed_cache (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  feed_key text not null,
  cache_key text not null,
  payload jsonb not null default '{}'::jsonb,
  evidence_candidates jsonb not null default '[]'::jsonb,
  metric_candidates jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  health public.data_feed_health not null default 'ok',
  error text,
  created_at timestamptz not null default now(),
  unique(account_id, feed_key, cache_key)
);
comment on table public.feed_cache is
  'TTL cache for Phase 3 feed fetches. Agents and fetchers read cached evidence before spending another scrape/search/API call.';

create index if not exists idx_data_feeds_account_key on public.data_feeds(account_id, feed_key);
create index if not exists idx_data_feeds_health on public.data_feeds(health);
create index if not exists idx_feed_cache_lookup on public.feed_cache(account_id, feed_key, cache_key, expires_at desc);
create index if not exists idx_scheduled_loops_action_key on public.scheduled_loops(action_key);
create unique index if not exists idx_scheduled_loops_account_action
  on public.scheduled_loops(account_id, action_key)
  where action_key is not null;

alter table public.data_feeds enable row level security;
alter table public.feed_cache enable row level security;

drop policy if exists "data_feeds_select_account" on public.data_feeds;
create policy "data_feeds_select_account"
  on public.data_feeds for select
  using (account_id is null or public.is_account_member(account_id));

drop policy if exists "feed_cache_select_account" on public.feed_cache;
create policy "feed_cache_select_account"
  on public.feed_cache for select
  using (account_id is null or public.is_account_member(account_id));

insert into public.data_feeds (account_id, feed_key, name, kind, tier, cadence, ttl_seconds, health, cost_class, config)
values
  (null, 'firecrawl_scrape', 'Firecrawl page scrape', 'scrape', 'T1', 'weekly', 604800, 'degraded', 'metered', '{"targets":["pricing","careers","changelog","reviews","press"]}'::jsonb),
  (null, 'web_search', 'Web search (Exa -> Firecrawl -> xAI)', 'search', 'T2', 'daily', 86400, 'degraded', 'metered', '{}'::jsonb),
  (null, 'fred_series', 'FRED macro series', 'api', 'T1', 'monthly', 2592000, 'degraded', 'free', '{"series":["FEDFUNDS","CPIAUCSL","UMCSENT"]}'::jsonb),
  (null, 'google_trends', 'Google Trends interest', 'api', 'T2', 'weekly', 604800, 'degraded', 'free', '{}'::jsonb),
  (null, 'gdelt_count', 'GDELT news count', 'api', 'T2', 'weekly', 604800, 'degraded', 'free', '{}'::jsonb),
  (null, 'github_repo_stats', 'GitHub repository stats', 'api', 'T1', 'weekly', 604800, 'degraded', 'free', '{}'::jsonb),
  (null, 'sec_edgar_filings', 'SEC EDGAR filings', 'api', 'T1', 'weekly', 604800, 'degraded', 'free', '{}'::jsonb)
on conflict (account_id, feed_key) do update set
  name = excluded.name,
  kind = excluded.kind,
  tier = excluded.tier,
  cadence = excluded.cadence,
  ttl_seconds = excluded.ttl_seconds,
  cost_class = excluded.cost_class,
  config = excluded.config,
  updated_at = now();


-- =============================================================================
-- PHASE 5A - Knowledge stack and grounding schema
-- Spec reference: docs/specs/08_KNOWLEDGE_AND_STRATEGY_ENGINE.md §§1, 3, 4, 9
-- =============================================================================

do $$ begin create type public.watched_source_kind as enum ('url', 'social_handle', 'search_query', 'feed_config'); exception when duplicate_object then null; end $$;
do $$ begin create type public.watch_cadence as enum ('daily', 'weekly', 'biweekly', 'monthly'); exception when duplicate_object then null; end $$;
do $$ begin create type public.watch_health as enum ('unknown', 'ok', 'degraded', 'failed', 'paused'); exception when duplicate_object then null; end $$;
do $$ begin create type public.watch_added_by as enum ('agent', 'user'); exception when duplicate_object then null; end $$;
do $$ begin create type public.knowledge_claim_source as enum ('researched', 'owner_provided'); exception when duplicate_object then null; end $$;
do $$ begin create type public.owner_question_status as enum ('open', 'answered', 'dismissed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.founder_document_status as enum ('uploaded', 'parsing', 'needs_review', 'distributed', 'failed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.company_logo_source as enum ('firecrawl_metadata', 'og_image', 'favicon', 'manual', 'fallback'); exception when duplicate_object then null; end $$;

create table if not exists public.watched_sources (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_profile_id uuid not null references public.agent_profiles(id) on delete cascade,
  kind public.watched_source_kind not null,
  target text not null,
  label text not null,
  cadence public.watch_cadence not null default 'weekly',
  last_checked_at timestamptz,
  health public.watch_health not null default 'unknown',
  last_error text,
  added_by public.watch_added_by not null default 'user',
  entity jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.founder_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null,
  file_name text,
  storage_bucket text not null default 'founder-documents',
  storage_path text,
  content_type text,
  file_size_bytes bigint,
  status public.founder_document_status not null default 'uploaded',
  source_summary text,
  extracted_text text,
  section_claims jsonb not null default '{}'::jsonb,
  evidence_ids uuid[] not null default '{}',
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  uploaded_by uuid,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.founder_documents is
  'Owner-uploaded founder docs for deck-first onboarding. Items are owner-provided evidence and never silently merged.';

create table if not exists public.agent_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_profile_id uuid not null references public.agent_profiles(id) on delete cascade,
  doc_key text not null,
  title text not null,
  body_md text not null default '',
  version integer not null default 1,
  refresh_cadence public.watch_cadence not null default 'weekly',
  last_refreshed_at timestamptz,
  freshness_status public.freshness_status not null default 'unverified',
  evidence_ids uuid[] not null default '{}',
  material_change boolean not null default false,
  claim_sources jsonb not null default '{}'::jsonb,
  founder_document_id uuid references public.founder_documents(id) on delete set null,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, agent_profile_id, doc_key)
);

create table if not exists public.agent_document_revisions (
  id uuid primary key default gen_random_uuid(),
  agent_document_id uuid not null references public.agent_documents(id) on delete cascade,
  version integer not null,
  title text not null,
  body_md text not null,
  evidence_ids uuid[] not null default '{}',
  material_change boolean not null default false,
  change_summary text,
  claim_sources jsonb not null default '{}'::jsonb,
  founder_document_id uuid references public.founder_documents(id) on delete set null,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (agent_document_id, version)
);

create table if not exists public.owner_questions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_profile_id uuid not null references public.agent_profiles(id) on delete cascade,
  question text not null,
  why_needed text not null,
  doc_key text not null,
  status public.owner_question_status not null default 'open',
  answer text,
  answered_at timestamptz,
  dismissed_at timestamptz,
  evidence_id uuid references public.evidence_items(id) on delete set null,
  created_by_agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.canvas_section_versions
  add column if not exists groundedness_score numeric(5,4)
    check (groundedness_score is null or (groundedness_score >= 0 and groundedness_score <= 1)),
  add column if not exists groundedness_inputs jsonb not null default '{}'::jsonb;

alter table public.companies
  add column if not exists logo_url text,
  add column if not exists logo_source public.company_logo_source,
  add column if not exists brand_assets jsonb not null default '{}'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'founder-documents',
  'founder-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'context-files',
  'context-files',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
    'text/plain',
    'text/csv',
    'application/json'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create index if not exists idx_watched_sources_account_agent on public.watched_sources(account_id, agent_profile_id, enabled);
create index if not exists idx_watched_sources_health on public.watched_sources(account_id, health, last_checked_at);
create index if not exists idx_founder_documents_account_status on public.founder_documents(account_id, status, created_at desc);
create index if not exists idx_agent_documents_account_agent on public.agent_documents(account_id, agent_profile_id, doc_key);
create index if not exists idx_agent_documents_freshness on public.agent_documents(account_id, freshness_status, last_refreshed_at);
create index if not exists idx_agent_document_revisions_document on public.agent_document_revisions(agent_document_id, version desc);
create index if not exists idx_owner_questions_account_agent on public.owner_questions(account_id, agent_profile_id, status, created_at desc);
create index if not exists idx_csv_groundedness on public.canvas_section_versions(account_id, section_key, groundedness_score);

create or replace function public.enforce_owner_question_open_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'open' and (
    select count(*)
    from public.owner_questions oq
    where oq.account_id = new.account_id
      and oq.agent_profile_id = new.agent_profile_id
      and oq.status = 'open'
      and oq.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) >= 3 then
    raise exception 'owner_questions allows at most 3 open questions per agent';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_owner_question_open_limit on public.owner_questions;
create trigger enforce_owner_question_open_limit
  before insert or update of status, account_id, agent_profile_id
  on public.owner_questions
  for each row execute function public.enforce_owner_question_open_limit();

alter table public.watched_sources enable row level security;
alter table public.founder_documents enable row level security;
alter table public.agent_documents enable row level security;
alter table public.agent_document_revisions enable row level security;
alter table public.owner_questions enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array[
    'watched_sources',
    'founder_documents',
    'agent_documents',
    'owner_questions'
  ]) loop
    execute format('drop policy if exists "%s_select_account" on public.%I', t, t);
    execute format(
      'create policy "%s_select_account" on public.%I
         for select to authenticated using (public.is_account_member(account_id))', t, t);

    execute format('drop policy if exists "%s_insert_account" on public.%I', t, t);
    execute format(
      'create policy "%s_insert_account" on public.%I
         for insert to authenticated with check (public.is_account_member(account_id))', t, t);

    execute format('drop policy if exists "%s_update_account" on public.%I', t, t);
    execute format(
      'create policy "%s_update_account" on public.%I
         for update to authenticated using (public.is_account_member(account_id))
         with check (public.is_account_member(account_id))', t, t);

    execute format('drop policy if exists "%s_delete_account" on public.%I', t, t);
    execute format(
      'create policy "%s_delete_account" on public.%I
         for delete to authenticated using (public.is_account_member(account_id))', t, t);
  end loop;
end $$;

drop policy if exists "agent_document_revisions_select" on public.agent_document_revisions;
create policy "agent_document_revisions_select" on public.agent_document_revisions
  for select to authenticated
  using (
    exists (
      select 1 from public.agent_documents ad
      where ad.id = agent_document_id
        and public.is_account_member(ad.account_id)
    )
  );

drop policy if exists "agent_document_revisions_insert" on public.agent_document_revisions;
create policy "agent_document_revisions_insert" on public.agent_document_revisions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.agent_documents ad
      where ad.id = agent_document_id
        and public.is_account_member(ad.account_id)
    )
  );

drop policy if exists "founder_documents_storage_select" on storage.objects;
create policy "founder_documents_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'founder-documents'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "founder_documents_storage_insert" on storage.objects;
create policy "founder_documents_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'founder-documents'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "founder_documents_storage_update" on storage.objects;
create policy "founder_documents_storage_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'founder-documents'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'founder-documents'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "founder_documents_storage_delete" on storage.objects;
create policy "founder_documents_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'founder-documents'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "context_files_storage_select" on storage.objects;
create policy "context_files_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'context-files'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "context_files_storage_insert" on storage.objects;
create policy "context_files_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'context-files'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "context_files_storage_update" on storage.objects;
create policy "context_files_storage_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'context-files'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'context-files'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "context_files_storage_delete" on storage.objects;
create policy "context_files_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'context-files'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );

do $$
declare t text;
begin
  for t in select unnest(array[
    'watched_sources',
    'founder_documents',
    'agent_documents',
    'owner_questions'
  ]) loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;



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
   '{"temperature":0.2,"max_tokens":1800}'::jsonb, false, 'summary_update', 0.001, 0.005, 'human'),
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

-- Spec 08 section 3a (mirror): agent-proposed grounding candidates with evidence.
-- Agents suggest the real name behind a generic canvas item; the owner
-- confirms/edits/dismisses in the grounding wizard. Suggestions are only
-- written after passing the adversarial verifier against their evidence.

do $$ begin create type public.grounding_suggestion_status as enum ('open', 'accepted', 'dismissed'); exception when duplicate_object then null; end $$;

create table if not exists public.grounding_suggestions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  section_key text not null,
  item_text text not null,
  suggested_text text not null,
  rationale text,
  evidence_id uuid references public.evidence_items(id) on delete set null,
  status public.grounding_suggestion_status not null default 'open',
  resolved_at timestamptz,
  created_by_agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, section_key, item_text, suggested_text)
);

create index if not exists idx_grounding_suggestions_account_status
  on public.grounding_suggestions(account_id, status, section_key, created_at desc);

alter table public.grounding_suggestions enable row level security;

drop policy if exists "grounding_suggestions_select_account" on public.grounding_suggestions;
create policy "grounding_suggestions_select_account" on public.grounding_suggestions
  for select to authenticated using (public.is_account_member(account_id));

drop policy if exists "grounding_suggestions_update_account" on public.grounding_suggestions;
create policy "grounding_suggestions_update_account" on public.grounding_suggestions
  for update to authenticated using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));

drop trigger if exists set_updated_at on public.grounding_suggestions;
create trigger set_updated_at before update on public.grounding_suggestions
  for each row execute function public.set_updated_at();

insert into public.model_routes
  (account_id, route_key, label, provider, model_name, params, is_default, task_class, cost_per_1k_in, cost_per_1k_out, updated_by)
values
  (null, 'grounding_suggest', 'Grounding Suggestions (budget)', 'openrouter', 'anthropic/claude-haiku-4.5',
   '{"temperature":0.2,"max_tokens":2200}'::jsonb, false, 'grounding_suggest', 0.001, 0.005, 'human')
on conflict (route_key) where account_id is null do update set
  label = excluded.label,
  provider = excluded.provider,
  model_name = excluded.model_name,
  params = excluded.params,
  task_class = excluded.task_class,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  updated_by = excluded.updated_by;

-- Spec 10 mirror: skill catalog + artifacts
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

create table if not exists public.artifact_shares (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  artifact_id uuid not null references public.skill_artifacts(id) on delete cascade,
  token text not null unique,
  created_by uuid,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint artifact_shares_token_length check (char_length(token) >= 32)
);

create index if not exists idx_artifact_shares_account
  on public.artifact_shares(account_id, created_at desc);

create index if not exists idx_artifact_shares_artifact
  on public.artifact_shares(artifact_id, revoked, created_at desc);

create unique index if not exists idx_artifact_shares_active_artifact
  on public.artifact_shares(artifact_id)
  where revoked = false;

alter table public.artifact_shares enable row level security;
drop policy if exists "artifact_shares_select_account" on public.artifact_shares;
create policy "artifact_shares_select_account" on public.artifact_shares
  for select to authenticated
  using (public.is_account_member(account_id));

drop policy if exists "artifact_shares_insert_account" on public.artifact_shares;
create policy "artifact_shares_insert_account" on public.artifact_shares
  for insert to authenticated
  with check (
    public.is_account_member(account_id)
    and exists (
      select 1
      from public.skill_artifacts artifact
      where artifact.id = artifact_shares.artifact_id
        and artifact.account_id = artifact_shares.account_id
    )
  );

drop policy if exists "artifact_shares_update_account" on public.artifact_shares;
create policy "artifact_shares_update_account" on public.artifact_shares
  for update to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));

drop policy if exists "artifact_shares_delete_account" on public.artifact_shares;
create policy "artifact_shares_delete_account" on public.artifact_shares
  for delete to authenticated
  using (public.is_account_member(account_id));

grant select, insert, update, delete on public.artifact_shares to authenticated;
grant select, update on public.accounts to authenticated;

insert into public.skill_catalog (skill_key, agent_key, title, description, trigger_kinds, output_kind, implemented, sort_order) values
  ('yield.pricing_teardown', 'agent_revenue_streams', 'Pricing teardown', 'Crawls competitor pricing, normalizes models and price points into a matrix, positions yours, recommends a strategy with scenarios.', '{manual,atlas}', 'matrix_board', true, 1),
  ('yield.monetization_gaps', 'agent_revenue_streams', 'Monetization gaps', 'Revenue streams competitors run that you do not, with adoption evidence.', '{manual,atlas}', 'ranked_list', false, 2),
  ('yield.wtp_signals', 'agent_revenue_streams', 'Willingness-to-pay signals', 'Mines review language about price per segment; flags under/over-pricing signals.', '{manual,cadence}', 'report', false, 3),
  ('envoy.supply_chain_map', 'agent_key_partnerships', 'Supply-chain map', 'Maps upstream/downstream of the industry; scores partnership candidates by fit with evidence.', '{manual,atlas}', 'target_map', false, 1),
  ('envoy.partner_outreach', 'agent_key_partnerships', 'Partner outreach drafts', 'Drafts personalized outreach for approved targets; drafts land in the approvals queue, never sent autonomously.', '{manual}', 'approvals_draft', false, 2),
  ('envoy.ecosystem_watch', 'agent_key_partnerships', 'Ecosystem watch', 'Competitor partnership announcements trigger counter-partner suggestions.', '{event}', 'memo', false, 3),
  ('relay.channel_gap_scan', 'agent_channels', 'Channel gap scan', 'Where competitors get distribution versus you, ranked by effort and impact.', '{manual,atlas}', 'strategy_board', true, 1),
  ('relay.watering_holes', 'agent_channels', 'Watering holes', 'Where the ICP congregates, with an entry strategy per hole.', '{manual}', 'report', false, 2),
  ('relay.channel_economics', 'agent_channels', 'Channel economics', 'CAC posture per channel from public signals; pairs with Ledger.', '{manual}', 'table', true, 3),
  ('compass.avatar_refinement', 'agent_customer_segments', 'Avatar refinement', 'Mines reviews/communities for the segment''s own words; updates ICP cards and messaging hooks.', '{manual,cadence,atlas}', 'icp_cards', true, 1),
  ('compass.segment_expansion', 'agent_customer_segments', 'Segment expansion scan', 'Adjacent segments competitors serve, scored by fit with your capabilities.', '{manual,atlas}', 'ranked_list', true, 2),
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

-- workspace_chat route (RF-LIVE-8): chat runs on the Claude Agent SDK; the
-- legacy 'standard' profile default (xai/grok) cannot drive it. Mirrors
-- 20260706010000_workspace_chat_route.sql.
insert into public.model_routes
  (account_id, route_key, label, provider, model_name, params, is_default, task_class, cost_per_1k_in, cost_per_1k_out, updated_by)
values
  (null, 'workspace_chat', 'Workspace Chat (mid)', 'anthropic', 'claude-sonnet-5',
   '{"temperature":0.4,"max_tokens":4000}'::jsonb, false, 'workspace_chat', 0.002, 0.01, 'human')
on conflict (route_key) where account_id is null do update set
  label = excluded.label, provider = excluded.provider, model_name = excluded.model_name,
  params = excluded.params, task_class = excluded.task_class,
  cost_per_1k_in = excluded.cost_per_1k_in, cost_per_1k_out = excluded.cost_per_1k_out,
  updated_by = excluded.updated_by;

-- atlas_briefing route (spec 12): Atlas's State of the Union synthesizes the
-- whole board in one opus-class call. Mirrors
-- 20260707000000_atlas_briefing_route.sql.
insert into public.model_routes
  (account_id, route_key, label, provider, model_name, params, is_default, task_class, cost_per_1k_in, cost_per_1k_out, updated_by)
values
  (null, 'atlas_briefing', 'Atlas Briefing (top)', 'anthropic', 'claude-opus-4-8',
   '{"temperature":0.3,"max_tokens":4000}'::jsonb, false, 'atlas_briefing', 0.015, 0.075, 'human')
on conflict (route_key) where account_id is null do update set
  label = excluded.label, provider = excluded.provider, model_name = excluded.model_name,
  params = excluded.params, task_class = excluded.task_class,
  cost_per_1k_in = excluded.cost_per_1k_in, cost_per_1k_out = excluded.cost_per_1k_out,
  updated_by = excluded.updated_by;

-- =============================================================================
-- ATLAS AT-1: BUSINESS BRAIN + COVERAGE MANIFEST
-- =============================================================================

create table if not exists public.brain_variables (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  path text not null,
  value jsonb not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  source text not null check (
    source in ('user_stated', 'user_override', 'scraped')
    or source ~ '^(mcp_pull|workflow):[^[:space:]]+$'
  ),
  source_artifact text,
  staleness_policy text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (account_id, path)
);

create table if not exists public.brain_variable_history (
  id uuid primary key default gen_random_uuid(),
  variable_id uuid not null references public.brain_variables(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete cascade,
  path text not null,
  value jsonb not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  source text not null check (
    source in ('user_stated', 'user_override', 'scraped')
    or source ~ '^(mcp_pull|workflow):[^[:space:]]+$'
  ),
  source_artifact text,
  staleness_policy text,
  change_reason text not null check (
    change_reason in ('initial', 'update', 'user_override', 'contradiction_resolution')
  ),
  updated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.coverage_manifest (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  path text not null,
  section_key text,
  title text not null,
  value_weight integer not null check (value_weight > 0),
  fill_actions jsonb not null check (jsonb_typeof(fill_actions) = 'array'),
  freshness text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists brain_variables_account_path_unique
  on public.brain_variables(account_id, path);
create index if not exists brain_variables_account_path_idx
  on public.brain_variables(account_id, path);
create index if not exists brain_variable_history_account_path_created_idx
  on public.brain_variable_history(account_id, path, created_at desc);
create index if not exists brain_variable_history_variable_created_idx
  on public.brain_variable_history(variable_id, created_at desc);
create unique index if not exists coverage_manifest_global_path_unique
  on public.coverage_manifest(path) where account_id is null;
create unique index if not exists coverage_manifest_account_path_unique
  on public.coverage_manifest(account_id, path) where account_id is not null;
create index if not exists coverage_manifest_account_sort_idx
  on public.coverage_manifest(account_id, sort_order, path);

alter table public.brain_variables enable row level security;
alter table public.brain_variable_history enable row level security;
alter table public.coverage_manifest enable row level security;

drop policy if exists "brain_variables_select_member" on public.brain_variables;
create policy "brain_variables_select_member" on public.brain_variables
  for select to authenticated using (public.is_account_member(account_id));
drop policy if exists "brain_variable_history_select_member" on public.brain_variable_history;
create policy "brain_variable_history_select_member" on public.brain_variable_history
  for select to authenticated using (public.is_account_member(account_id));
drop policy if exists "coverage_manifest_select" on public.coverage_manifest;
create policy "coverage_manifest_select" on public.coverage_manifest
  for select to authenticated
  using (account_id is null or public.is_account_member(account_id));

create or replace function public.reject_brain_variable_history_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'brain_variable_history is append-only';
end;
$$;
drop trigger if exists brain_variable_history_append_only on public.brain_variable_history;
create trigger brain_variable_history_append_only
  before update or delete on public.brain_variable_history
  for each row execute function public.reject_brain_variable_history_mutation();

-- One service-role RPC is the transaction boundary for trust evaluation,
-- variable upserts, and append-only history. Lock paths in deterministic order
-- so concurrent worker jobs cannot race a user-authored value.
create or replace function public.write_brain_variables(
  p_account_id uuid,
  p_writes jsonb,
  p_source text,
  p_source_artifact text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_write jsonb;
  v_path text;
  v_value jsonb;
  v_confidence text;
  v_staleness_policy text;
  v_existing public.brain_variables;
  v_saved public.brain_variables;
  v_reason text;
  v_contradiction_path text;
  v_variables jsonb := '[]'::jsonb;
  v_contradictions jsonb := '[]'::jsonb;
  v_history jsonb := '[]'::jsonb;
  v_is_machine boolean;
begin
  if jsonb_typeof(p_writes) <> 'array' then
    raise exception 'p_writes must be a JSON array';
  end if;
  if not (
    p_source in ('user_stated', 'user_override', 'scraped')
    or p_source ~ '^(mcp_pull|workflow):[^[:space:]]+$'
  ) then
    raise exception 'invalid brain variable source: %', p_source;
  end if;

  v_is_machine := p_source = 'scraped'
    or p_source like 'mcp_pull:%'
    or p_source like 'workflow:%';

  -- Advisory locks cover paths that do not exist yet; row locks below cover
  -- existing records. Sorting prevents deadlocks for overlapping batches.
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text || ':' || value, 0))
  from (
    select distinct item->>'path' as value
    from jsonb_array_elements(p_writes) item
    order by value
  ) locked_paths;

  for v_write in select value from jsonb_array_elements(p_writes)
  loop
    v_path := nullif(btrim(v_write->>'path'), '');
    v_value := v_write->'value';
    v_confidence := v_write->>'confidence';
    v_staleness_policy := v_write->>'staleness_policy';
    if v_path is null or v_value is null then
      raise exception 'each brain write requires path and value';
    end if;
    if v_confidence not in ('high', 'medium', 'low') then
      raise exception 'invalid confidence for %: %', v_path, v_confidence;
    end if;

    select * into v_existing
    from public.brain_variables
    where account_id = p_account_id and path = v_path
    for update;

    if found
      and v_existing.source in ('user_stated', 'user_override')
      and v_is_machine then
      v_contradiction_path := 'contradiction.' || v_path;
      insert into public.brain_variables (
        account_id, path, value, confidence, source, source_artifact,
        staleness_policy, updated_at
      ) values (
        p_account_id,
        v_contradiction_path,
        jsonb_build_object(
          'existing', v_existing.value,
          'incoming', v_value,
          'detected_at', now()
        ),
        v_confidence,
        p_source,
        p_source_artifact,
        null,
        now()
      )
      on conflict (account_id, path) do update set
        value = excluded.value,
        confidence = excluded.confidence,
        source = excluded.source,
        source_artifact = excluded.source_artifact,
        staleness_policy = excluded.staleness_policy,
        updated_at = excluded.updated_at
      returning * into v_saved;
      v_reason := 'contradiction_resolution';
      v_contradictions := v_contradictions || jsonb_build_array(jsonb_build_object(
        'path', v_path,
        'existing', to_jsonb(v_existing),
        'incoming', v_write || jsonb_build_object('source', p_source),
        'contradictionPath', v_contradiction_path
      ));
    else
      insert into public.brain_variables (
        account_id, path, value, confidence, source, source_artifact,
        staleness_policy, updated_at
      ) values (
        p_account_id, v_path, v_value, v_confidence, p_source,
        p_source_artifact, v_staleness_policy, now()
      )
      on conflict (account_id, path) do update set
        value = excluded.value,
        confidence = excluded.confidence,
        source = excluded.source,
        source_artifact = excluded.source_artifact,
        staleness_policy = coalesce(excluded.staleness_policy, public.brain_variables.staleness_policy),
        updated_at = excluded.updated_at
      returning * into v_saved;
      v_reason := case
        when v_existing.id is null then 'initial'
        when p_source in ('user_stated', 'user_override') then 'user_override'
        else 'update'
      end;
    end if;

    insert into public.brain_variable_history (
      variable_id, account_id, path, value, confidence, source,
      source_artifact, staleness_policy, change_reason, updated_at, created_at
    ) values (
      v_saved.id, v_saved.account_id, v_saved.path, v_saved.value,
      v_saved.confidence, v_saved.source, v_saved.source_artifact,
      v_saved.staleness_policy, v_reason, v_saved.updated_at, v_saved.created_at
    );
    v_variables := v_variables || jsonb_build_array(to_jsonb(v_saved));
    v_history := v_history || jsonb_build_array(
      to_jsonb(v_saved) || jsonb_build_object('variable_id', v_saved.id, 'change_reason', v_reason)
    );
    v_existing := null;
  end loop;

  return jsonb_build_object(
    'variables', v_variables,
    'contradictions', v_contradictions,
    'history', v_history
  );
end;
$$;

revoke all on function public.write_brain_variables(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.write_brain_variables(uuid, jsonb, text, text) to service_role;

insert into public.coverage_manifest
  (account_id, path, section_key, title, value_weight, fill_actions, freshness, sort_order)
values
  (null, 'canvas.customer_segments', 'customer_segments', 'Customer Segments', 10, '[{"action":"ask","prompt":"Who are the highest-value customer segments, and what jobs do they need done?"},{"action":"scrape"}]'::jsonb, '90 days', 10),
  (null, 'canvas.value_propositions', 'value_propositions', 'Value Propositions', 9, '[{"action":"ask","prompt":"What concrete pains do you solve and gains do you create for each target segment?"},{"action":"scrape"}]'::jsonb, '90 days', 20),
  (null, 'canvas.channels', 'channels', 'Channels', 7, '[{"action":"ask","prompt":"How do customers discover, evaluate, buy, and receive your offering?"},{"action":"scrape"}]'::jsonb, '90 days', 30),
  (null, 'canvas.customer_relationships', 'customer_relationships', 'Customer Relationships', 6, '[{"action":"ask","prompt":"What relationship does each segment expect across acquisition, retention, and expansion?"},{"action":"scrape"}]'::jsonb, '90 days', 40),
  (null, 'canvas.revenue_streams', 'revenue_streams', 'Revenue Streams', 8, '[{"action":"ask","prompt":"How do you charge, and what are the main revenue models and unit economics?"},{"action":"scrape"}]'::jsonb, '90 days', 50),
  (null, 'canvas.key_resources', 'key_resources', 'Key Resources', 7, '[{"action":"ask","prompt":"Which physical, intellectual, human, and financial resources are critical to delivery?"},{"action":"scrape"}]'::jsonb, '180 days', 60),
  (null, 'canvas.key_activities', 'key_activities', 'Key Activities', 7, '[{"action":"ask","prompt":"Which production, problem-solving, or platform activities create the value?"},{"action":"scrape"}]'::jsonb, '180 days', 70),
  (null, 'canvas.key_partners', 'key_partners', 'Key Partners', 6, '[{"action":"ask","prompt":"Who are the strategic partners, suppliers, distributors, or coopetitors you rely on?"},{"action":"scrape"}]'::jsonb, '180 days', 80),
  (null, 'canvas.cost_structure', 'cost_structure', 'Cost Structure', 8, '[{"action":"ask","prompt":"What are the fixed, variable, and largest cost drivers of this business model?"},{"action":"scrape"}]'::jsonb, '90 days', 90),
  (null, 'positioning.competitive_alternatives', null, 'Competitive Alternatives', 8, '[{"action":"ask","prompt":"What would customers actually do if this product did not exist?"},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 100),
  (null, 'positioning.unique_attributes', null, 'Unique Attributes', 8, '[{"action":"ask","prompt":"Which attributes are meaningfully different and which alternatives lack them?"},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 110),
  (null, 'positioning.value_themes', null, 'Value Themes', 8, '[{"action":"ask","prompt":"What customer value themes do the differentiated attributes create?"},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 120),
  (null, 'positioning.best_fit_segment', null, 'Best-Fit Segment', 9, '[{"action":"ask","prompt":"Which customers care most about the differentiated value, and why?"},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 130),
  (null, 'positioning.category_frame', null, 'Category Frame', 7, '[{"action":"ask","prompt":"Should the product compete head-on, define a subcategory, or create a new game?"},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 140),
  (null, 'positioning.statement', null, 'Positioning Statement', 9, '[{"action":"ask","prompt":"What is the canonical positioning statement grounded in the canvas and sprint evidence?"},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 150),
  (null, 'positioning.one_liner', null, 'Positioning One-Liner', 7, '[{"action":"ask","prompt":"Summarize the positioning in no more than 20 words."},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 160),
  (null, 'positioning.confidence', null, 'Positioning Confidence', 5, '[{"action":"ask","prompt":"How confident is the positioning, and what evidence would raise confidence?"},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 170)
on conflict (path) where account_id is null do nothing;
