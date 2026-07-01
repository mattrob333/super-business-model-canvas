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
--  15. Drop dead/legacy tables
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
do $$ begin create type public.gap_status as enum ('open', 'acknowledged', 'in_progress', 'resolved', 'wont_fix'); exception when duplicate_object then null; end $$;
do $$ begin create type public.gap_type as enum ('missing_data', 'low_confidence', 'no_evidence', 'outdated', 'contradictory', 'assumption'); exception when duplicate_object then null; end $$;
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

create table if not exists public.canvas_section_versions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  business_context_version_id uuid not null references public.business_context_versions(id) on delete cascade,
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
  title text not null,
  description text,
  gap_type public.gap_type not null default 'missing_data',
  severity public.gap_severity not null default 'medium',
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
create index if not exists idx_csv_account on public.canvas_section_versions(account_id);
create index if not exists idx_csv_context on public.canvas_section_versions(business_context_version_id);
create index if not exists idx_csv_section_key on public.canvas_section_versions(section_key);
create index if not exists idx_evidence_account on public.evidence_items(account_id);
create index if not exists idx_gaps_account on public.gaps(account_id);
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

-- Composite indexes for hot read paths
create index if not exists idx_csv_latest_per_section
  on public.canvas_section_versions(account_id, section_key, created_at desc);
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
  for update to authenticated using (public.is_account_member(id));

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
    'business_context_versions', 'canvas_section_versions',
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
-- 15. DROP DEAD / LEGACY TABLES
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
