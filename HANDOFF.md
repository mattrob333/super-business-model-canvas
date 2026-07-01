# Super BMC Enterprise — Handoff Document

**Repo:** https://github.com/mattrob333/super-business-model-canvas  
**Branch merged to `main`:** `enterprise-strategy-workspace`  
**Supabase project ref:** `mehhuxzamnpxnkbrslls`  
**Last updated:** July 1, 2026  

This document is for the next developer or AI agent picking up the project.

---

## Dev Log (Session Summary)

### Infrastructure & Backend

- Migrated off Lovable API to **Supabase Edge Functions** with server-side API keys (xAI/Grok, OpenAI, Anthropic, OpenRouter).
- Updated Grok integration to **grok-4.3** and **Agent Tools API** (`/v1/responses` + web search) for research functions; chat functions use standard Grok chat without web search.
- Added `supabase/schema.sql`, `supabase/SETUP.md`, `supabase/seed_frameworks.sql`, and `scripts/generate-framework-seed.mjs`.
- Fixed schema ordering (`user_roles` before `has_role()`).
- Edge functions deployed: `analyze-company`, `bmc-chat`, `business-overview-chat`, `strategy-coach-chat`, `competitor-chat`, `research-competitors`, `generate-framework-report`, `recommend-frameworks`, `agent-run`, `scheduled-loop-tick`.

### Auth & User Experience

- Converted `useAuth` to **`AuthProvider`** context (single shared session app-wide).
- Wired **TopBar** and **SidebarNav** to real user email/name, working sign-out.
- Added `src/lib/supabase-auth.ts` (`getAccessToken`, SSE stream helper) and safe localStorage fallback in Supabase client.
- **AccountSwitcher** shows active company name via `useActiveWorkspace` + `sessionStorage`.

### UI / Design Polish

- **Analysis hero** redesigned: unified width, in-card loading state, numbered process steps, cleaner URL input.
- **Dashboard:** equal-height Strategic Health card; tiles still placeholder data (not wired to DB yet).
- **Business Model Canvas:** outer `CanvasGridFrame` border; Analyze button bottom-right on all 9 sections; removed pencil icon; simplified header copy.
- **App shell:** sidebar/header alignment (`h-14` workspace row).

### Known Issues (Not Fully Fixed)

1. **Side-panel chat "Not authenticated"** — occurs when user is not signed in (UI shows Guest). `bmc-chat` requires JWT via `getAccessToken()`; `analyze-company` is more permissive. Auth must be unified (see Phase 1 below).
2. **Two parallel AI systems** — side-panel chat uses `bmc-chat` (generic Grok); Canvas Analyze uses `agent-run` + `agent_profiles` DB. Not yet unified per section agent.
3. **Dashboard metrics** — static placeholders; not reading `agent_runs`, `gaps`, `evidence_items`, `generated_reports`.
4. **`VITE_HERMES_RUNTIME_ENDPOINT`** — if unset, Canvas uses `MockAgentRuntime` (fake agent runs). Set to live `agent-run` URL for real AI on Canvas Analyze.

---

## AI Architecture Map (Current State)

### Lane 1 — Research & Generation (one-shot)

| UI | Edge Function | Model |
|----|---------------|-------|
| `/analyze` URL input | `analyze-company` | Grok + web search |
| Competitor research | `research-competitors` | Grok + web search |
| Playbook reports | `generate-framework-report` | Grok |
| Framework recommendations | `recommend-frameworks` | Grok |

Called via `supabase.functions.invoke()`.

### Lane 2 — Interactive Chat (streaming SSE)

| UI | Edge Function | Model |
|----|---------------|-------|
| BMC section side panel (`BMCSectionEditor`) | `bmc-chat` | Grok |
| Business Overview editor | `business-overview-chat` | Grok |
| Strategy Coach (`BusinessContextChat`) | `strategy-coach-chat` | Grok |
| Competitor chat (`ChatDrawer`) | `competitor-chat` | Grok |

Called via `fetch()` + `getAccessToken(session)` in `src/lib/supabase-auth.ts`.

### Lane 3 — Agent Runs (structured, logged)

| UI | Runtime | Edge Function | Model |
|----|---------|---------------|-------|
| Canvas → Analyze per section | `HermesAgentRuntime` or `MockAgentRuntime` | `agent-run` | Multi-provider |
| Scheduled loops (future) | Server cron | `scheduled-loop-tick` → `agent-run` | Per `model_routes` |

Creates `agent_runs` records; loads `system_instructions` from `agent_profiles`.

### Nine Section Agents (database)

