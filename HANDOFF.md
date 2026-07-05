# Super BMC — Incoming Agent Handoff

**Last updated:** July 4, 2026 · **Repo:** github.com/mattrob333/super-business-model-canvas
**You are:** the build agent taking over execution from BUILD_PLAN Phase 4 onward.
**Owner:** Matt (mroberson333@gmail.com) — a reviewer agent audits each phase behind you
(see Review protocol below).

This file is the front door. Everything you need exists and is current — your job is
execution, not re-planning.

---

## 1. Where the project stands (verified, not aspirational)

| Done | What |
|---|---|
| ✅ | Product vision + North Star, architecture decision, 10 specs, phased build plan (all in `docs/`) |
| ✅ | July-2 bug-fix sweep, SaaS landing page, app light-mode grid treatment — merged |
| ✅ | **Production hosting live** — superbmc.com on Fly.io (`super-bmc-web` + `super-bmc-worker`); push to `main` auto-deploys both via GitHub Actions (`deploy.yml`); secrets sync + edge-function deploys via the manual Ops workflow. Full runbook: `DEPLOY.md` |
| ✅ | **FocusDrawer overlay system** (spec 09, binding) + `docs/DESIGN_TASTE.md` house rules — all new UI builds on these |
| ✅ | **Phase 0** (baseline verification) — APPROVED |
| ✅ | **Phase 1** (data model wave 1) — APPROVED: 12 new tables + RLS + seeds (10 agent callsigns, 7 cascades, task-class model routes), schema mirror, verify-schema assertions |
| ✅ | **Phase 2** (agent worker service) — APPROVED: `worker/` Node service on the Claude Agent SDK; durable `agent_jobs` queue (SKIP LOCKED claim + backoff + reaper); account-scoped in-process MCP tools; enqueue mode in `agent-run`; guardrail hooks |
| ✅ | **Phase 3** (research engine & evidence) — APPROVED with reviewer fixes (PR #13): feed registry + TTL cache (6 wave-1 fetchers), `company_research` pipeline (budget extract → escalation ladder → adversarial verifier, never downgraded), evidence-cited canvas writes, evidence popovers on the canvas, weekly staleness sweep, verifier golden set (fixture + live modes) |
| 🔶 | **Phase 4 — competitor canvases & gap engine: built, AWAITING REVIEW** on `build/phase-4-competitors` |
| ⬜ | Phases 5–7 per `docs/BUILD_PLAN.md`; Phase 8 (advisor/portfolio experience) held for owner direction |

**Deploys are automated now:** merging to `main` auto-deploys web + worker (GitHub Actions
`deploy.yml`); edge functions and secret sync run via the manual Ops workflow (owner-triggered).
See `DEPLOY.md`. What remains operator-only: GitHub/Fly/Supabase secrets, DNS, dashboard
settings — queue those in BUILD_STATE's OPERATOR QUEUE and never fake their completion.
Live-DB migrations may be applied via the Supabase MCP (project `mehhuxzamnpxnkbrslls`) as
prior phases did — log it in BUILD_STATE when you do.

## 2. Read these, in this order, before writing code

1. `docs/NORTH_STAR.md` — the vision bar every ambiguous decision resolves against.
2. `docs/BUILD_PLAN.md` — **Part I ground rules are binding.** Then your phase's work orders.
3. `docs/BUILD_STATE.md` — live status board; you must keep it truthful as you work.
4. `docs/specs/00_OVERVIEW.md` → specs 01–09 (skim all; deep-read the ones your phase cites).
   Phase 5 requires spec 08 (knowledge stack + grounding); Phase 6 requires spec 08 §§5–7.
5. **Any phase with UI work:** `docs/DESIGN_TASTE.md` (house rules) and
   `docs/specs/09_OVERLAY_SYSTEM.md` (FocusDrawer) are binding. No hand-rolled overlays,
   no per-callsite drawer widths, a drawer never opens another drawer.
6. Working with the Claude Agent SDK (any phase touching `worker/`):
   `docs/specs/07_CLAUDE_AGENT_SDK_INTEGRATION.md` is **required pre-reading**. Do not guess
   SDK APIs.
7. Context (skim): `docs/VISION.md`, `docs/AGENT_RUNTIME_DECISION.md`, `docs/ROADMAP.md`
   (historical — BUILD_PLAN supersedes it), `docs/DEVLOG.md` (bottom-up history including
   every bug already fixed — don't re-fix), `DEPLOY.md` (how production works).

## 3. Non-negotiable working rules (compressed from BUILD_PLAN Part I)

- **One phase at a time.** Branch `build/phase-<n>-<slug>` from `main`. Small conventional
  commits. PR to `main` only after the phase review is APPROVED.
- **Gates on every commit:** `npx tsc -p tsconfig.app.json --noEmit` clean ·
  `npm run build` green · `npm run lint` **problem count ≤ 65** (the ratcheting ceiling — it
  only goes down; do not "fix" pre-existing lint in feature diffs, do not add to it. When
  dead-code deletion lowers the count, the new count becomes the ceiling — update this file
  and BUILD_PLAN when it moves). Worker code: `cd worker && npm run typecheck && npm test
  && npm run build && npm run lint` all clean.
- **No fake completeness.** Partial work is reported as partial in BUILD_STATE. A test that
  reimplements the logic it claims to test counts as fake completeness (this exact pattern
  was caught in the Phase 3 review — RF-3-8). The reviewer diffs claims against code and
  runs adversarial checks against **production seeds and real data paths**, not test fakes.
- **Blockers:** write to BUILD_STATE `BLOCKERS` with a recommended resolution, take the
  conservative path, keep moving on unblocked tasks.
- **Schema changes only via migrations** (+ mirror into `supabase/schema.sql`, + regenerate
  `src/integrations/supabase/types.ts`, + extend `scripts/verify-schema.sql`). RLS on every
  new table. Keep files valid UTF-8 (RF-3-3 was a mojibake regression).
- **Operator tasks** (deploys, secrets, hosting) go to the OPERATOR QUEUE — exact commands,
  never executed by you, never marked done by you.
- **Guardrails are law:** every run durable in `agent_runs` · evidence-or-low-confidence on
  canvas writes · outward actions only via `approvals` rows · depth-1 delegation · section
  agents never write outside their section · budgets enforced · verifier NEVER routed to the
  budget tier.

## 4. Review protocol (what happens when you finish a phase)

Mark the phase `AWAITING REVIEW` in BUILD_STATE and stop. A reviewer agent re-runs your
gates from a clean checkout, walks the acceptance criteria against *running behavior*, and
executes the phase's adversarial checklist. Findings arrive as `RF-<phase>-<n>` items:
BLOCKER/HIGH block the phase; MEDIUM due next phase; LOW logged. Precedents to calibrate to:
Phase 1's review ran migrations on scratch Postgres and caught a typo'd model ID; Phase 3's
review traced model routing against the **seeded routes** and caught (a) an OpenRouter model
being fed to the Anthropic-only SDK and (b) an "escalation" that resolved to the same route
it escalated from — both invisible to tests built on fake data. Assume that level of
scrutiny.

## 5. Facts and gotchas that will save you hours

- **Model ID conventions:** direct Anthropic API IDs use dashes (`claude-opus-4-8`,
  `claude-sonnet-5`, `claude-haiku-4-5-20251001`); OpenRouter slugs use dots
  (`anthropic/claude-haiku-4.5`); xAI is `grok-4.3`. Both conventions appear in
  `model_routes` seeds — each is correct for its provider. Don't "normalize" them.
- **Provider-aware execution:** `worker/src/agent/runner.ts` has `ClaudeAgentRunner`
  (provider `anthropic`) and `OpenRouterChatRunner` (provider `openrouter`). Route by
  `route.provider` — the Claude SDK cannot run OpenRouter models.
- **The worker's service-role key bypasses RLS.** Every tool handler and job must filter by
  the job's `account_id` in code (spec 07 §3). Standing #1 reviewer check.
- **Feed discipline:** never fetch external data directly — go through `FeedRunner.refresh`
  (TTL cache in `feed_cache`; non-ok results get a short 300s backoff and are never served
  from cache). `feed_refresh` jobs require an authorizing `scheduled_loops.action_key` row.
- **Evidence discipline:** research claims pass the adversarial verifier
  (`verifyClaimAgainstExcerpt`); unsupported → confidence capped 0.5 + flagged; contradicted
  → gap + insight, never a canvas item. Evidence rows dedup on (account, source_url, excerpt).
- **Scheduled loops → worker jobs:** loops with `action_key` (`staleness_sweep`,
  `feed_refresh:<feed_key>`) are enqueued by `scheduled-loop-tick` → `agent-run` (enqueue
  mode) → `agent_jobs`. New worker job kinds must be added to the `workerJobKinds` list in
  `agent-run` AND the dispatcher. Non-LLM handlers must call `markJobRunCompleted`.
- **Key mappings that must stay in sync:** `src/components/canvas/section-types.ts` ↔
  `SECTION_AGENT_KEYS` in `supabase/functions/agent-run/index.ts` ↔ `agent_profiles.agent_key`
  seeds. Note `key_partners` → `agent_key_partnerships` (historical, intentional).
- **Canvas display:** `src/hooks/useCanvasEvidence.ts` loads latest
  `canvas_section_versions` + hydrated `evidence_items`; the canvas prefers versioned items
  and falls back to legacy analysis strings. Competitor canvases (your phase) should follow
  the same pattern.
- **Lint ceiling is exactly 65 problems (47 errors / 18 warnings)** — pre-existing
  `no-explicit-any` noise, deliberately frozen. Never increase; decreases lower the ceiling.
- **UTF-8 discipline:** mojibake (double-encoded em-dashes/arrows) has regressed twice
  (RF-3-3, and `docs/BUILD_STATE.md` on main as of July 4). Write docs with a tool that
  preserves UTF-8; the reviewer greps every touched doc for the tell-tale `a-circumflex`
  byte sequences.
- **Env:** frontend `.env` holds only `VITE_*` values (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_AGENT_RUNTIME_ENDPOINT`, `VITE_RUNTIME_MODE`).
  Server keys live in Supabase Edge Function secrets; worker keys in `worker/.env` /
  host secrets (see `worker/.env.example`). Provider keys NEVER ship to the browser.
- **Commands:** `npm ci` · `npm run dev` (port 8080) · gates as above ·
  `node scripts/generate-framework-seed.mjs` regenerates framework seeds ·
  live golden set: `cd worker && GOLDEN_LIVE=1 ANTHROPIC_API_KEY=... npx vitest run verifier-golden`.

## 6. Repo map (current)

```
docs/
  NORTH_STAR.md          ← the vision bar (advisor test · evidence test · taste test)
  BUILD_PLAN.md          ← your work orders (Part I rules + Phases 0–8)
  BUILD_STATE.md         ← live tracker you maintain (status, blockers, operator queue, RFs)
  DESIGN_TASTE.md        ← binding UI house rules
  VISION / AGENT_RUNTIME_DECISION / ROADMAP / DEVLOG
  specs/00–10            ← product + technical specs (07 = Agent SDK how-to,
                            08 = knowledge/strategy engine, 09 = overlay system,
                            10 = skill catalog + Atlas doctrine)
.github/workflows/       ← deploy.yml (auto on main: web+worker) · ops.yml (manual:
                            secrets sync, edge functions, live golden set)
src/                     ← React 18 + Vite + shadcn SPA (gates target this)
  hooks/useCanvasEvidence.ts   ← canvas versions + evidence hydration
  components/canvas/           ← BMC grid, section cards, evidence popovers
  components/overlay/FocusDrawer.tsx ← THE drawer (spec 09) — build all drawers on it
supabase/
  schema.sql             ← full mirror, provably identical to migrations
  migrations/            ← Phase 1 wave + queue locking + feeds/cache + routes + staleness
  functions/             ← 13 edge functions (Deno); agent-run has enqueue mode
scripts/
  smoke-test.md          ← manual E2E for post-deploy verification
  verify-schema.sql      ← 86 PASS/FAIL schema assertions (run on scratch Postgres)
worker/                  ← Node + Claude Agent SDK service (queue loop, jobs, feeds, tools)
  src/jobs/              ← canvas-section-analysis · workspace-chat · company-research ·
                            feed-refresh · staleness-sweep · dispatch
  src/feeds/             ← FeedRunner + 6 wave-1 fetchers
.hermes/                 ← retired historical build-loop records (never resume)
```

## 7. Current assignment status

**Phase 4 is APPROVED and merged** (2026-07-04; RF-4-1..14 all resolved by a reviewer-fix
merge — read the resolution log in BUILD_STATE → REVIEW FINDINGS before touching competitor
code; it records invariants you must keep, e.g. own-canvas reads always filter
`competitor_id is null`, the gap engine must stay idempotent via `superseded`).

**Your assignment: Phase 5**, in two stages per BUILD_PLAN — **5A (knowledge stack &
grounding: spec 08)** ships before **5B (the nine workspace rooms: spec 02)**. 5A is the
accuracy moat (dossiers, watched sources, owner questions, grounding wizard, document
ingestion); 5B is the room chrome. Phase 6 may begin once 5A is approved even if 5B is in
flight. Reuse, don't re-implement: `FeedRunner`, `verifyClaimAgainstExcerpt`, the escalation
ladder, `useCanvasEvidence`, and `FocusDrawer` are all built and reviewed. Practical advice
from Phases 2–4: split work orders across sessions (schema → job → engine → UI) and hand off
through BUILD_STATE between them.

## 8. Lessons from the Phase 3–4 reviews (binding process corrections)

The same failure classes have now been caught twice. Internalize these — the reviewer
checks them every phase:

1. **"Done" means user-reachable.** Phase 4 shipped a working engine with no way for any
   user to trigger it (no entity creation, no enqueue action) and marked the phase
   complete. Before setting AWAITING REVIEW, walk the feature as a logged-in user on the
   running app: entry point → job → result on screen. If a step needs a button that
   doesn't exist, the work order is not done.
2. **Checkbox truthfulness beats optics.** Partial is a fine status; a hedged sentence
   ("can link when an id is available") covering a missing feature is treated as fake
   completeness, same as RF-3-8. Never renumber work orders in the log — BUILD_PLAN's
   numbering is canonical.
3. **Formulas get exact-value tests.** `score > 40` catches nothing; pin the number
   (score 90, threat 27.78) and test the branch boundaries (the 0.58 overlap gate). A
   placeholder input (momentum=100) is acceptable ONLY when disclosed in the data
   (`momentum_source`) and in BUILD_STATE.
4. **Every re-runnable job needs an idempotency story.** Straight inserts duplicate on
   retry/re-run. Supersede, upsert, or dedupe — and say which in the log.
5. **State every filter on shared tables.** `canvas_section_versions` now carries both
   own and competitor rows; every own-canvas reader filters `competitor_id is null`.
   When you add a discriminator column, sweep ALL existing readers the same commit.
6. **Read windows must survive scale.** "Latest 100 account-wide, filter client-side"
   silently breaks with real data volume. Filter server-side, dedupe latest-per-key.
7. **The typed client is the default.** `src/lib/supabase-untyped.ts` is a documented
   escape hatch for TS2589 only — never for convenience, and always with an explicit row
   type + account_id filter.

## 9. Housekeeping notes for the owner (Matt) — not agent tasks

- OPERATOR QUEUE in `docs/BUILD_STATE.md` is the single list (deploys, secrets, keys, the
  one pending live migration, live golden-set run).
- Merged branches can be deleted via GitHub UI whenever convenient.
