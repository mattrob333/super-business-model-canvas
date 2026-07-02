# Dev Log

Newest entries first. Companion docs: `VISION.md` (product), `AGENT_RUNTIME_DECISION.md` (architecture), `ROADMAP.md` (phases), `specs/` (workspace-era specs).

---

## 2026-07-02 (addendum) — Claude Agent SDK integration spec

Gap spotted by Matt: the SDK was named everywhere but no doc told the build team *how* to
use it — a recipe for hallucinated APIs in Phase 2. Wrote `specs/07_CLAUDE_AGENT_SDK_INTEGRATION.md`
with the API surface verified against the official docs (TS SDK ≥ 0.3.198): the `query()`
loop mapped to our job kinds, in-process MCP tools via `tool()`/`createSdkMcpServer()` with
the account-scoping warning (service role bypasses RLS — scoping lives in tool handlers),
guardrails as `PreToolUse` hooks (evidence gate, audit log), Atlas's depth-1 subagent
topology via the `agents` option (structural enforcement: subagents never get the Agent
tool), session-resume ↔ workspace_threads mapping, structured-output contract, model
routing (budget models bypass the SDK entirely), headless gotchas (`settingSources: []`,
`bypassPermissions` + hooks, `q.close()`), and a condensed Phase-2 checklist. Includes a
recorded decision on Anthropic's Managed Agents alternative (revisit Phase 7+, not default).
BUILD_PLAN Phase 2 now requires reading it first.

---

## 2026-07-02 (final) — Build plan & AI-team handoff

Wrote the execution layer so an AI build team can start while Matt is away:

- `BUILD_PLAN.md` — ground rules (branch/gate discipline, blockers protocol, no fake
  completeness, operator-task flagging, guardrails-as-law), eight execution phases (0 baseline
  → 1 migrations → 2 worker → 3 research/evidence → 4 competitors/gaps → 5 section workspaces
  → 6 War Room/orchestration → 7 metrics/interpretation; 8 held) each with work orders,
  acceptance criteria, and an adversarial reviewer checklist; review protocol (phase →
  AWAITING REVIEW → audited against code and behavior, findings as RF items → APPROVED);
  dependency map with the one allowed concurrency (P3 ∥ P5 on frozen migrations).
- `BUILD_STATE.md` — the live tracker the team must maintain: status board, blockers,
  operator queue (seeded with the July-2 deployment checklist), review findings, per-phase
  task logs.

The review cadence is deliberate: phases are sized to be completed by the team and then
audited (by Claude, at Matt's direction) before the next begins.

---

## 2026-07-02 (later still) — Metrics, data feeds & model economics specs

Two more specs from Matt's brief (true public-data metrics, benchmarks/KPIs the orchestrator
can interpret for the human, reliable data feeds, right-model-for-the-job economics via the
OpenRouter catalog, competitor BMC click-through):

- `specs/05_METRICS_AND_DATA_FEEDS.md` — metric catalog across five families (share of
  voice/visibility — the flagship, competitor execution, market demand, macro via FRED,
  sentiment) with T1/T2/T3 provenance tiers on every tile; four composite indices (Visibility,
  Momentum, Threat, Tailwind) baselined at 100; a `kpis` table for human- or Atlas-set targets
  with owner agents; the three-stage interpretation pipeline (free statistics → cheap pattern
  matching → Atlas narrative "What's happening / Why it matters / What to do"); the
  `data_feeds` registry (free-tier sources first, paid upgrades slot in without schema change);
  and the competitor BMC drill-down with compare mode and "borrow idea" flow.
- `specs/06_MODEL_ROUTING_ECONOMICS.md` — task-class routing matrix (extract/classify on
  budget models, verification never downgraded, Atlas synthesis protected and rare), the
  escalation ladder, the OpenRouter model-scout (monthly catalog sweep + eval harness proposing
  route changes through Approvals; `scout_models` tool for Atlas), layered cost controls, and
  cost-per-insight observability. Rich-doc editor (Plate over Tiptap) parked in ROADMAP Phase 8.

README/overview indices updated; ROADMAP Phase 4 and Phase 8 reference the new specs.

---

## 2026-07-02 (later) — Agent workspace spec suite

Wrote the full specification set for the ten-agent workspace era (Matt's brief: unique
full-screen workspaces for the 9 section agents + the orchestrator, with identity/context
rails, centered collaborative chat, actions panels with cron-schedulable skills, cascade
workflows, and a marquee orchestrator space — BMC remaining the shared source of truth).