Provisioned per account in `agent_profiles` (keys like `agent_key_partnerships`, etc.). Mapped in `src/components/canvas/section-types.ts` → `CANVAS_SECTION_AGENT_KEYS`.

Model routing: `agent_profiles.model_route_key` → `model_routes` table → provider/model. Settings UI: `ModelRoutingPanel`.

**API keys live only in Supabase secrets** — never in the browser.

---

## Environment Variables

### Frontend (`.env`)

```
VITE_SUPABASE_URL=https://mehhuxzamnpxnkbrslls.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
VITE_HERMES_RUNTIME_ENDPOINT=https://mehhuxzamnpxnkbrslls.supabase.co/functions/v1/agent-run
```

### Supabase Edge Function Secrets

- `XAI_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `OPENROUTER_API_KEY`

---

## To-Do List (Prioritized for Next Agent)

### Phase 1 — Auth & AI Call Unification (DO FIRST)

- [ ] Require sign-in for AI features OR show clear "Sign in to chat" when `user` is null
- [ ] Create shared `invokeAiFunction()` helper (streaming + non-streaming) used by all chat components
- [ ] Validate JWT in **all** edge functions via `supabase.auth.getUser(token)` — not just "header exists"
- [ ] Fix `analyze-company` to use same auth standard as chat (or document intentional guest access)
- [ ] Set `VITE_HERMES_RUNTIME_ENDPOINT` in `.env.example` and verify Canvas Analyze uses live runtime

### Phase 2 — Unify Section AI Behind `agent-run`

- [ ] Extend `agent-run` with modes: `chat` (stream), `analyze` (JSON), `goals` (JSON)
- [ ] Route `BMCSectionEditor` chat through `agent-run` using section's `agent_profile_id`
- [ ] Resolve agent profile by `CANVAS_SECTION_AGENT_KEYS` for every section interaction
- [ ] Deprecate or thin-wrap `bmc-chat` once `agent-run` handles chat
- [ ] Ensure Analyze button on Analysis page (`EnterpriseBusinessModelCanvas`) calls `agent-run`, not just opens editor

### Phase 3 — Hermes Runtime (Tool Calls & Cron)

- [ ] Implement orchestrator agent delegating to 9 section agents
- [ ] Wire `scheduled-loop-tick` to `scheduled_loops` table
- [ ] Agent tools: read/write `canvas_section_versions`, `gaps`, `evidence_items`, web search
- [ ] Activity feed + dashboard consume real `agent_runs` data

### Phase 4 — Dashboard & Model Routing

- [ ] Wire Dashboard tiles to Supabase (`gaps`, `agent_runs`, `evidence_items`, `generated_reports`)
- [ ] Edge functions read `model_routes` from DB instead of hardcoding Grok for chat
- [ ] Per-account provider credential UI fully connected to edge function key selection

### Phase 5 — Polish & QA

- [ ] E2E test: sign up → analyze company → chat in section → Canvas Analyze → playbook report
- [ ] Mobile responsive pass on Analysis hero and BMC grid
- [ ] Remove duplicate `UrlInput.tsx` path issues if any (check git for Windows path duplicates)

---

## Key Files Reference

| Area | Path |
|------|------|
| Auth provider | `src/hooks/useAuth.tsx` |
| AI token helper | `src/lib/supabase-auth.ts` |
| Agent runtime interface | `src/lib/agent-runtime/index.ts` |
| Live agent runtime | `src/lib/agent-runtime/hermes-runtime.ts` |
| Canvas section run hook | `src/hooks/useCanvasSectionRun.ts` |
| Section agent keys | `src/components/canvas/section-types.ts` |
| BMC section chat UI | `src/components/BMCSectionEditor.tsx` |
| Canvas grid + frame | `src/components/canvas/EnterpriseBusinessModelCanvas.tsx`, `CanvasGridFrame.tsx` |
| Model routing | `src/lib/agent-runtime/model-routing.ts` |
| DB schema | `supabase/schema.sql` |
| Agent run edge function | `supabase/functions/agent-run/index.ts` |
| Grok client | `supabase/functions/_shared/grok-client.ts` |

---

## Commands

```bash
npm install
npm run dev          # usually http://localhost:8080 or 8082
npm run build

# Deploy edge functions (requires Docker + Supabase CLI)
supabase functions deploy analyze-company
supabase functions deploy agent-run
# ... etc.
```

---

## Git Notes

All enterprise workspace work lives on branch `enterprise-strategy-workspace` and should be merged to `main` before handoff. Do not commit `.env` or `supabase/.temp/`.
