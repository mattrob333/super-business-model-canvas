# Build State: Enterprise Strategy Workspace

**Spec source:** Hermes Build Brief (21-page enterprise revamp of super-business-model-canvas)
**Repo:** https://github.com/mattrob333/super-business-model-canvas
**Workspace:** C:\Users\mrobe\Documents\Projects\SuperBMCenterprise\super-business-model-canvas
**Status:** Phase 3 In Progress — Canvas workspace page + components shipped, wire to Analysis page next

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

### Phase 3: Canvas Workspace Upgrade (IN PROGRESS)
1. [x] CanvasSectionCard component (commit 061b6ab) — agent badges, confidence indicators, freshness badges, evidence/gap counts, enterprise 8px-radius Card
2. [x] section-types.ts — canonical section keys + legacy camelCase mapping + agent key mapping
3. [x] EnterpriseBusinessModelCanvas component (commit f528991) — full BMC grid using CanvasSectionCard, backward-compatible with legacy data, BMCSectionEditor integration
4. [x] Canvas page at `/canvas` (commit f528991) — standalone workspace with empty state, summary bar, route wired in App.tsx
5. [ ] Wire EnterpriseBusinessModelCanvas into Analysis.tsx page (replace old BusinessModelCanvas)
6. [ ] Gap Register page at `/gaps`
7. [ ] Knowledge/Evidence page shell at `/knowledge`

### Phase 4: Settings + Provider Keys + MCP Registry [ ]
### Phase 5: Agent Profiles + Activity [ ]
### Phase 6: First Agentic Vertical Slice [ ]
### Phase 7: Hermes Runtime Integration [ ]
### Phase 8: Framework Skills [ ]
### Phase 9: Expand Agents and Loops [ ]
### Phase 10: Polish and Hardening [ ]

## Completed Tasks
- Created `enterprise-strategy-workspace` branch from main (6c6d3d2)
- Phase 0: Verified `npm run build` passes, documented Hermes architecture, lint audit
- Phase 1 (commit 1c924df): Enterprise theme (deep indigo/cool gray, light-mode default), AppShell layout (SidebarNav + TopBar), Dashboard page, Settings page (7 tabs), ThemeProvider, .env.example, removed lovable-tagger
- Phase 2 (commit 35cf3f6): 12 canonical tables migration (accounts, account_members, business_context_versions, canvas_section_versions, evidence_items, gaps, agent_profiles, agent_runs, scheduled_loops, provider_credentials, mcp_servers, mcp_server_tools), 14 Postgres enums, RLS policies on all tables, updated_at triggers, seed migration with 10 agent profiles, TypeScript types updated
- Phase 3 (commits 061b6ab + f528991): CanvasSectionCard with agent/confidence/freshness/evidence/gap badges, section-types.ts with canonical+legacy key mapping, EnterpriseBusinessModelCanvas with standard BMC grid layout, Canvas page at /canvas with empty state + summary bar, route wired in App.tsx, barrel index.ts

## Open Issues / Blockers
- None

## Next Action
- Phase 3 Task 5: Wire EnterpriseBusinessModelCanvas into Analysis.tsx, replacing the old BusinessModelCanvas component. The Analysis page currently imports and renders `<BusinessModelCanvas>` — swap it for `<EnterpriseBusinessModelCanvas>` which accepts the same legacy data shape but adds sectionMeta support. Keep BMCSectionEditor integration working.

## Pitfalls / Notes
- Pre-existing lint errors are all `no-explicit-any` + React hooks deps — document only, don't fix
- The app uses both `react-router-dom` (for routing) and `next-themes` (for theme) — can use `next-themes` directly
- shadcn/ui components are in `src/components/ui/` — modify with care as they're auto-generated
- Supabase types are manually defined (not via `supabase gen types`) — need careful schema evolution
- `bun.lockb` present but `package-lock.json` also exists — npm used for build
- Commit each green slice before starting the next file
- Orphaned work recovery: prior tick wrote canvas/ files without committing — recovered, quality-gated, committed as 061b6ab

**Last Updated:** 2026-06-24 — Phase 3 in progress (canvas components + page shipped, Analysis.tsx wiring next)
