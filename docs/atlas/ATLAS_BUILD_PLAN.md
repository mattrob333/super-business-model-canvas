# ATLAS REFACTOR — Phased Build Plan for Sub-Agents

> The assimilation layer between the Atlas design package (the five spec files in this
> folder) and this repo. The specs were authored against an assumed Next.js 15 / Vercel
> stack; **the real stack is a Vite React SPA + Fly.io worker + Supabase**. Per the
> handoff's own rule — *"prefer repo conventions for style, spec for architecture"* —
> this plan re-maps every milestone onto what actually exists. Sub-agents implement
> from THIS document; the specs are the architecture authority behind it.
>
> Ground rules from `docs/BUILD_PLAN.md` Part I apply unchanged (branch discipline,
> quality gates, BUILD_STATE updates, blockers protocol, migrations + RLS, no fake
> completeness). Read that first if you haven't.

---

## 0 · Reading order & priority on conflict

| # | File | Role |
|---|---|---|
| 1 | `HANDOFF-atlas-refactor.md` | Mission, 9 pre-made decisions (do not relitigate), retrofit tasks, acceptance checklist, guardrails |
| 2 | `atlas-orchestrator-a2ui-spec.md` | Architecture: brain, coverage map, A2UI, synthesis, milestones, scope fence (§6 is binding) |
| 3 | `positioning-sprint-workflow-card.md` | **Canonical workflow card + OUTPUT CONTRACT (law for all workflows)** |
| 4 | `atlas-workflow-library.md` | 23-workflow catalog, registry card YAML schema (§1), build order for future cards |
| 5 | `hormozi-brain-os.md` | Workflow #1 prompts (validated content; predates the contract — retrofit, don't rewrite) |
| 6 | `takeoffspeed-hormozi-run.md` | Golden-path run fixture: what a finished Hormozi run looks like |

Priority on conflict: **orchestrator spec > positioning card's output contract > library
doc > hormozi doc**. This plan sits alongside the orchestrator spec: where this plan
adapts a mechanism to the real stack, this plan wins; where it's silent, the spec wins.

## 1 · Stack adaptation ruling (read before objecting to anything below)

The handoff assumes Next.js 15 SSE streaming chat. This repo's chat is **job-queue
based**: the SPA enqueues `agent_jobs`, the Fly worker processes them, results land in
`workspace_messages` / `skill_artifacts`, and the SPA polls (see `useRoomSkills` +
`SkillRunStatusCard` — that precedent is exactly the shape we extend). Handoff decision
7 **pre-approves** the fallback: keep the A2UI JSONL message format and catalog trust
model, hand-roll the dispatcher. So:

- A2UI messages are **persisted as `workspace_messages` rows** (new `kind: 'a2ui'`),
  emitted by the worker at each step boundary, picked up by the existing polling.
  Progressive render is **per-step**, not per-token. True SSE token streaming is a
  `DECISION-NEEDED` (see §8), not a blocker — the message discipline is what matters.
- "Render once, stay live" is implemented as React Query invalidation on brain-variable
  writes, not a persistent socket.
- Everything else (registry cards, dual output contract, brain provenance, coverage
  scoring, synthesis) is UI-independent and maps cleanly.

## 2 · What already exists — reuse map (verified against the repo 2026-07-12)

The specs were written without full knowledge of this codebase. These overlaps are
real; sub-agents must extend, not duplicate:

| Spec concept | Repo reality today | Verdict |
|---|---|---|
| Workflow runner (multi-step, registry-driven) | `skill_run` job kind + `SKILL_REGISTRY` (`worker/src/jobs/skill-run.ts`, `jobs/skills/*`) — but skills are **code**, one TS module each | **New sibling pipeline** `workflow_run`. Skills stay as-is (single-shot, code). Workflows are YAML data run by one interpreter. Long-term convergence is DECISION-NEEDED, not this build. |
| Dual output (markdown + JSON) | `skill_artifacts` already stores `body_md` + `payload jsonb` + evidence links | Pattern precedent. Workflow artifacts get their **own table** (`workflow_artifacts`) because the contract mandates frontmatter fields (`produces[]`, `consumed[]`, `confidence`) that `skill_artifacts` lacks, and `skill_key` FK doesn't fit. |
| Gap engine ("Atlas leads") | `gap_engine` job + `gaps` table = **competitor gap analysis** (`competitor_gap_v1` scoring) — a different concept entirely | Do not touch. All new work uses the word **"coverage"** (`coverage_manifest`, coverage scoring) to avoid collision. |
| Atlas the orchestrator | `atlas_briefing` job — deterministic "State of the Union" briefing (spec 12) | Extend. The briefing's context-assembly discipline (DB is the referee, model narrates only what queries provide) carries into the coverage loop. |
| Workflows-as-data precedent | `cascades` / `cascade_runs` / `cascade_steps` tables (spec 04 template library; barely wired in the worker) | Leave alone. Whether workflow cards supersede cascades is DECISION-NEEDED. |
| Compact canvas snapshot | `atlas-briefing.ts` + `workspace-chat.ts` already assemble scoped canvas context via `loadCompanyScope` | Extract/reuse — do not write a third snapshot builder. |
| Canvas storage | `canvas_section_versions` (append-only versions), populated by `company_research` / `canvas_section_analysis` | Keep as source of truth for the canvas UI. R3 = **mirror** own-company section writes into `canvas.*` brain variables (`source: 'scraped'`); never break the existing write path. |
| Run status in chat | `SkillRunStatusCard` in `WorkspaceThread` + `useRoomSkills` polling | The A2UI `WorkflowRunCard` is this pattern, generalized. |
| Trust/verification culture | Evidence-or-low-confidence law, verifier spot-checks, honest `degraded()` feeds | Brain provenance metadata is the same philosophy, formalized per-variable. |

## 3 · Non-negotiables (inherited, restated once)

From handoff §3 + §7 and spec §6 — binding for every phase:

1. Workflows are **data** (YAML cards), one runner, no per-workflow code paths.
2. Dual output per step; schema-validated VARIABLES; **one retry** with the validation
   error appended, then fail the step **visibly**.
3. Variables canonical, artifacts provenance. Downstream reads variables only.
4. `user_stated` / `user_override` outrank machine sources — contradict, never overwrite.
5. Catalog capped at **10 components**. New component = catalog PR. No model-generated
   JSX/HTML, ever. Attempts to render off-catalog components are rejected and logged.
6. Compact snapshot means compact (~1–2k tokens). A step needing more is a broken card —
   flag it, don't stuff the window.
7. Only the two authored cards are runnable. Do not invent workflow content; the other
   21 library entries are specs (register as `status: draft` stubs at most).
8. Scope fence: no graph RAG, no custom per-workflow pages, no multi-agent mesh.
9. Ambiguity → `DECISION-NEEDED:` comment + move on. Never guess on architecture.
10. Repo law still applies: additive-only migrations with RLS (`is_account_member`
    pattern), account scoping via `loadCompanyScope` on every worker read/write, gates
    green before every push, BUILD_STATE entry per round.

---

## 4 · The phases

Sizing: S ≈ agent-day · M ≈ 2–3 agent-days · L ≈ agent-week. Phases AT-1 and AT-2 are
UI-free and can start immediately. One phase per PR round; do not start AT-(n+1) before
AT-n is merged (exception: AT-4 component authoring can overlap AT-3 review).

---

### PHASE AT-1 — Business brain: schema + store + scrape mirror (M)
*Spec milestone 1 + retrofit R3.*

**Objective:** the typed variable store with provenance exists, is RLS-safe, enforces
trust ordering, and the existing scrape pipeline writes through it.

**Work orders**

1. **Migration `brain_variables` + `brain_variable_history`** (new file under
   `supabase/migrations/`, mirrored into `supabase/schema.sql`, regenerate
   `src/integrations/supabase/types.ts`):
   - `brain_variables`: `id uuid pk`, `account_id uuid not null → accounts`,
     `path text not null` (e.g. `canvas.customer_segments`,
     `positioning.one_liner`), `value jsonb not null`,
     `confidence text not null check (confidence in ('high','medium','low'))`,
     `source text not null` (`user_stated` | `user_override` | `scraped` |
     `mcp_pull:<connector>` | `workflow:<id>@v<ver>#s<n>`),
     `source_artifact text`, `staleness_policy text`, `updated_at timestamptz`,
     `created_at timestamptz`. **Unique `(account_id, path)`.**
   - `brain_variable_history`: same columns + `variable_id` + `change_reason text`
     (`initial` | `update` | `user_override` | `contradiction_resolution`). Append-only.
   - RLS on both: members read; writes via service role (worker) and the AT-4 RPC only.
