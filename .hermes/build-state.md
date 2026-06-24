# Build State: Enterprise Strategy Workspace

**Spec source:** Hermes Build Brief (21-page enterprise revamp of super-business-model-canvas)
**Repo:** https://github.com/mattrob333/super-business-model-canvas
**Workspace:** C:\Users\mrobe\Documents\Projects\SuperBMCenterprise\super-business-model-canvas
**Status:** Phase 7 In Progress — Model routing + config persistence done. Next: runtime health check button (final Phase 7 task).

## Architecture: Two-Tier Autonomous Build Loop
- Inner Loop (cron 779c6bf918c9) — every 10m: Check -> Test -> Advance -> Repeat
- Outer Loop (cron 14e78388ccf6) — every 60m: Audit -> Write Corrections -> Fix Trivial -> Escalate

## Phases / Waves

### Phase 0: Baseline Audit ✅
1. [x] Repo status verified (main @ 6c6d3d2, one dirty package-lock.json)
2. [x] Build verification (`npm run build` passes, 8.2s)
3. [x] Lint audit (22 errors, 9 warnings — all pre-existing, documented)
4. [x] Current architecture mapped (Vite+React18+TS, shadcn/ui, Supabase, dark-only lime/black)
5. [x] Hermes architecture research documented (docs/hermes-architecture-notes.md)
6. [x] Security audit (.env present in repo, no .env.example, lovable-tagger remnant)
7. [x] UI inventory (dark-only, black/lime neon, rounded-3xl, Lovable-style)
8. [x] Branch created: `enterprise-strategy-workspace` (pushed to origin)

### Phase 1: Enterprise UI Foundation ✅ (commit 1c924df)
1. [x] Theme provider with light-mode default (ThemeProvider wrapping next-themes)
2. [x] Light/dark CSS variables (deep indigo/cool gray enterprise palette, 8px radius)
3. [x] AppShell with left nav (SidebarNav, TopBar, AccountSwitcher)
4. [x] Dashboard route (`/dashboard`)
5. [x] Settings route shell (`/settings` — 7 tabs, General functional)
6. [x] Authenticated routes wrapped in AppShell layout
7. [x] Create `.env.example`
8. [x] Remove `lovable-tagger` devDep

### Phase 2: Context Store Schema ✅ (commit 35cf3f6)
1. [x] Migration file: 12 canonical tables with RLS, enums, indexes, triggers
2. [x] Seed migration: 10 default agent profiles (orchestrator + 9 BMC section agents)
3. [x] TypeScript types updated: all 12 tables + 14 new enums + Constants
4. [x] Build passes (6.61s)

### Phase 3: Canvas Workspace Upgrade ✅ (commits 061b6ab + f528991 + e97eecf + b1741d7 + b684f0e)
1. [x] CanvasSectionCard component (commit 061b6ab) — agent badges, confidence indicators, freshness badges, evidence/gap counts, enterprise 8px-radius Card
2. [x] section-types.ts — canonical section keys + legacy camelCase mapping + agent key mapping
3. [x] EnterpriseBusinessModelCanvas component (commit f528991) — full BMC grid using CanvasSectionCard, backward-compatible with legacy data, BMCSectionEditor integration
4. [x] Canvas page at `/canvas` (commit f528991) — standalone workspace with empty state, summary bar, route wired in App.tsx
5. [x] Wire EnterpriseBusinessModelCanvas into Analysis.tsx page (commit e97eecf)
6. [x] Gap Register page at `/gaps` (commit b1741d7) — filtering + stats
7. [x] Knowledge/Evidence page shell at `/knowledge` (commit b684f0e)

