# Super BMC — Build Roadmap

> Written: July 2, 2026. **Historical context — superseded by `BUILD_PLAN.md`**, which
> carries the live phase definitions, and `NORTH_STAR.md`, which carries the bar. Kept
> because the narrative here explains *why* the phases exist. Phase-1 items below (deploy,
> secrets, cron, hosting off Lovable) all shipped by July 3 — see BUILD_STATE.
> Architecture: `docs/AGENT_RUNTIME_DECISION.md`. History: `docs/DEVLOG.md`.

Each phase ships something usable on its own. Order matters — later phases assume earlier ones.

---

## Phase 1 — Stabilize & deploy what exists (≈ days)

Goal: everything currently in the repo actually works in production.

- [ ] Deploy the new/updated edge functions: `agent-run`, `manage-provider-key`, `test-mcp-server`, `recommend-frameworks`, `research-competitors`, `business-overview-chat`, `competitor-chat`, `strategy-coach-chat`, `analyze-company`, `scheduled-loop-tick`
- [ ] Set `CREDENTIALS_ENCRYPTION_KEY` secret (`openssl rand -base64 32`)
- [ ] Store service-role key in Vault + run `20260702090000_schedule_loop_tick.sql` → scheduled loops now actually fire
- [ ] Set `VITE_HERMES_RUNTIME_ENDPOINT` in production build env so Canvas Analyze uses the live runtime, not the mock
- [ ] Verify the E2E happy path: sign up → analyze company → section chat → Canvas Analyze → playbook report → dashboard reflects it
- [ ] Move hosting off Lovable to Vercel/Netlify (README already documents the pitfall; auto-deploy on push kills a whole class of "site is stale" problems)
- [ ] Add a unique constraint on `saved_analyses (user_id, company_name)` + switch auto-save to upsert (known dup-race, see DEVLOG)

## Phase 2 — Agent worker service (the runtime) (≈ 1–2 weeks)

Goal: real agent execution engine per `AGENT_RUNTIME_DECISION.md`. This is the platform everything else rides on.

- [ ] New repo dir `worker/` — Node + TypeScript + Claude Agent SDK
- [ ] `agent_jobs` table (id, account_id, kind, payload, status, run_id, attempts, created_at) + RLS; worker polls or LISTENs
- [ ] `agent-run` edge function becomes enqueue-only (auth → validate membership → insert job + pending `agent_runs` row → return runId); UI polling stays identical
- [ ] Worker executes `canvas_section_analysis` jobs with the section agent's `system_instructions`, writes `agent_runs` output — feature parity with today, but durable and unlimited-duration
- [ ] Custom in-process MCP tools backed by Supabase: `read_canvas`, `write_section_items`, `log_evidence`, `open_gap`, `read_competitors`
- [ ] Model routing: worker resolves `agent_profiles.model_route_key` → `model_routes` → provider/model (Anthropic direct or OpenRouter)
- [ ] Deploy worker (Fly.io/Railway), health endpoint wired into Settings → Hermes panel (rename panel "Agent Runtime")
- [ ] Retire `MockAgentRuntime` fallback in live builds; delete the mock-analysis path in `useCanvasSectionRun`

## Phase 3 — Research engine with evidence discipline (≈ 2 weeks)

Goal: ground truth. Cited canvases, verified claims. This is the moat.

- [ ] Firecrawl integration in the worker (MCP server or direct API): scrape company site, pricing, docs, careers, news
- [ ] Grok Live Search tool (already in `_shared/grok-client.ts` — port to worker) for X/social + real-time signal
- [ ] `analyze-company` v2 as a worker job: research → extract claims → **verifier agent adversarially checks each claim against sources** → write `canvas_section_versions` items with `evidence_items` links + earned confidence scores
- [ ] Canvas UI: evidence popover per item (source, date, excerpt, link), confidence + freshness visible everywhere
- [ ] Staleness policy: items older than N days get `freshness_status` downgraded automatically (cron)

## Phase 4 — Competitor canvases & the gap engine (≈ 2 weeks)

Goal: the deficiencies dashboard becomes real, computed from evidence.
**Metric/KPI details: `docs/specs/05_METRICS_AND_DATA_FEEDS.md` (incl. the competitor BMC
drill-down and compare mode); routing/cost details: `docs/specs/06_MODEL_ROUTING_ECONOMICS.md`.**

