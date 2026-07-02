# Super BMC — Build Plan & AI-Team Handoff

> The execution document. Written July 2026 for a team of AI build agents. Strategy lives in
> `VISION.md`; architecture in `AGENT_RUNTIME_DECISION.md`; product detail in `specs/00–06`.
> **This doc tells you what to build, in what order, and exactly when a phase counts as done.**
> A human reviewer (Claude, at Matt's direction) audits each completed phase before the next
> begins. Build accordingly: your work will be checked.

---

## PART I — Ground rules (read before writing any code)

1. **One phase at a time, in order.** Do not start Phase N+1 before Phase N is marked
   `AWAITING REVIEW` in `BUILD_STATE.md`. Phases are sized to be completed and audited.
2. **Branch discipline.** Each phase gets one branch: `build/phase-<n>-<slug>` cut from the
   integration branch Matt designates. Small, reviewable commits with conventional messages
   (`feat(worker): …`, `fix(migrations): …`). Never push to `main`.
3. **Quality gates — every commit:** `npx tsc -p tsconfig.app.json --noEmit` clean ·
   `npm run build` green · `npm run lint` error count **≤ 69** (the frozen baseline; do not
   "fix" pre-existing lint errors unless a work order says so — it bloats diffs).
   Worker code (Phase 2+): its own `tsc` + tests green.
4. **Update `BUILD_STATE.md` as you work** — check off tasks, log decisions in the phase log,
   move the phase to `AWAITING REVIEW` when acceptance criteria pass. This file is the
   team's shared memory; stale state = lost work.
5. **Blockers protocol.** If you hit something ambiguous, missing, or contradictory: write it
   to the `BLOCKERS` section of `BUILD_STATE.md` with context and your recommended resolution,
   pick the *most conservative* interpretation, and continue on non-blocked tasks. Never
   invent credentials, never hack around a failing gate, never silently skip an acceptance
   criterion.
6. **No fake completeness.** Mock data, stubbed returns, and `// TODO: implement` behind a
   green checkmark are the cardinal sin — the reviewer diffs claims against code. If a task is
   partial, say so in BUILD_STATE.
7. **Schema changes only via migrations** (`supabase/migrations/<timestamp>_<slug>.sql`),
   idempotent where possible, RLS on every new table (copy the `is_account_member` pattern
   from `schema.sql`), and mirrored into `supabase/schema.sql` + regenerated
   `src/integrations/supabase/types.ts`.
8. **Secrets never in code or commits.** New secrets get documented in `supabase/SETUP.md`
   and `.env.example` (placeholder only) and flagged as OPERATOR TASKS.
9. **OPERATOR TASKS** (marked ⚠️🔑 below) require Matt's credentials/dashboard access —
   deploys, secret setting, Vault, hosting. Do everything up to that line, then list the exact
   commands/clicks for Matt in BUILD_STATE under `OPERATOR QUEUE`. Never fake their completion.
10. **Guardrails are law** (from spec 04 §7): every run durable in `agent_runs` · evidence-or-
    low-confidence on canvas writes · outward actions only through `approvals` · depth-1
    delegation · section agents never write outside their section · budgets enforced.

### Key existing code you must not break

| Area | Files |
|---|---|
| Runtime interface | `src/lib/agent-runtime/*` (the swappable boundary — extend, don't bypass) |
| Section keys/agent keys | `src/components/canvas/section-types.ts` (mirrored in `agent-run/index.ts` — keep in sync) |
| Auth | `src/hooks/useAuth.tsx`, `RequireAuth` in `App.tsx`, JWT+membership pattern in `agent-run` |
| Loop tick | `supabase/functions/scheduled-loop-tick` + `migrations/20260702090000_schedule_loop_tick.sql` |
| Provider key encryption | `supabase/functions/manage-provider-key` (AES-GCM; `CREDENTIALS_ENCRYPTION_KEY`) |

---

## PART II — The phases

Sizing legend: S ≈ agent-day, M ≈ 2–3 agent-days, L ≈ agent-week equivalent.

---

### PHASE 0 — Baseline verification & deploy prep (S)

**Objective:** prove the current code actually runs end-to-end; stage everything the operator
needs to deploy the July-2 fixes.

**Work orders**
- 0.1 Fresh-clone verification: `npm ci`, tsc, build, lint baseline (69) — record results.
- 0.2 Static audit of all 12 edge functions vs their callers (request/response shape match) —
  document any drift found in BUILD_STATE (do not fix yet unless trivial).
- 0.3 Write `scripts/smoke-test.md`: a click-by-click manual E2E script (sign up → analyze →
  section chat → Canvas Analyze → playbook report → dashboard shows data) the operator can run.
- 0.4 ⚠️🔑 OPERATOR QUEUE: exact deploy commands (functions list), secrets to set
  (`CREDENTIALS_ENCRYPTION_KEY`, Vault service key), cron migration to run, `VITE_*` build vars.

**Acceptance criteria**
- [ ] BUILD_STATE records clean gate runs with output snippets
- [ ] Smoke-test doc exists and covers all 6 flows
- [ ] Operator queue lists every deploy step with exact commands

**Reviewer checklist:** re-run gates; spot-check the function/caller audit against 3 functions
(`agent-run`, `bmc-chat`, `generate-framework-report`); verify no code changes snuck in.

---

### PHASE 1 — Data model wave 1: workspace & orchestration tables (M)

**Objective:** all new tables from spec 04 §5 + spec 05/06 additions, so later phases never
wait on migrations.

**Work orders**
- 1.1 Migration series (one file per group, ordered):
  `workspace_threads`, `workspace_messages`, `context_sources` ·
  `insights`, `agenda_items`, `approvals`, `agent_jobs` ·
  `cascades`, `cascade_steps`, `cascade_runs` ·
  `metric_snapshots`, `kpis`, `data_feeds`, `model_evals`, `agent_profile_revisions`.
- 1.2 Column additions: `agent_profiles.behavior/avatar` · `agent_skills.orchestrator_can_trigger/
  action_kind` · `scheduled_loops.action_key/created_by_agent` · `generated_reports.account_id/
  source_cascade_run_id` (backfill `account_id` from the user's account, document the backfill) ·
  `model_routes.task_class/max_tokens_in/max_tokens_out/cost_per_1k_in/cost_per_1k_out/eval_score/updated_by`.
- 1.3 RLS policies on every new table (account-scoped; `insights`/`agenda_items` readable by all
  members, writable via service role only; `approvals` decidable by members).
- 1.4 Seed: avatar + behavior defaults for the 10 template `agent_profiles` (callsigns per
  spec 01 naming table — display_name → callsign, description → role title); the 7 template
  cascades from spec 04 §3 (steps included); default `model_routes` rows per task_class
  (spec 06 §1 matrix).
- 1.5 Mirror everything into `supabase/schema.sql`; regenerate `src/integrations/supabase/types.ts`
  (hand-author in the established style if no DB access — match existing conventions exactly).
- 1.6 Verification script `scripts/verify-schema.sql`: asserts tables/columns/policies exist
  (runnable in SQL editor, prints PASS/FAIL rows).

**Acceptance criteria**
- [ ] Migrations apply cleanly on an empty DB **in order** (test against local supabase or
  document the ordering proof)
- [ ] Every new table has RLS + policies; verify-schema.sql passes
- [ ] `types.ts` compiles; frontend tsc/build/lint gates green
- [ ] Seeds are idempotent (`on conflict do nothing` pattern like existing seeds)

**Reviewer checklist:** run migrations against a scratch DB; grep for tables missing RLS;
diff seed callsigns/cascade steps against specs 01/04; check `generated_reports` backfill
logic; confirm types.ts matches migrations column-for-column.

---

### PHASE 2 — The agent worker service (L) — *the platform phase*

**Objective:** spec `AGENT_RUNTIME_DECISION.md` Phase A: a deployable Node worker running the
Claude Agent SDK, executing `canvas_section_analysis` jobs with feature parity to today's
`agent-run`, plus workspace chat plumbing.

**Work orders**
- 2.1 `worker/` package: TypeScript, `@anthropic-ai/claude-agent-sdk`, config via env,
  Dockerfile, `npm test` harness (vitest). Own tsconfig/eslint. README with run instructions.
- 2.2 Job loop: poll `agent_jobs` (status `queued`, `FOR UPDATE SKIP LOCKED` semantics via
  RPC or advisory locks), heartbeat column, retry w/ backoff (max `attempts`), dead-letter
  status `failed_permanent`.
- 2.3 Job kind `canvas_section_analysis`: load agent profile (instructions, behavior, model
  route by task_class), run via SDK with core tools (2.4), write `agent_runs` output identical
  in shape to current `agent-run` result (items/notes/confidence/summary + tokens/cost).
- 2.4 Core MCP tools (in-process, Supabase-backed, account-scoped): `read_canvas`,
  `write_section_items` (proposal-mode flag), `log_evidence`, `open_gap`, `post_insight`,
  `read_competitor_canvas` (stub returning empty until Phase 4), `search_web` (Grok),
  `firecrawl_scrape` (behind `FIRECRAWL_API_KEY`, graceful degrade if unset).
- 2.5 Job kind `workspace_chat`: consume a thread (`workspace_threads/messages`), stream
  agent turns back as `workspace_messages` rows (kind text/tool_call/artifact/proposal),
  durable `agent_runs` record per turn.
- 2.6 Edge function changes: `agent-run` gains `mode: enqueue` (insert job + pending run,
  return runId; keep legacy inline mode behind a flag for rollback); new thin `workspace-chat`
  function (auth → insert user message + enqueue → client reads via Realtime).
- 2.7 Frontend: `LiveAgentRuntime` (rename of Hermes runtime) points at enqueue mode; poll
  path unchanged. Feature-flag via env (`VITE_RUNTIME_MODE=enqueue|inline|mock`).
- 2.8 Budget + guardrail hooks: per-run token ceilings by task_class; refuse `write_section_items`
  lacking evidence_ids when confidence ≥ 0.7; every tool call logged.
- 2.9 Tests: job loop (claim/retry/dead-letter), each tool against a test schema, one
  end-to-end section-analysis against a mocked SDK + real test DB.
- 2.10 ⚠️🔑 OPERATOR QUEUE: worker deploy (Fly/Railway), env vars, `ANTHROPIC_API_KEY`,
  point staging `VITE_RUNTIME_MODE=enqueue`.

**Acceptance criteria**
- [ ] `cd worker && npm test` green; worker tsc clean
- [ ] A queued `canvas_section_analysis` job produces an `agent_runs` row byte-compatible with
  the legacy shape (fixture comparison test)
- [ ] Crash mid-job → job retried, no orphaned `running` rows (test proves it)
- [ ] Tool guardrail test: high-confidence write w/o evidence is rejected
- [ ] Frontend gates green; mock mode still works (dev experience preserved)

**Reviewer checklist:** read the job-claim SQL for race conditions; verify legacy-shape fixture
honestly matches (not asserted loosely); check tools filter by account_id everywhere (RLS is
bypassed by service role — scoping must be in code); confirm no secret ends up in `agent_runs.input`;
run the crash-recovery test.

---

### PHASE 3 — Research engine & evidence discipline (L)

**Objective:** spec 05 §6 + ROADMAP Phase 3: cited canvases. `analyze-company` v2 as worker
jobs; the verifier; data feeds wave 1.

**Work orders**
- 3.1 `data_feeds` fetcher framework in worker: per-feed module, TTL cache table
  (`feed_cache`), health writes, cadence honored via scheduled_loops rows (`action_key:
  feed_refresh:<feed_key>`).
- 3.2 Wave-1 fetchers: firecrawl page scrape (pricing/careers/changelog/reviews targets per
  company), Grok live search, FRED series, Google Trends, GDELT count, GitHub repo stats.
  Each returns normalized `evidence_items` candidates.
- 3.3 Job kind `company_research`: crawl target company → extract claims per section
  (task_class `extract`, budget route) → **verifier step** (task_class `research_verify`,
  mid route, adversarial: claim vs source excerpt → confirmed/unsupported/contradicted) →
  write `canvas_section_versions` items with `evidence_ids` + earned confidence; unsupported
  claims capped at 0.5 confidence and flagged.
- 3.4 Escalation ladder (spec 06 §2) implemented in the extract pipeline with metrics
  (`escalation_rate` per feed → `metric_snapshots`).
- 3.5 Frontend: evidence popover on canvas items (source, date, excerpt, link) — Canvas page
  + section cards; confidence/freshness rendering per spec 02 §1b (the workspace itself is
  Phase 5; this is the popover only).
- 3.6 Staleness cron: loop that downgrades `freshness_status` past thresholds.
- 3.7 Tests: verifier golden set (10 claims: 4 supported / 4 unsupported / 2 contradicted —
  must classify ≥ 9/10); cache TTL honored; a full research job on a fixture site produces
  cited items.

**Acceptance criteria**
- [ ] Research job on the fixture company yields ≥ 80% of canvas items carrying evidence_ids
- [ ] Verifier golden-set test passes; unsupported claims visibly capped
- [ ] Evidence popover renders from real `evidence_items` rows
- [ ] Feed health degrades visibly when a fetcher 404s (test)
- [ ] All gates green (frontend + worker)

**Reviewer checklist:** adversarially probe the verifier (feed it a subtly-wrong claim);
confirm evidence excerpts actually appear in source pages (spot-check 5); check the extract
pipeline uses budget routes (read the route resolution, not the config comment); verify no
fetcher runs without cache check.

---

### PHASE 4 — Competitor canvases, gap engine & drill-down (L)

**Objective:** ROADMAP Phase 4 + spec 05 §7: competitor BMCs, scored gaps, Threat Index,
the drill-down/compare UI.

**Work orders**
- 4.1 `companies` table (or extend existing pattern): competitor entities per account with
  `is_competitor`, linked canvas versions. Migration + RLS + types.
- 4.2 Job kind `competitor_research`: Phase-3 pipeline against a competitor (same verifier
  discipline), writing competitor-flagged canvas versions.
- 4.3 Gap engine job: per section, primary vs each competitor → scored `gaps`
  (severity × impact × effort, evidence-linked) + per-section competitor-delta
  `metric_snapshots`; Momentum + Threat Index computation (spec 05 §3 formulas, versioned).
- 4.4 UI: `/competitors/:id/canvas` read-only BMC breakdown + metric strip; **compare mode**
  (side-by-side per section with win/lose scoring); **borrow idea** action → creates a
  proposal message in the target section's default thread (thread plumbing exists from
  Phase 2).
- 4.5 Competitive Landscape page: competitor cards now link into the drill-down; Threat Index
  displayed; "run competitor research" action (enqueue).
- 4.6 Dashboard: competitor strip row (spec 05 §8, third row) reading `metric_snapshots`.
- 4.7 Tests: gap scoring determinism on fixtures; index formulas unit-tested; drill-down
  renders competitor fixture data.

**Acceptance criteria**
- [ ] Running competitor research on a fixture produces a browsable competitor BMC with evidence
- [ ] Gap engine emits scored, evidence-linked gaps; Threat Index appears on landscape +
  dashboard
- [ ] Compare mode and borrow-idea flow work end-to-end (borrowed idea lands as a proposal
  message in the right thread)
- [ ] All gates green

**Reviewer checklist:** verify gap scores trace to real section diffs (pick 3 gaps, follow
evidence); check index formula versions are stored in `inputs`; try borrow-idea across
accounts (must be forbidden); confirm competitor canvases can't pollute primary canvas writes.

---

### PHASE 5 — Section agent workspaces (L) — *spec 02, the full room*

**Objective:** the nine full-screen rooms, exactly per spec 02.

**Work orders**
- 5.1 Route `/workspace/:sectionKey` outside AppShell content column; `WorkspaceTopBar` with
  9-dot switcher (+War Room stop, disabled until Phase 6).
- 5.2 Left rail: `AgentIdentityCard` (callsign/avatar/status from agent_profiles + live
  agent_runs), `AgentSettingsSheet` (system_instructions editor w/ revisions, behavior
  sliders, model route, budget, danger zone), `SectionCanvasPanel` (live items, confidence
  dots, evidence popovers, inline edit → new version, discuss action), `ContextSourcesPanel`
  (CRUD on context_sources; file upload to Supabase Storage bucket `context-files` — new
  bucket + policies migration).
- 5.3 Center: `WorkspaceThread` — thread list, message cards (text/tool_call/artifact/
  proposal/delegation), Realtime subscription on workspace_messages, `Composer` with slash
  commands (`/run`, `/schedule`, `/frame`, `/canvas add`) + attach.
- 5.4 Proposal cards: Approve/Edit/Decline wired to canvas writes + approvals rows.
- 5.5 Right rail: `ActionsPanel` (Skills/Templates/Frameworks/Schedules tabs from
  agent_skills + frameworks), `ActionCard` (Run → enqueue; `SchedulePopover` → scheduled_loops;
  "Atlas may trigger" toggle), `RunQueue` (live agent_runs + upcoming loops).
- 5.6 First-visit experience: agent intro message generated from canvas state (worker job on
  first thread creation) + 3 suggested-action buttons.
- 5.7 Retire `BMCSectionEditor` sheet: canvas section click navigates to the workspace
  (keep the editor code until Phase 6 review confirms parity, then delete).
- 5.8 Responsive behavior per spec 02 breakpoints; degraded-runtime banner.
- 5.9 Tests: component tests for proposal approve/decline and schedule popover; a Playwright
  smoke (open room, send message, run action) against mock runtime.

**Acceptance criteria**
- [ ] All nine rooms reachable from canvas + switcher, each with correct agent identity
- [ ] Chat round-trip works through worker (staging) and mock (dev)
- [ ] Instructions edit creates a revision; restore works
- [ ] Action card can run now AND create a schedule; both appear in run queue
- [ ] Proposal approve writes a canvas version; decline records it; nothing writes without
  approval
- [ ] Gates + Playwright smoke green

**Reviewer checklist:** keyboard/focus audit (existing a11y standard — Phase 10 heritage);
try editing another section's items from a room (must be impossible); kill the worker
mid-chat and verify the degraded banner + no data loss; check slash commands map to real
actions; visual pass against spec 02 layout.

---

### PHASE 6 — The War Room & orchestration (L) — *spec 03 + 04, the marquee*

**Objective:** Atlas's room, delegation, cascades, agenda, approvals — the full loop.

**Work orders**
- 6.1 Worker: Atlas agent (orchestrator profile) with tools `delegate_to_agent` (depth-1
  enforced, concurrency cap), `run_cascade` (DAG executor over cascade_steps, partial-failure
  semantics per spec 04 §3), `schedule_loop`/`pause_loop` (authorship rules spec 04 §2),
  `read_all_insights`, `write_agenda_item`, `compose_brief`, `run_framework`, `set_metric`.
- 6.2 Critical-insight triage: `insights.severity='critical'` trigger → enqueue Atlas triage
  job (Postgres trigger + agent_jobs).
- 6.3 `/war-room` UI: `WarRoomMap` (9 tiles, health tint from metric_snapshots, agent chips,
  gap dots, delta badges, modes Health/Freshness/vsCompetitor/Activity, radial quick-menu,
  collapsible footer strip), Atlas chat (delegation/brief/framework/conflict cards), left rail
  (identity, `AgendaPanel` accept/dismiss-with-reason, `InsightFeed`), right rail (Playbooks/
  Cascades/Schedules/Digests tabs, `DelegationsRail`, `ApprovalsQueue`).
- 6.4 Section-health computation job: writes per-section + overall health snapshots after
  relevant events (versioned formula; Dashboard's client-side formula from July 2 migrates
  here and the client code reads snapshots).
- 6.5 Cascade execution UX: stacked delegation card in Atlas chat + per-step DAG drawer;
  the 7 seeded cascades runnable; Board Pack produces an exportable PDF brief.
- 6.6 Approvals: queue UI (badge count), decide actions; worker executes only approved
  outreach/schedule-change/canvas-change payloads; expiry honored.
- 6.7 Conflict cards: insight tag `conflict` → Atlas arbitration output rendered
  side-by-side w/ Accept/Override (override recorded).
- 6.8 Nav: War Room first sidebar item; "Ask Atlas" affordance in top bar; Realtime on
  insights/agenda/metric_snapshots/cascade_runs.
- 6.9 Tests: DAG executor (parallel groups, dependency skip on failure, partial synthesis);
  delegation depth-1 rejection; approvals gate (unapproved payload never executes); map mode
  switching on fixtures.

**Acceptance criteria**
- [ ] Full loop demo on staging: seeded critical insight → Atlas triage → cascade fires →
  delegations visible in both rooms → brief card + agenda item + approval produced
- [ ] Map renders all four modes from snapshots; collapsing persists
- [ ] Board Pack cascade → PDF export works
- [ ] Depth-1 + approvals-gate tests green; all gates green

**Reviewer checklist:** run the full-loop demo personally; attempt an unapproved outreach
execution via direct job insert (must refuse); audit Atlas's prompt for the "never do section
work" guardrail; check cascade partial-failure produces an honest brief; performance pass on
the Map (no metric math client-side).

---

### PHASE 7 — Metrics, KPIs & the interpretation layer (M/L)

**Objective:** spec 05 complete: composite indices, KPI rail, detection→pattern→narrative.

**Work orders**
- 7.1 Metric families wave 1 (per spec 05 §2 owner/cadence tables): SoV (Grok counts),
  review velocity/rating, pricing posture (from Phase 3 fetchers), ship velocity, hiring
  velocity/mix, search interest, macro series (FRED, per-industry selection at onboarding).
- 7.2 Composite indices (Visibility/Momentum/Threat/Tailwind) with versioned formulas +
  baseline-100 indexing; drill-down UI (click composite → components + history + evidence).
- 7.3 `kpis`: CRUD UI (dashboard rail + workspace context), Atlas proposal flow through
  approvals, owner-agent loop wiring, status transitions posting insights.
- 7.4 Interpretation pipeline: statistical detection job (z-score/threshold/KPI transitions —
  no LLM), pattern library v1 (the 4 named patterns from spec 05 §5 + schema for adding more),
  cheap-model matching, Atlas narrative Insight Cards; "Atlas's Read" dashboard panel.
- 7.5 Dashboard recomposition per spec 05 §8 (composites row, KPI rail, competitor strip,
  operational row).
- 7.6 Model-scout: monthly OpenRouter catalog sweep job + `model_evals` harness (seed 10
  golden examples for `extract` and `classify`), route-change proposals via approvals;
  Settings cost panel (spend by agent × task_class × model, cost-per-insight).
- 7.7 Tests: detection on synthetic series (known anomalies caught, quiet series silent);
  index math; KPI transitions; sweep proposal generation from a fixture catalog.

**Acceptance criteria**
- [ ] Dashboard leads with live composites; every tile shows provenance tier; drill-downs work
- [ ] A synthetic competitor price-cut fixture flows: detection → pattern match ("upmarket
  move" or price pattern) → Atlas narrative card on dashboard → agenda item
- [ ] KPI set by human and KPI proposed by Atlas both function; at-risk transition posts insight
- [ ] Cost panel shows real per-class spend; model sweep produces a sane proposal on fixture
  data
- [ ] All gates green

**Reviewer checklist:** feed the pipeline a noisy-but-normal series (must stay silent — false
positives are the failure mode); verify narrative cards cite the actual numbers; recompute one
composite by hand from `inputs`; check T3 metrics can't trigger autonomous action; audit new
loops' budget settings.

---

### PHASE 8 — Hardening & commercial (M, deliberately last)

Per ROADMAP Phase 7–8: digest emails, multi-company AccountSwitcher, billing, roles, onboarding
flow, editor (Plate), paid feed upgrades. **Not specced for the AI team yet — stop at Phase 7
and await direction.**

---

## PART III — Review protocol (how Matt's check works)

When a phase hits `AWAITING REVIEW`:
1. Reviewer re-runs all quality gates + the phase's test suite from a clean checkout.
2. Reviewer walks the acceptance criteria one by one against *code and running behavior*, not
   BUILD_STATE claims.
3. Reviewer runs the phase's **Reviewer checklist** (adversarial by design).
4. Findings land in `BUILD_STATE.md → REVIEW FINDINGS` as `RF-<phase>-<n>` items with severity
   (BLOCKER / HIGH / MEDIUM / LOW). BLOCKER/HIGH must be fixed and re-reviewed before the phase
   closes; MEDIUM within the next phase; LOW logged.
5. Phase marked `APPROVED` → next phase may begin.

## PART IV — Dependency map

```
P0 ──▶ P1 ──▶ P2 ──▶ P3 ──▶ P4 ──▶ P6 ──▶ P7 ──▶ P8
                │            ▲
                └──▶ P5 ─────┘   (P5 needs P2 threads/jobs; P6 needs P4 gaps/metrics + P5 components)
```

P3 and P5 can run concurrently by separate agent teams **only if** both teams treat Phase-1
migrations as frozen; any schema change mid-phase goes through a BLOCKER entry.