New in `docs/specs/`:
- `00_OVERVIEW.md` — mental model, the cast, an end-to-end signal→strategy walkthrough, design principles
- `01_AGENT_ROSTER.md` — all ten agents defined: callsigns (Atlas, Compass, Forge, Relay, Anchor, Yield, Vault, Tempo, Envoy, Ledger), personas, domain tools, outputs, standing orders, synergy map
- `02_SECTION_WORKSPACE.md` — section room UI: identity block + settings sheet (system prompt/behavior), live section-canvas panel, context sources, threaded chat with tool-call/artifact/proposal cards, actions panel (Skills/Templates/Frameworks/Schedules) with per-action cron + "Atlas may trigger" toggles
- `03_ORCHESTRATOR_WORKSPACE.md` — the War Room: BMC command Map (health/freshness/vs-competitor/activity modes), Atlas chat (delegation/brief/framework/conflict cards), Next Moves agenda, insight feed, cascades + approvals rails
- `04_ORCHESTRATION_AND_CASCADES.md` — the four orchestration primitives (delegation, insight bus, agenda, approvals), scheduling authorship rules (human / Atlas-proposed / Atlas-autonomous), the v1 cascade library (Full Recon, Competitor Delta Sweep, Board Pack, Pricing War Response, Unit Economics Duet, Launch Readiness, Cost-Down Sprint), output types, complete data-model additions, and system-wide guardrails

Also: README repositioned around the workspace direction with a spec index; ROADMAP Phases 5–6 now point at the specs. No code changes in this entry — specs slot into ROADMAP Phases 2–6 for implementation.

---

## 2026-07-02 — Full audit, bug-fix sweep, and forward plan

Session goal (from Matt): audit the repo for bugs, tie up loose ends, and produce the vision/plan for upgrading the app to a robust multi-agent runtime (orchestrator + 9 section agents + research pipeline).

### What we have (current-state inventory)

**Working and solid:**
- React 18 + Vite + shadcn SPA with auth (Supabase), 15+ routes, light/dark enterprise theme
- Complete multi-tenant schema: `accounts`, `agent_profiles` (orchestrator + 9 section agents seeded with real system instructions), `agent_runs`, `scheduled_loops`, `model_routes`, `mcp_servers`, `provider_credentials` (encrypted), `evidence_items`, `gaps`, `canvas_section_versions`, `business_context_versions` — all RLS-protected
- `AgentRuntime` interface boundary in `src/lib/agent-runtime/` with mock + live (edge function) implementations
- 12 edge functions: research/generation (one-shot JSON), streaming chat (SSE), agent runs
- Playbook system: frameworks table, seeded frameworks (SWOT, Porter, PESTLE, Ansoff, BCG, Blue Ocean, …), report generation + viewer
- Grok integration on the current Agent Tools API (`/v1/responses` + web_search) in `_shared/grok-client.ts`

**The honest gaps (now captured in ROADMAP.md):**
- No real agent execution engine — `agent-run` is a single LLM call, no tools, no multi-step research
- Evidence/gaps tables exist but nothing writes to them yet (no research pipeline, no gap engine)
- No competitor canvases; Competitive Landscape works off the one-shot analysis JSON
- Section "agents" are prompts, not agents: no tools, no proactivity, no KPIs
- Two parallel AI systems (generic `bmc-chat` vs `agent-run` profiles) still not unified
- `AccountSwitcher` non-interactive; `useAccountId` is a single-account stopgap

### Bugs found and FIXED this session

Two independent audit passes (frontend + backend) followed by fixes. All verified: `tsc` clean, `vite build` green, lint baseline unchanged (69 pre-existing).

**Critical / high:**
1. **Missing edge functions** — Settings called `manage-provider-key` and `test-mcp-server`, which didn't exist; adding a provider API key or testing an MCP server always failed. → Implemented both: AES-256-GCM encryption for secrets (new `CREDENTIALS_ENCRYPTION_KEY` secret required, see SETUP.md), JWT + account-membership authorization, HTTP/SSE reachability test for MCP servers.
2. **No auth guard on protected routes** — `/dashboard`, `/settings`, `/agents`, etc. rendered for signed-out users (empty data, confusing failures). → Added `RequireAuth` wrapper around the AppShell route group in `App.tsx`.
3. **Scheduled loops never fired** — nothing invoked `scheduled-loop-tick` on a schedule, and scheduled runs were never recorded to `agent_runs`, so loop budgets always read $0. → New migration `20260702090000_schedule_loop_tick.sql` (pg_cron + pg_net + Vault-stored service key, every 5 min) and `agent-run` now writes a durable `agent_runs` row for service-triggered runs.
4. **`agent-run` authorization hole** — only checked that an Authorization header *existed*; any authenticated user could execute another account's agent profile (cross-tenant read of instructions + cost burn). → Now validates the JWT (`auth.getUser`), verifies account membership, scopes profile lookup to the account, and separately recognizes service-role calls.
5. **Public service-role function writing to a dropped table** — `seed-frameworks` had `verify_jwt=false` and targeted `strategic_frameworks` (dropped). → Deleted the function; `config.toml` and SETUP.md updated.

