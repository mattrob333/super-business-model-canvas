-- Enterprise Strategy Workspace: Canonical Tables
-- Phase 2: Context Store Schema
-- Adds 12 new tables for versioned business context, canvas sections,
-- evidence, gaps, agent profiles, agent runs, scheduled loops, provider
-- credentials, and MCP server registry. Preserves all existing tables.

-- Extensions (idempotent — these exist already in most Supabase projects)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE agent_type AS ENUM ('orchestrator', 'section_agent', 'utility', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agent_status AS ENUM ('active', 'paused', 'draft', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agent_run_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agent_run_trigger AS ENUM ('manual', 'scheduled', 'api', 'cascade', 'retry');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gap_severity AS ENUM ('critical', 'high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gap_status AS ENUM ('open', 'acknowledged', 'in_progress', 'resolved', 'wont_fix');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gap_type AS ENUM ('missing_data', 'low_confidence', 'no_evidence', 'outdated', 'contradictory', 'assumption');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE credential_status AS ENUM ('active', 'revoked', 'expired', 'untested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mcp_transport_type AS ENUM ('stdio', 'http', 'sse', 'websocket');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mcp_server_status AS ENUM ('connected', 'disconnected', 'error', 'untested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE loop_status AS ENUM ('active', 'paused', 'error', 'exhausted_budget', 'exhausted_failures');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE freshness_status AS ENUM ('fresh', 'stale', 'outdated', 'unverified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE evidence_source_type AS ENUM ('website', 'filing', 'news', 'transcript', 'social', 'api', 'document', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE account_member_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- ACCOUNTS (multi-tenant root)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_select_authenticated"
  ON public.accounts FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "accounts_insert_authenticated"
  ON public.accounts FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- ACCOUNT MEMBERS (user <-> account join)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.account_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role account_member_role NOT NULL DEFAULT 'editor',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_members_select_own"
  ON public.account_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "account_members_insert_own"
  ON public.account_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "account_members_update_own"
  ON public.account_members FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_account_members_account ON public.account_members(account_id);
CREATE INDEX idx_account_members_user ON public.account_members(user_id);

-- ============================================================================
-- BUSINESS CONTEXT VERSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.business_context_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_analysis_id uuid,  -- nullable ref to saved_analyses (backward compat)
  version_number integer NOT NULL DEFAULT 1,
  summary text,
  company_name text,
  website text,
  industry text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_context_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_context_versions_select_account"
  ON public.business_context_versions FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "business_context_versions_insert_account"
  ON public.business_context_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "business_context_versions_update_account"
  ON public.business_context_versions FOR UPDATE
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_bcv_account ON public.business_context_versions(account_id);

-- ============================================================================
-- CANVAS SECTION VERSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.canvas_section_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  business_context_version_id uuid NOT NULL REFERENCES public.business_context_versions(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  section_title text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  confidence numeric(3,2),
  freshness_status freshness_status NOT NULL DEFAULT 'unverified',
  last_verified_at timestamptz,
  created_by_agent_profile_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.canvas_section_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canvas_section_versions_select_account"
  ON public.canvas_section_versions FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "canvas_section_versions_insert_account"
  ON public.canvas_section_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "canvas_section_versions_update_account"
  ON public.canvas_section_versions FOR UPDATE
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_csv_account ON public.canvas_section_versions(account_id);
CREATE INDEX idx_csv_context ON public.canvas_section_versions(business_context_version_id);
CREATE INDEX idx_csv_section_key ON public.canvas_section_versions(section_key);

-- ============================================================================
-- EVIDENCE ITEMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_type evidence_source_type NOT NULL DEFAULT 'manual',
  source_name text,
  source_url text,
  source_date date,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  excerpt text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_agent_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evidence_items_select_account"
  ON public.evidence_items FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "evidence_items_insert_account"
  ON public.evidence_items FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "evidence_items_update_account"
  ON public.evidence_items FOR UPDATE
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_evidence_account ON public.evidence_items(account_id);

-- ============================================================================
-- GAPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  gap_type gap_type NOT NULL DEFAULT 'missing_data',
  severity gap_severity NOT NULL DEFAULT 'medium',
  impact text,
  effort text,
  confidence numeric(3,2),
  status gap_status NOT NULL DEFAULT 'open',
  affected_sections text[] NOT NULL DEFAULT '{}',
  evidence_ids uuid[] NOT NULL DEFAULT '{}',
  recommended_action text,
  created_by_agent_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gaps_select_account"
  ON public.gaps FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "gaps_insert_account"
  ON public.gaps FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "gaps_update_account"
  ON public.gaps FOR UPDATE
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_gaps_account ON public.gaps(account_id);
CREATE INDEX idx_gaps_status ON public.gaps(status);

-- ============================================================================
-- AGENT PROFILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  display_name text NOT NULL,
  agent_type agent_type NOT NULL DEFAULT 'section_agent',
  description text,
  assigned_sections text[] NOT NULL DEFAULT '{}',
  model_route_key text,
  allowed_mcp_server_ids uuid[] NOT NULL DEFAULT '{}',
  status agent_status NOT NULL DEFAULT 'draft',
  system_instructions_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_profiles ENABLE ROW LEVEL SECURITY;

-- Account-scoped agents: user must be member of the account
CREATE POLICY "agent_profiles_select_account"
  ON public.agent_profiles FOR SELECT
  TO authenticated
  USING (
    account_id IS NULL
    OR account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "agent_profiles_insert_account"
  ON public.agent_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id IS NULL
    OR account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "agent_profiles_update_account"
  ON public.agent_profiles FOR UPDATE
  TO authenticated
  USING (
    account_id IS NULL
    OR account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_agent_profiles_account ON public.agent_profiles(account_id);
CREATE INDEX idx_agent_profiles_key ON public.agent_profiles(agent_key);

-- ============================================================================
-- AGENT RUNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  agent_profile_id uuid NOT NULL REFERENCES public.agent_profiles(id) ON DELETE CASCADE,
  run_type text,
  trigger_type agent_run_trigger NOT NULL DEFAULT 'manual',
  triggered_by uuid,
  status agent_run_status NOT NULL DEFAULT 'pending',
  input jsonb,
  output jsonb,
  summary text,
  model_provider text,
  model_name text,
  tokens_in integer,
  tokens_out integer,
  estimated_cost numeric(10,4),
  started_at timestamptz,
  completed_at timestamptz,
  error text
);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_runs_select_account"
  ON public.agent_runs FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "agent_runs_insert_account"
  ON public.agent_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "agent_runs_update_account"
  ON public.agent_runs FOR UPDATE
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_agent_runs_account ON public.agent_runs(account_id);
CREATE INDEX idx_agent_runs_profile ON public.agent_runs(agent_profile_id);
CREATE INDEX idx_agent_runs_status ON public.agent_runs(status);

-- ============================================================================
-- SCHEDULED LOOPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scheduled_loops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  agent_profile_id uuid NOT NULL REFERENCES public.agent_profiles(id) ON DELETE CASCADE,
  loop_name text NOT NULL,
  schedule text NOT NULL,
  skill_ids text[] NOT NULL DEFAULT '{}',
  prompt_template text,
  max_runtime_minutes integer NOT NULL DEFAULT 30,
  max_consecutive_failures integer NOT NULL DEFAULT 3,
  monthly_budget numeric(10,2),
  allowed_mcp_server_ids uuid[] NOT NULL DEFAULT '{}',
  status loop_status NOT NULL DEFAULT 'active',
  last_run_at timestamptz,
  next_run_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_loops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduled_loops_select_account"
  ON public.scheduled_loops FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "scheduled_loops_insert_account"
  ON public.scheduled_loops FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "scheduled_loops_update_account"
  ON public.scheduled_loops FOR UPDATE
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_scheduled_loops_account ON public.scheduled_loops(account_id);
CREATE INDEX idx_scheduled_loops_status ON public.scheduled_loops(status);

-- ============================================================================
-- PROVIDER CREDENTIALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  provider text NOT NULL,
  label text,
  encrypted_secret text NOT NULL,
  secret_last_four text,
  status credential_status NOT NULL DEFAULT 'untested',
  validated_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_credentials_select_account"
  ON public.provider_credentials FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "provider_credentials_insert_account"
  ON public.provider_credentials FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "provider_credentials_update_account"
  ON public.provider_credentials FOR UPDATE
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "provider_credentials_delete_account"
  ON public.provider_credentials FOR DELETE
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_provider_credentials_account ON public.provider_credentials(account_id);

-- ============================================================================
-- MCP SERVERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  transport_type mcp_transport_type NOT NULL DEFAULT 'stdio',
  command text,
  args jsonb NOT NULL DEFAULT '[]'::jsonb,
  url text,
  headers_encrypted jsonb,
  env_encrypted jsonb,
  auth_type text,
  enabled boolean NOT NULL DEFAULT false,
  status mcp_server_status NOT NULL DEFAULT 'untested',
  last_tested_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_servers_select_account"
  ON public.mcp_servers FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "mcp_servers_insert_account"
  ON public.mcp_servers FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "mcp_servers_update_account"
  ON public.mcp_servers FOR UPDATE
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "mcp_servers_delete_account"
  ON public.mcp_servers FOR DELETE
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_mcp_servers_account ON public.mcp_servers(account_id);

-- ============================================================================
-- MCP SERVER TOOLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mcp_server_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcp_server_id uuid NOT NULL REFERENCES public.mcp_servers(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  risk_level text NOT NULL DEFAULT 'medium',
  last_discovered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mcp_server_tools ENABLE ROW LEVEL SECURITY;

-- Tools inherit access from their parent MCP server's account membership
CREATE POLICY "mcp_server_tools_select_account"
  ON public.mcp_server_tools FOR SELECT
  TO authenticated
  USING (
    mcp_server_id IN (
      SELECT id FROM public.mcp_servers ms
      WHERE ms.account_id IN (
        SELECT account_id FROM public.account_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "mcp_server_tools_insert_account"
  ON public.mcp_server_tools FOR INSERT
  TO authenticated
  WITH CHECK (
    mcp_server_id IN (
      SELECT id FROM public.mcp_servers ms
      WHERE ms.account_id IN (
        SELECT account_id FROM public.account_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "mcp_server_tools_update_account"
  ON public.mcp_server_tools FOR UPDATE
  TO authenticated
  USING (
    mcp_server_id IN (
      SELECT id FROM public.mcp_servers ms
      WHERE ms.account_id IN (
        SELECT account_id FROM public.account_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "mcp_server_tools_delete_account"
  ON public.mcp_server_tools FOR DELETE
  TO authenticated
  USING (
    mcp_server_id IN (
      SELECT id FROM public.mcp_servers ms
      WHERE ms.account_id IN (
        SELECT account_id FROM public.account_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE INDEX idx_mcp_server_tools_server ON public.mcp_server_tools(mcp_server_id);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['accounts', 'gaps', 'agent_profiles', 'scheduled_loops', 'provider_credentials', 'mcp_servers'])
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
        t
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