- [ ] `companies` / competitor-canvas data model: run the Phase-3 pipeline on 3–5 competitors per account (competitor canvases stored like the primary, flagged `is_competitor`)
- [ ] Gap engine job: per section, diff primary vs each competitor → write scored `gaps` rows (severity × impact × effort) with evidence links
- [ ] Competitive Landscape page upgraded: side-by-side section comparison, "who's outpacing you where" matrix
- [ ] Dashboard: Strategic Health driven by gap engine output (formula already in place from this session's wiring)

## Phase 5 — Section agents as resident experts (≈ 2–3 weeks)

Goal: each BMC section becomes an agent's room, proactive on a cadence.
**Detailed specs: `docs/specs/01_AGENT_ROSTER.md` + `docs/specs/02_SECTION_WORKSPACE.md`.**

- [ ] Redesign the section detail view: agent identity/personality, section canvas with evidence, KPI/benchmark cards, run history, standing-orders (loop) controls, chat — all in one room
- [ ] Section chat routed through the worker with the section agent's profile + tools (replaces generic `bmc-chat`; thin-wrap or delete the old function)
- [ ] Per-section KPIs/benchmarks table (`section_kpis`): agent proposes, user approves, agent tracks against competitor data
- [ ] Proactive loops per section shipped as presets: "re-verify claims monthly", "watch competitor pricing weekly", "surface 3 new partnership candidates monthly" — one-click enable from the section room
- [ ] Escalation: section agents write material findings to an `insights` feed the strategist (Phase 6) consumes

## Phase 6 — The strategist orchestrator (≈ 2–3 weeks)

Goal: the agent that sees everything and tells you what to do next.
**Detailed specs: `docs/specs/03_ORCHESTRATOR_WORKSPACE.md` (the War Room) +
`docs/specs/04_ORCHESTRATION_AND_CASCADES.md` (delegation, cascades, data model).**

- [ ] Orchestrator agent in the worker: subagent delegation to the 9 section agents (Claude Agent SDK subagents), full read access to canvas + competitors + gaps + insights
- [ ] Playbook frameworks as SDK skills: SWOT, Porter, Blue Ocean, Ansoff, PESTLE, unit economics — populated from live canvas data with citations (upgrade of `generate-framework-report`)
- [ ] Framework selection logic: strategist picks the right playbook for the company's stated goal (goals captured in workspace settings)
- [ ] "Next moves" agenda: ranked action list, each item traceable to gaps/evidence; user can accept/dismiss (feeds back into learning)
- [ ] Strategy brief generator: weekly/monthly CEO/board memo from the nine agents' outputs (export PDF — html2pdf already integrated)
- [ ] Strategy coach chat becomes the strategist's chat surface (replaces `strategy-coach-chat`)

## Phase 7 — Cadence, digests & multi-company (≈ 2 weeks)

Goal: the VC/portfolio experience; the system runs while nobody's looking.

- [ ] Weekly digest email: material changes, new gaps, recommended focus (Resend/Postmark from a worker job)
- [ ] Multi-company workspaces: real `AccountSwitcher` (it's currently non-interactive), portfolio dashboard across companies
- [ ] Propose-before-execute actions: agents draft outreach/surveys → approval queue → (integrations later)
- [ ] Usage metering & budgets per account (`agent_runs.estimated_cost` roll-ups; loop budgets already enforced)

## Phase 8 — Commercial hardening (ongoing)

- [ ] Billing (Stripe) with seat/workspace tiers per `VISION.md` buyer table
- [ ] Team roles beyond owner (`account_members.role` exists; enforce in RLS + UI)
- [ ] SOC2-track basics: audit log UI on `agent_runs` (partially exists), key rotation for `CREDENTIALS_ENCRYPTION_KEY`, per-account data export/delete
- [ ] Onboarding flow: URL → first canvas → competitor prompt → first gap report inside 10 minutes
- [ ] Rich document editor for briefs/memos (Plate preferred over Tiptap — shadcn-native; see spec 06 §6)
- [ ] Paid data-feed upgrades as revenue justifies (Similarweb, SEMrush, NewsAPI, Crunchbase — spec 05 §6)

---

## Explicit non-goals until after Phase 6

Autonomous external actions (email sends), private-data connectors (CRM/financials), realtime multiplayer editing, mobile apps.

## Standing quality gates

- `npx tsc --noEmit` and `npm run build` green before every commit; lint error count must not increase (baseline 69 as of 2026-07-02)
- Every agent-written canvas item must carry evidence links or a sub-0.7 confidence mark (enforced in worker hooks from Phase 3 on)
- Every agent run — manual, scheduled, orchestrated — produces a durable `agent_runs` record