**Medium:**
6. `ChatDrawer` BMC mode read a JSON field from an SSE stream → always rendered an empty reply. Now consumes the stream incrementally (same pattern as `BMCSectionEditor`).
7. `strategy-coach-chat` prompt promised live web research but called Grok with `webSearch: false` → hallucinated "current" market data. Web search now actually enabled.
8. `recommend-frameworks` crashed (500) whenever the model wrapped JSON in code fences → fences now stripped before parse.
9. Agent-key mismatch: `agent-run` derived `agent_key_partners` while the DB seeds `agent_key_partnerships` → mappings now mirror `section-types.ts` exactly.
10. Provider auto-select priority differed between `agent-run` and `_shared/llm-client.ts` → aligned (OpenRouter → OpenAI → Anthropic → xAI).
11. `getAgentRuntime()` singleton bound forever to the first accountId (placeholder UUID if Settings→Hermes opened early) → cache now re-keys by account; Hermes tab gated on account load.
12. Canvas section runs could hang forever on a spinner if the post-completion save failed (no `.catch` in the poll/save chain) → failure paths now clear state and surface the error.
13. TypeScript errors (3) — `Record<string, unknown>` vs Supabase `Json` in both runtimes + `HermesRuntimePanel` → fixed; `tsc --noEmit` is clean again.
14. `research-competitors` ignored the company name entirely (param name mismatch with its caller) → accepts both shapes, prompt now targets the actual company's competitors.
15. `analyze-company` competitor-quality validation referenced a field that never exists (`competitors` vs `similarCompanies`) → dead check revived.
16. Missing request validation in `business-overview-chat` / `competitor-chat` (TypeError → 500) → 400s with clear messages.
17. Admin framework preview button navigated to a route that doesn't exist → points at the framework detail page.
18. "Saved" toast in Analysis fired even when 0 rows were updated → now checks error + affected rows.
19. Smaller: SecurityPanel counted pending/cancelled runs as "Successful" (now counts `completed`); Activity/Agents ordered by nullable `started_at` (now `created_at` per schema contract); dead "New Agent" button disabled with an explanatory tooltip; `onAuthStateChange` Supabase call deferred per supabase-js guidance.

**Shipped as a loose-end tie-up:** the Dashboard was 100% hardcoded placeholders — now fully wired to live data (open gaps by severity, evidence count, context freshness, computed Strategic Health score with documented formula, last 5 agent runs, loop status counts, last 3 reports).

### Known issues deliberately NOT fixed (tracked in ROADMAP Phase 1)

- `saved_analyses` check-then-insert race can create duplicate rows per (user, company) — needs a unique constraint + upsert; deferred because a constraint migration on possibly-duplicated prod data needs a dedup pass first.
- `generated_reports` is user-scoped, not account-scoped (schema inconsistency with the rest of the canonical tables).
- The `COMPETE` framework branch in `generate-framework-report` is dead (no seeded framework has that shortcut) — decide whether Porter should trigger competitor research instead.
- `recommend-frameworks` is deployed but never called from the UI.
- Edge functions still hardcode models in places instead of reading `model_routes` (goes away when the worker owns routing, Phase 2).

### Deployment checklist for these fixes

1. `supabase functions deploy` — agent-run, manage-provider-key, test-mcp-server, recommend-frameworks, research-competitors, business-overview-chat, competitor-chat, strategy-coach-chat, analyze-company (and delete the deployed `seed-frameworks` if present: `supabase functions delete seed-frameworks`)
2. Set secret: `CREDENTIALS_ENCRYPTION_KEY` (`openssl rand -base64 32`)
3. Vault: `select vault.create_secret('<service-role-key>', 'service_role_key');` then run migration `20260702090000_schedule_loop_tick.sql`
4. Rebuild + republish the frontend with the three `VITE_*` vars set

### The big decision (summary — full reasoning in AGENT_RUNTIME_DECISION.md)

**Claude Agent SDK in a dedicated worker service** is the recommended runtime for the orchestrator + 9 section agents; **OpenRouter** stays as the model-routing layer under `model_routes`; **Supabase remains the source of truth**; **pg_cron** drives proactive loops; **Hermes remains the dev-time copilot**, and its concept model (profiles/skills/crons) lives on in the schema that already mirrors it. Firecrawl (scraping) + Grok Live Search (X/real-time) are the research tools, with a verifier-agent evidence pipeline as the anti-hallucination mechanism.

---

## Earlier history

See `.hermes/build-state.md` for the autonomous build loop that produced Phases 0–10 of the enterprise workspace (June 2026), and `HANDOFF.md` for the architecture map as of July 1, 2026.
