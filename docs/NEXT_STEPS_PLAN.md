# Enterprise Strategy Workspace — Execution Plan

> For the two-tier autonomous build loop. The inner builder reads this each tick, the outer supervisor audits against it.

**Goal:** Convert the existing `super-business-model-canvas` (dark-only, Lovable-style, single-JSON-blob data) into an enterprise-grade strategy workspace with agent-assisted Business Model Canvas, gap register, MCP connections, and scheduled loops.

**Repo:** https://github.com/mattrob333/super-business-model-canvas (branch: `enterprise-strategy-workspace`)

**Tech Stack:** Vite + React 18 + TypeScript, shadcn/ui + Radix + Tailwind, Supabase (Auth, Postgres, Edge Functions)

**Quality Gate:** `npm run build` must pass before every commit. `npm run lint` — pre-existing errors must not increase.

---

## Phases (ordered, do not skip ahead)

### Phase 2: Context Store Schema (current)
Add canonical versioned tables alongside existing `saved_analyses`. Preserve backward compatibility.

**Deliverables:**
1. New Supabase migration file in `supabase/migrations/` with 11 tables:
   - `accounts` (id, name, created_at)
   - `account_members` (id, account_id, user_id, role, created_at)
   - `business_context_versions` (id, account_id, source_analysis_id nullable, version_number, summary, company_name, website, industry, data jsonb, created_by, created_at)
   - `canvas_section_versions` (id, account_id, business_context_version_id, section_key, section_title, items jsonb, notes text, confidence numeric, freshness_status, last_verified_at, created_by_agent_profile_id nullable, created_by, created_at)
   - `evidence_items` (id, account_id, source_type, source_name, source_url, source_date, retrieved_at, title, excerpt, metadata jsonb, created_by_agent_run_id nullable, created_at)
   - `gaps` (id, account_id, title, description, gap_type, severity, impact, effort, confidence, status, affected_sections text[], evidence_ids uuid[], recommended_action, created_by_agent_run_id nullable, created_at, updated_at)
   - `agent_profiles` (id, account_id, agent_key, display_name, agent_type, description, assigned_sections text[], model_route_key, allowed_mcp_server_ids uuid[], status, system_instructions_summary, created_at, updated_at)
   - `agent_runs` (id, account_id, agent_profile_id, run_type, trigger_type, triggered_by, status, input jsonb, output jsonb, summary, model_provider, model_name, tokens_in, tokens_out, estimated_cost, started_at, completed_at, error)
   - `scheduled_loops` (id, account_id, agent_profile_id, loop_name, schedule, skill_ids text[], prompt_template, max_runtime_minutes, max_consecutive_failures, monthly_budget, allowed_mcp_server_ids uuid[], status, last_run_at, next_run_at, failure_count, created_at, updated_at)
   - `provider_credentials` (id, account_id, provider, label, encrypted_secret text, secret_last_four, status, validated_at, created_by, created_at, updated_at)
   - `mcp_servers` (id, account_id, name, transport_type, command, args jsonb, url, headers_encrypted jsonb, env_encrypted jsonb, auth_type, enabled boolean, status, last_tested_at, created_by, created_at, updated_at)
   - `mcp_server_tools` (id, mcp_server_id, tool_name, description, enabled boolean, risk_level, last_discovered_at, created_at)

2. RLS policies: every table scoped to `account_id` where applicable. Use `auth.uid()` checks.

3. Seed migration: insert 10 default agent profiles (orchestrator + 9 BMC section agents).

4. Update `src/integrations/supabase/types.ts` with new table types.

**Files:** `supabase/migrations/<timestamp>_canonical_tables.sql`, `supabase/migrations/<timestamp>_seed_agent_profiles.sql`, `src/integrations/supabase/types.ts`

### Phase 3: Canvas Workspace Upgrade
Refactor `BusinessModelCanvas.tsx` into professional section cards with agent badges, confidence indicators, evidence counts, gap badges.

### Phase 4: Settings + Provider Keys + MCP Registry
Functional provider key management (masked, never returned to browser), model routing, MCP server configuration.

### Phase 5: Agent Profiles + Activity
Agents registry page, agent run logging, Activity stream.

### Phase 6-10: Agentic slices, Hermes runtime, framework skills, expansion, polish.

---

## Build Brief Reference
The full 21-page spec is at the conversation start. Key non-negotiables:
1. Database owns truth — not Hermes memory
2. Hermes is the agent runtime, not the backend — AgentRuntime interface boundary
3. Every agent run produces a durable record
4. Every claim has evidence or is marked low confidence
5. Default posture is propose-before-execute for external mutations
6. Never expose secrets to browser
7. Light mode default, dark mode supported
8. 8px card radius, no neon/glow, professional enterprise aesthetic
9. Never rename the product; preserve repo name

---

**Last Updated:** 2025-06-24 — Created for autonomous build loop