### Phase 4: Settings + Provider Keys + MCP Registry ✅ (commits 2787fae + a9f3caf)
1. [x] ProviderCredentialsManager (commit 2787fae) — list/add/revoke/delete API keys, encrypted_secret never selected, add via edge function
2. [x] ModelRoutingPanel (commit 2787fae) — assign model routes per agent (premium/standard/economy/local)
3. [x] McpConnectionsManager (commit 2787fae) — list/add/test/delete MCP servers + tools, encrypted cols never selected
4. [x] useAccountId hook (commit 2787fae) — resolves current workspace from account_members
5. [x] Hermes Runtime tab (commit a9f3caf) — AgentRuntime interface boundary in src/lib/agent-runtime/, MockAgentRuntime, config UI
6. [x] Schedules tab (commit a9f3caf) — ScheduledLoopsManager, CRUD for scheduled_loops, cron presets, budget/failure limits
7. [x] Security tab — remains placeholder (will be built during hardening phase)

### Phase 5: Agent Profiles + Activity ✅ (commits 74e737e + 8c5b148 + 83881e4)
- [x] Agents page (/agents) — 10-agent registry grid, status badges, section ownership
- [x] Activity page (/activity) — activity stream with type legend + empty state
- [x] Wire Agents page to live agent_profiles data (commit 8c5b148)
- [x] Wire Activity page to live agent_runs data (commit 8c5b148)
- [x] Agent run detail view (commit 83881e4) — AgentRunDetailDialog with full run info (input/output JSON, tokens, cost, timing, errors), clickable run rows in both Agents + Activity pages

### Phase 6: First Agentic Vertical Slice ✅ (commit d51c1df)
1. [x] useCanvasSectionRun hook — orchestrates full loop: resolve agent_profile → ensure business_context_version → AgentRuntime.startRun() → poll for completion → write canvas_section_versions → update UI
2. [x] CanvasSectionCard: "Analyze" button, loading overlay, error banner, focus-visible ring
3. [x] Canvas page: wired to live canvas_section_versions + agent_profiles data, auto-refresh on run completion
4. [x] 9 section-specific mock analysis datasets (realistic BMC content per section)
5. [x] Toast notifications (start/complete/error) via sonner
6. [x] Full circuit proven: UI trigger → agent_runs record → canvas_section_versions → UI refresh
### Phase 7: Hermes Runtime Integration (in progress)
1. [x] Env-gated factory: getAgentRuntime() returns HermesAgentRuntime when VITE_HERMES_RUNTIME_ENDPOINT is set, MockAgentRuntime otherwise (commit e778252)
2. [x] HermesAgentRuntime class: calls Supabase Edge Function for real LLM execution (commit e778252)
3. [x] agent-run Edge Function: multi-provider LLM support (OpenAI/Anthropic/OpenRouter/xAI) with structured JSON output (commit e778252)
4. [x] agent-runtime/config.ts: env detection module (commit e778252)
5. [x] useCanvasSectionRun: live mode fetches real LLM output from agent_runs (commit e778252)
6. [x] HermesRuntimePanel: shows actual runtime mode badge (Live/Mock) (commit e778252)
7. [x] .env.example: VITE_HERMES_RUNTIME_ENDPOINT + VITE_HERMES_RUNTIME_API_KEY (commit e778252)
8. [x] Runtime config persistence (save to DB, load on startup) (commit 1d17cd3)
9. [ ] Runtime health check / connection test button
10. [x] Model routing: wire provider_credentials + model_route_key to edge function LLM selection (commit c1957fa)
### Phase 8: Framework Skills [ ]
### Phase 9: Expand Agents and Loops [ ]
### Phase 10: Polish and Hardening [ ]