2. **Migration `coverage_manifest`**: global template rows using the
   `account_id is null` + partial unique index pattern (copy from `skill_catalog` /
   `cascades` in `schema.sql`): `path text`, `section_key text null`, `title text`,
   `value_weight int not null`, `fill_actions jsonb not null` (ordered array,
   cheapest-first: `[{"action":"ask","prompt":"…"},{"action":"scrape"},{"action":"workflow","workflow_id":"positioning-sprint"}]`),
   `freshness text null`, `sort_order int`. **Seed `canvas.*` (9 BMC slots, weights
   reflecting downstream fan-out — `customer_segments` highest) and `positioning.*`
   (the 8 slots from the positioning card's `produces_variables`) — nothing else yet.**
3. **Worker `BrainStore`** — `worker/src/db/brain.ts`:
   - `readVariables(client, accountId, { prefix | paths })`
   - `writeVariables(client, accountId, writes[], { source, sourceArtifact })` —
     single round-trip upsert + history append. **Trust ordering enforced here and
     only here:** if the existing row's source is `user_stated`/`user_override` and
     the incoming source is machine (`scraped`/`mcp_pull`/`workflow:*`), do NOT
     overwrite — instead write a `contradiction.<path>` variable
     (`value: {existing, incoming, detected_at}`, `source` = the machine source) and
     return the conflict in the result so callers can surface it. Machine-over-machine:
     latest wins. User writes always win.
   - Unit tests in `worker/src/__tests__/` (vitest): write/read round-trip, trust
     ordering, contradiction record creation, history rows, account isolation.
4. **R3 — scrape mirror**: in the jobs that populate the OWN company's canvas
   (`company-research.ts`, `canvas-section-analysis.ts`), after the existing
   `canvas_section_versions` write for `competitor_id is null`, mirror the section's
   items into brain variable `canvas.<section_key>` via `BrainStore`
   (`source: 'scraped'`, confidence mapped from section confidence). Competitor
   sections are NOT mirrored (the brain is the account's own business —
   see DECISION-NEEDED #4). Existing writes and UI reads are untouched.

**Acceptance:** migrations applied live (Supabase MCP) and verified; brain store tests
green; a fresh company-research run produces `canvas.*` rows with full provenance
metadata (handoff §6 item 3, brain half); zero regressions in worker test suite.

---

### PHASE AT-2 — Workflow registry + headless runner (L)
*Spec milestone 2 + retrofits R1, R2, R4. The heart of the build.*

**Objective:** both authored workflow cards load from the registry and run headless
end-to-end against a seeded canvas, writing variables + a frontmattered artifact.

**Work orders**

1. **Card schema + registry loader (R2)** — `worker/src/workflows/registry.ts`:
   zod-validated card shape exactly per library doc §1 + the positioning card's
   fields: `id, name, category, framework_source, version, status
   (runnable|draft), inputs_required[] (brain paths), inputs_optional[],
   missing_input_behavior, tools_allowed[], tools_required_steps[], steps[],
   produces_variables[], consumed_by[], output_artifact, output_page_hint,
   est_context_per_step`. Each step: `id`, `prompt` (verbatim text), `reads[]`,
   `variables_schema` (JSON Schema object). Cards are YAML files in
   `worker/workflows/*.yaml`, loaded and validated at worker boot — a malformed card
   fails boot loudly. New deps in `worker/package.json`: `yaml` (parse) and `ajv`
   (data-driven JSON Schema validation — zod can't validate schemas that live in data).
2. **Author card 1** — `worker/workflows/positioning-sprint.yaml`: transcribe
   `positioning-sprint-workflow-card.md` (registry YAML + system preamble + 6 step
   prompts + per-step VARIABLES schemas, verbatim — it is already written to the
   standard).
3. **R1 — retrofit card 2** — `worker/workflows/hormozi-brain-os.yaml`: prompts 00–06
   from `hormozi-brain-os.md` **unchanged** (content is validated); wrap in registry
   YAML (library §1 sketches it); derive per-step VARIABLES schemas from what the
   TakeoffSpeed run actually produced: `market_fit` (4 scores + verdict),
   `offers[]` + value-equation scores, `bonus_stack[]`, `guarantee`, `scarcity`,
   `urgency`, `offer_name`, `hooks[]`, `proof_assets[]`, `content_pillars[]` +
   `calendar`, `punch_list[]`. Declare `inputs_optional:
   [positioning.statement, positioning.value_themes, positioning.best_fit_segment]`
   (this is what proves cross-workflow variable reads in acceptance). Add ARTIFACT
   SECTION markers per the output contract.
4. **Migrations** — `workflow_runs` (`id, account_id, workflow_id, status
   queued|running|completed|failed, current_step text, step_state jsonb, artifact_id
   uuid null, error text, created_at, started_at, finished_at`; RLS members read) and
   `workflow_artifacts` (`id, account_id, workflow_id, run_id, title, body_md,
   frontmatter jsonb` — `{workflow, version, business, run_date, produces[],
   consumed[], confidence}` — `stale boolean default false, created_at`; RLS members
   read). Plus a `workflow_catalog` seed? **No** — cards ship in the repo; the SPA can
   list them via a tiny worker-exposed catalog later (AT-3). Keep DB surface minimal.
5. **Runner** — new job kind `workflow_run` in `worker/src/jobs/dispatch.ts` +
   handler `worker/src/jobs/workflow-run.ts`:
   - `loadCompanyScope` → **compact canvas snapshot**: extract the assembly already
     living in `atlas-briefing.ts` into a shared helper
     (`worker/src/domain/canvas-snapshot.ts`), hard-capped ~2k tokens (≈8k chars);
     over-budget → truncate lowest-weight sections + log a card-is-wrong warning.
   - Resolve `inputs_required` from brain (`canvas.*`); missing → follow the card's
     `missing_input_behavior` (run full-research mode, or fail the run with a
     human-readable "what to collect" error — never a stack trace).
   - Per step: system preamble (card) + snapshot + **prior steps' VARIABLES JSON only**
     (never artifact prose) → model call via existing `AgentRunner` +
     `chooseModelRoute`. Steps whose card allows tools get the existing feed/tool
     plumbing (`web_search` via `FeedRunner` — same as skills).
   - Parse dual output: everything before the final fenced JSON block = ARTIFACT
     SECTION; the fenced block = VARIABLES. ajv-validate. **Invalid → one re-run with
     the validation errors appended to the prompt; second failure → `status: failed`,
     `error` populated, step + reason visible in `workflow_runs`.** Never silent.
   - On step success: `BrainStore.writeVariables` (source
     `workflow:<id>@v<ver>#s<n>`, `source_artifact` = the run's artifact slug);
     any `contradictions[]` block in the output → `contradiction.*` records; update
     `workflow_runs.step_state`.
   - On completion: concatenate ARTIFACT SECTIONs → **R4 de-slop hook stub**
     (`worker/src/workflows/postprocess.ts`: identity function with a documented hook
     point for the de-slop skill from `mattrob333/ai-skill-index` — stub only) →
     insert `workflow_artifacts` with complete frontmatter → mark run completed.
6. **Tests** (mock runner, fixtures): both cards load + schema-validate; a scripted
   6-step positioning run E2E against a seeded canvas (assert variables land with
   provenance, artifact frontmatter complete); invalid-JSON step → retry → visible
   failure; `user_stated` value survives a re-run (contradiction written instead of
   overwrite); snapshot cap enforced; Hormozi card consumes seeded `positioning.*`
   variables. Store the TakeoffSpeed run under `worker/src/__tests__/fixtures/` as the
   shape reference for the Hormozi schemas.

**Acceptance:** handoff §6 items 1–4 fully green in the worker test suite (headless —
no UI involved). Worker gates green (`typecheck`, `vitest`, `build`, `eslint`).

---

### PHASE AT-3 — A2UI surface in chat + runner binding (M)
*Spec milestones 3 + 4, adapted per §1 of this plan.*

**Objective:** a live workflow run renders in the workspace thread as streamed-in
catalog components; nothing off-catalog can render.

**Work orders**

1. **Message transport**: new `workspace_messages.kind = 'a2ui'` (check the existing
   kind constraint; additive migration if enum-constrained). Payload = JSONL-equivalent
   array of A2UI messages (`createSurface` once per run, then per-step
   `updateComponents` + `updateDataModel`). The runner (AT-2) emits them at step
   boundaries into the run's thread. Existing chat polling delivers them.
2. **Catalog v1 (4 of 10)** — `src/components/a2ui/`: `A2uiSurface.tsx` (dispatcher:
   parses messages, maintains the surface's data model, resolves JSON Pointer bindings)
   + `VariableCard`, `GapPrompt`, `ChoiceChips`, `WorkflowRunCard`. **The dispatcher's
   component map IS the whitelist**: an unknown component name renders a rejected-
   component marker and `console.warn`s with the payload — it must never throw or
   render arbitrary content (handoff §6 last item).
3. **Thread wiring**: `WorkspaceThread.tsx` renders `kind: 'a2ui'` messages via
   `A2uiSurface` (same slot pattern as `SkillRunStatusCard`). `WorkflowRunCard` reads
   run/step status from `workflow_runs` (poll or piggyback the message payloads —
   simplest honest option wins).
4. **Launch path**: minimal — a `useWorkflowRuns` hook (mirroring `useRoomSkills`:
   enqueue `workflow_run` job, poll status) + two launch buttons in the War Room /
   Atlas workspace hero (`src/lib/workspace-hero.ts` entry). Where workflow launch
   lives long-term is DECISION-NEEDED #3 — do not build a workflow browser UI now.
5. Confidence display: every `VariableCard` shows the variable's confidence (spec §1
   rule) — bake it into the component, not per-call-site.

**Acceptance:** handoff §6 item 5 — chat renders `WorkflowRunCard` + at least
`VariableCard` and `GapPrompt` from persisted A2UI messages during a live run
(verified against the deployed site with a real run). Root gates green (tsc, build,
lint ≤ frozen ceiling). Both themes, zero overflow at 390px (DESIGN_TASTE law).

---

### PHASE AT-4 — Write-back + full catalog (M)
*Spec milestone 5.*

**Objective:** editing a rendered variable writes `user_override` to the brain, every
bound surface updates, and the value survives re-runs.

**Work orders**

1. **RPC migration** `write_brain_variable(p_path text, p_value jsonb)` — security
   definer, validates `is_account_member`, writes `source: 'user_override'` +
   history append, returns the row. All UI writes go through it (trust ordering
   must never depend on client code).
2. **`actionResponse` path**: `VariableCard` (and `GapPrompt` answers → `user_stated`
   via the same RPC with a source parameter, constrained to the two user sources)
   → RPC → React Query invalidation of brain-variable queries → all bound surfaces
   re-render. Persist the `actionResponse` as an `a2ui` message row for run
   provenance.
3. **Remaining 6 catalog components**: `ScoreTable`, `ComparisonStrip`,
   `ValueThemeCard`, `ConfidenceBadge`, `CoverageMap`, `ContradictionAlert`.
   Catalog is now COMPLETE at 10 — the cap is law; document it in
   `src/components/a2ui/README.md` (new component = catalog PR).
4. **Worker test**: re-run positioning after a `user_override` on
   `positioning.one_liner` — assert the override survives and a `contradiction.*`
   record appears (handoff §6 item 6).

**Acceptance:** §6 item 6 green; catalog complete and capped; gates green.

---

### PHASE AT-5 — Coverage gap engine v1 (M)
*Spec milestone 6. This is what makes Atlas "lead".*

**Work orders**

1. **Scoring** — `worker/src/domain/coverage.ts`: for each `coverage_manifest` slot ×
   the account's brain: `gap_score = value_weight × urgency ÷ fill_cost`. Urgency:
   empty slot = max; else staleness ratio from `updated_at` vs `staleness_policy`.
   Fill cost from the slot's cheapest available `fill_action`
   (ask 1 · scrape 3 · mcp_pull 3 · workflow 8 — named constants, tune later).
   Pure function + unit tests; the DB is the referee (atlas-briefing rule B3).
2. **Propose in context, never derail**: surface top gaps in the `atlas_briefing`
   payload and in `workspace-chat` context assembly for the Atlas room, so Atlas can
   propose the single top action conversationally. A gap proposal renders as a
   `GapPrompt` / `ChoiceChips` a2ui message. Answer → `user_stated` write (AT-4 RPC
   path) → re-score. Queued gaps (not proposed mid-task) render in the `CoverageMap`
   component ("your brain is 62% filled — biggest gap: pricing") in the Atlas room's
   right rail (shelf pattern).
3. **Re-parameterize without restart**: before each workflow step, the runner
   re-reads its declared input paths from the brain (cheap — AT-2 already reads per
   step); a `GapPrompt` answered mid-run therefore flows into the next step
   naturally. No new mechanism — just document + test it.
4. **Naming law**: nothing in this phase touches the existing `gaps` table /
   `gap_engine` job (competitor gaps). Grep-proof the diff: no new references.

**Acceptance:** with a thin seeded canvas, Atlas's briefing/chat proposes the highest-
score gap; answering writes `user_stated` and the next proposal changes; CoverageMap
renders live percentages. Gates green.

---

### PHASE AT-6 — Synthesis jobs (M)
*Spec milestone 7. The brain thinks.*

**Work orders**

1. New job kind `synthesis_sweep` (enqueued by the runner after each completed
   workflow run; also schedulable): over the recent write burst —
   - **Contradiction sweep** (first): same-path and same-fact variables from
     different sources disagree → `contradiction.*` record (`ContradictionAlert`
     renders it — component exists since AT-4).
   - **Synergy detection** (second): rule-pack + one LLM pass over cross-domain
     variable pairs (e.g. `intel.competitor_gaps[] × canvas.key_resources`) →
     `synergy.*` records with backlinks. Synthesis **never mutates source
     variables** (spec §1 rule 3).
2. **Cascade invalidation**: on any brain variable change, flag every
   `workflow_artifacts` row whose `frontmatter.consumed[]` contains that path as
   `stale = true`; CoverageMap surfaces "re-run suggested". (Do it in `BrainStore.
   writeVariables` — one query — not a polling job.)
3. Tests: contradiction detection across sources; synergy record shape + backlinks;
   staleness cascade on override.

**Acceptance:** handoff §6 item 7 (contradiction between scraped and researched values
produces a ContradictionAlert record) demonstrated in tests + once live. Full handoff
§6 checklist reviewed line-by-line in BUILD_STATE at phase close.

---

## 5 · Acceptance checklist ownership (handoff §6 → phases)

| §6 item | Phase |
|---|---|
| Both cards load + run headless E2E | AT-2 |
| VARIABLES schema-validate, 1 retry, visible failures | AT-2 |
| Variables with full provenance; artifacts with frontmatter | AT-1 + AT-2 |
| Positioning variables consumed by Hormozi `inputs_optional` | AT-2 |
| Chat renders WorkflowRunCard + VariableCard + GapPrompt live | AT-3 |
| VariableCard edit → `user_override`, survives re-run | AT-4 |
| Scraped-vs-researched contradiction → ContradictionAlert record | AT-6 (record shape from AT-1) |
| Nothing off-catalog renders; attempts rejected + logged | AT-3 |

## 6 · Dependency map

```
AT-1 (brain) ──► AT-2 (runner) ──► AT-3 (surface) ──► AT-4 (write-back)
                                        │                    │
                                        ▼                    ▼
                                   AT-5 (coverage) ──► AT-6 (synthesis)
```
AT-5 needs AT-4's RPC for GapPrompt answers; AT-6 needs AT-4's ContradictionAlert to
render (records themselves exist from AT-1).

## 7 · What we are NOT building (scope fence — spec §6, restated)

- No model-generated JSX/HTML. Catalog only, ever.
- No graph RAG (frontmatter edges + Supabase queries suffice; the schema-enforced
  variables make it a later migration script, not a rewrite).
- No custom per-workflow pages (a "page" is a saved surface definition — nearly free
  after AT-3/AT-4; park it).
- No multi-agent A2A mesh. Atlas is one orchestrator.
- No authoring of the other 21 library workflows. Cards only exist for the two
  authored ones.

## 8 · DECISION-NEEDED register (for Matt — none block AT-1/AT-2)

1. **True SSE token streaming** for workflow prose in chat, vs. the per-step message
   batches this plan ships. Batches are honest and cheap; streaming is a transport
   project touching worker + SPA.
2. **`cascades` tables vs. workflow registry**: the spec-04 cascade template library
   overlaps with workflow cards. Supersede, merge, or keep for skill-orchestration?
3. **Workflow launch UX home**: War Room hero buttons (shipped in AT-3) vs. a
   Workflows drawer vs. Atlas chat commands ("run positioning sprint").
4. **Competitor-scoped brains**: `brain_variables` is account-scoped (your business).
   Competitor intel stays in the existing canvas/evidence system; `intel.*` variables
   describe YOUR competitive picture. If per-competitor brains are ever wanted,
   that's a `company_id` column + scoping decision.
5. **Draft stubs for the other 21 workflows** in a catalog UI now, or when a workflow
   browser ships. (Library doc allows "at most" stubs.)
6. **skill_run ↔ workflow_run convergence**: eventually skills could become
   single-step workflow cards. Cheap to defer; expensive to rush.