## Completed Tasks
- Created `enterprise-strategy-workspace` branch from main (6c6d3d2)
- Phase 0: Verified `npm run build` passes, documented Hermes architecture, lint audit
- Phase 1 (commit 1c924df): Enterprise theme (deep indigo/cool gray, light-mode default), AppShell layout (SidebarNav + TopBar), Dashboard page, Settings page (7 tabs), ThemeProvider, .env.example, removed lovable-tagger
- Phase 2 (commit 35cf3f6): 12 canonical tables migration (accounts, account_members, business_context_versions, canvas_section_versions, evidence_items, gaps, agent_profiles, agent_runs, scheduled_loops, provider_credentials, mcp_servers, mcp_server_tools), 14 Postgres enums, RLS policies on all tables, updated_at triggers, seed migration with 10 agent profiles, TypeScript types updated
- Phase 3 (commits 061b6ab + f528991 + e97eecf + b1741d7 + b684f0e): CanvasSectionCard, section-types.ts, EnterpriseBusinessModelCanvas, Canvas page, Analysis.tsx wiring, Gap Register page, Knowledge/Evidence page
- Phase 5 (commits 74e737e + 8c5b148 + 83881e4): Agents + Activity page shells, then wired to live Supabase data (agent_profiles + agent_runs queries via useAccountId), AgentRunDetailDialog component (full run details: status, timing, model, tokens, cost, input/output JSON with copy button), clickable run rows in both pages
- Phase 4 (commits 2787fae + a9f3caf): ProviderCredentialsManager (encrypted_secret never selected, add via edge function), ModelRoutingPanel (4 route tiers per agent), McpConnectionsManager (stdio/http/sse/websocket transports, tool discovery), useAccountId hook, HermesRuntimePanel (AgentRuntime interface boundary in src/lib/agent-runtime/, MockAgentRuntime, config UI), ScheduledLoopsManager (CRUD for scheduled_loops, cron presets, budget/failure limits), 5 Settings placeholder tabs replaced with functional components
- Phase 6 (commit d51c1df): useCanvasSectionRun hook (full agent run loop: resolve agent profile → startRun → poll → write canvas_section_versions), CanvasSectionCard Analyze button + loading overlay + error banner, Canvas page wired to live canvas_section_versions + agent_profiles with auto-refresh, 9 section-specific mock analysis datasets, toast notifications
- Phase 7 (commit e778252): Env-gated runtime factory (HermesAgentRuntime when VITE_HERMES_RUNTIME_ENDPOINT set, MockAgentRuntime otherwise), HermesAgentRuntime class (calls Supabase Edge Function, browser never calls LLM directly), agent-run Edge Function (multi-provider: OpenAI/Anthropic/OpenRouter/xAI, structured JSON output, cost estimation), agent-runtime/config.ts (env detection), useCanvasSectionRun live mode (fetches real LLM output from agent_runs), HermesRuntimePanel shows actual runtime mode badge, .env.example updated with runtime env vars
- Phase 7 (commit 6db28f0): Fixed CORR-003 — useCanvasSectionRun no longer hardcodes modelProvider: "mock" in live mode; omits it so edge function auto-detects from env vars
- Phase 7 (commit c1957fa): Model routing — new model-routing.ts module maps route tiers to provider+model, HermesAgentRuntime.startRun() resolves model_route_key from agent_profiles before calling edge function, ModelRoutingPanel shows resolved provider/model in route legend
- Phase 7 (commit 1d17cd3): Runtime config persistence — migration adds runtime_config JSONB to accounts, HermesRuntimePanel loads from DB on mount (merges with defaults), saves to DB on button click, config survives reloads

## Open Issues / Blockers
- None

## Next Action
- Phase 7 final task: Runtime health check / connection test button. Add a "Test Connection" button to HermesRuntimePanel that pings the edge function endpoint and reports connectivity status. After this, Phase 7 is complete and Phase 8 (Framework Skills) begins.

## Pitfalls / Notes
- Pre-existing lint errors (52 errors, 16 warnings on main @ 6c6d3d2) are all `no-explicit-any` + `no-require-imports` + `no-empty-object-type` in pre-existing/shadcn files — do NOT fix, just ensure errors don't increase. Current branch: 52 errors, 20 warnings (zero new errors, +4 warnings from new page useMemo deps — acceptable)
- The app uses both `react-router-dom` (for routing) and `next-themes` (for theme) — can use `next-themes` directly
- shadcn/ui components are in `src/components/ui/` — modify with care as they're auto-generated
- Supabase types are manually defined (not via `supabase gen types`) — need careful schema evolution
- `bun.lockb` present but `package-lock.json` also exists — npm used for build
- Commit each green slice before starting the next file
- Orphaned work recovery: prior tick wrote canvas/ files without committing — recovered, quality-gated, committed as 061b6ab

**Last Updated:** 2026-06-24 — Phase 7 near complete: model routing + config persistence done. Next: health check button. Commits c1957fa, 1d17cd3.
