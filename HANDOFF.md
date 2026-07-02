# Super BMC — Incoming Agent Handoff

**Last updated:** July 2, 2026 · **Repo:** github.com/mattrob333/super-business-model-canvas
**You are:** the build agent taking over execution from BUILD_PLAN Phase 2 onward.
**Owner:** Matt (mroberson333@gmail.com) — away until ~July 7; a reviewer agent audits each
phase behind you (see Review protocol below).

This file is the front door. Everything you need exists and is current — your job is
execution, not re-planning.

---

## 1. Where the project stands (verified, not aspirational)

| Done | What |
|---|---|
| ✅ | Product vision, architecture decision, 8 specs, phased build plan (all in `docs/`) |
| ✅ | July-2 bug-fix sweep merged: auth guards, edge-function security (JWT + membership checks), scheduled-loop cron wiring, live Dashboard, 2 new edge functions (`manage-provider-key`, `test-mcp-server`) |
| ✅ | **Phase 0** (baseline verification) — APPROVED |
| ✅ | **Phase 1** (data model wave 1) — APPROVED: 12 new tables + column additions + RLS + seeds (10 agent callsigns, 7 cascades, task-class model routes), schema.sql mirror, regenerated types.ts, `scripts/verify-schema.sql` (62 assertions). Migration-tested on scratch Postgres 16: fresh install ✓, incremental ✓, idempotent re-run ✓, mirror structurally identical to migrations ✓ |
| ⬜ | **Phase 2 — the agent worker service. This is your first assignment.** |
| ⬜ | Phases 3–7 per `docs/BUILD_PLAN.md`; Phase 8 held for owner direction |

**Nothing from this repo has been deployed to the live Supabase project or superbmc.com
since July 1.** Deploys are operator tasks (Matt's) — see the OPERATOR QUEUE in
`docs/BUILD_STATE.md`. Never fake or assume a deploy happened.

## 2. Read these, in this order, before writing code

1. `docs/BUILD_PLAN.md` — **Part I ground rules are binding.** Then your phase's work orders.
2. `docs/BUILD_STATE.md` — live status board; you must keep it truthful as you work.
3. `docs/specs/00_OVERVIEW.md` → specs 01–07 (skim all; deep-read the ones your phase cites).
4. For Phase 2 specifically: `docs/specs/07_CLAUDE_AGENT_SDK_INTEGRATION.md` is **required
   pre-reading** — verified SDK API usage. Do not guess SDK APIs; that doc exists because
   guessed APIs are the #1 failure mode for this kind of work.
5. Context (skim): `docs/VISION.md`, `docs/AGENT_RUNTIME_DECISION.md`, `docs/ROADMAP.md`,
   `docs/DEVLOG.md` (bottom-up history including every bug already fixed — don't re-fix).

## 3. Non-negotiable working rules (compressed from BUILD_PLAN Part I)

- **One phase at a time.** Branch `build/phase-<n>-<slug>` from `main`. Small conventional
  commits. PR to `main` only after the phase review is APPROVED.
- **Gates on every commit:** `npx tsc -p tsconfig.app.json --noEmit` clean ·
  `npm run build` green · `npm run lint` **error count ≤ 69** (frozen baseline — do not
  "fix" pre-existing lint, do not add to it). Worker code (Phase 2+): its own tsc + vitest.
- **No fake completeness.** Partial work is reported as partial in BUILD_STATE. The reviewer
  diffs claims against code and runs adversarial checks; honesty has been the team's best
  feature so far — keep the streak.
- **Blockers:** write to BUILD_STATE `BLOCKERS` with a recommended resolution, take the
  conservative path, keep moving on unblocked tasks.
- **Schema changes only via migrations** (+ mirror into `supabase/schema.sql`, + regenerate
  `src/integrations/supabase/types.ts`, + extend `scripts/verify-schema.sql`). RLS on every
  new table.
- **Operator tasks** (deploys, secrets, live-DB changes, hosting) go to the OPERATOR QUEUE —
  exact commands, never executed by you, never marked done by you.
- **Guardrails are law:** every run durable in `agent_runs` · evidence-or-low-confidence on
  canvas writes · outward actions only via `approvals` rows · depth-1 delegation · section
  agents never write outside their section · budgets enforced.

## 4. Review protocol (what happens when you finish a phase)

Mark the phase `AWAITING REVIEW` in BUILD_STATE and stop. A reviewer agent re-runs your
gates from a clean checkout, walks the acceptance criteria against *running behavior*, and
executes the phase's adversarial checklist (BUILD_PLAN per-phase "Reviewer checklist").
Findings arrive as `RF-<phase>-<n>` items in BUILD_STATE: BLOCKER/HIGH block the phase;
MEDIUM due next phase; LOW logged. Precedent: Phase 1's review ran your migrations on a
scratch Postgres and caught a typo'd model ID your own gates couldn't (`claude-opus-4.8`
vs `claude-opus-4-8`) — assume that level of scrutiny.

## 5. Facts and gotchas that will save you hours

- **Model ID conventions:** direct Anthropic API IDs use dashes (`claude-opus-4-8`,
  `claude-sonnet-5`); OpenRouter slugs use dots (`anthropic/claude-haiku-4.5`); xAI is
  `grok-4.3`. Both conventions appear in `model_routes` seeds — they are each correct for
  their provider. Don't "normalize" one into the other.
- **The worker's service-role key bypasses RLS.** Every custom tool handler must filter by
  the job's `account_id` in code (spec 07 §3). This is the announced #1 reviewer check for
  Phase 2.
- **Two runtimes exist on purpose:** `MockAgentRuntime` (no `VITE_HERMES_RUNTIME_ENDPOINT`)
  keeps local dev working without keys; don't delete it until BUILD_PLAN 2.7 says so.
- **Key mappings that must stay in sync:** `src/components/canvas/section-types.ts` ↔
  `SECTION_AGENT_KEYS` in `supabase/functions/agent-run/index.ts` ↔ `agent_profiles.agent_key`
  seeds. Note `key_partners` → `agent_key_partnerships` (historical, intentional).
- **`generated_reports`** is user-scoped with a nullable `account_id` (backfilled) —
  documented judgment call in the Phase-1 log, don't "fix" it in passing.
- **`.hermes/` and `docs/NEXT_STEPS_PLAN.md` are retired** historical records (headers say
  so). Never resume the cron loops described in `.hermes/`.
- **Lint baseline is exactly 69 problems (50 errors / 19 warnings)** — pre-existing
  `no-explicit-any` noise, deliberately frozen.
- **Env:** frontend needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_HERMES_RUNTIME_ENDPOINT` (`.env`, gitignored, see `.env.example`). Server secrets
  live in Supabase; worker (Phase 2) adds `ANTHROPIC_API_KEY` etc. in its own deploy env.
- **Commands:** `npm ci` · `npm run dev` (port 8080) · gates as above ·
  `node scripts/generate-framework-seed.mjs` regenerates framework seeds.

## 6. Repo map (current)

```
docs/
  BUILD_PLAN.md          ← your work orders (Part I rules + Phases 0–8)
  BUILD_STATE.md         ← live tracker you maintain (status, blockers, operator queue, RFs)
  VISION / AGENT_RUNTIME_DECISION / ROADMAP / DEVLOG
  specs/00–07            ← product + technical specs (07 = Agent SDK how-to)
src/                     ← React 18 + Vite + shadcn SPA (gates target this)
supabase/
  schema.sql             ← full mirror, provably identical to migrations
  migrations/            ← incl. Phase-1 wave 20260702100000–100300
  functions/             ← 13 edge functions (Deno)
scripts/
  smoke-test.md          ← 6-flow manual E2E for post-deploy verification
  verify-schema.sql      ← 62 PASS/FAIL schema assertions
worker/                  ← DOES NOT EXIST YET — you create it in Phase 2
.hermes/                 ← retired historical build-loop records
```

## 7. Your first assignment: Phase 2 — Agent worker service

Work orders 2.1–2.10 in `docs/BUILD_PLAN.md`, engine guide in `docs/specs/07`. Summary:
a Node/TypeScript `worker/` running the Claude Agent SDK; polls `agent_jobs` (table exists,
Phase 1); executes `canvas_section_analysis` with byte-compatible `agent_runs` output;
in-process MCP tools (account-scoped!); `workspace_chat` job kind; `agent-run` edge function
gains enqueue mode; `LiveAgentRuntime` rename behind `VITE_RUNTIME_MODE`; guardrail hooks;
tests incl. crash-recovery. Practical advice from Phase 1's post-mortem: **split the work
orders across multiple sessions/dispatches** — 2.1–2.2 (skeleton+queue), 2.3–2.4
(job+tools), 2.5–2.6 (chat+edge), 2.7–2.9 (frontend+guardrails+tests) — a single agent run
burning its budget mid-phase loses context; small handoffs through BUILD_STATE don't.

## 8. Housekeeping notes for the owner (Matt) — not agent tasks

- Delete four merged remote branches via GitHub UI (agent push access can't):
  `build/phase-0-baseline`, `build/phase-1-migrations`, `fix/rf-1-3-opus-model-id`,
  `enterprise-strategy-workspace`. All fully merged into main — zero data loss.
- `edit/edt-6cd24209-…` is an **unmerged** old Lovable edit branch (tip `958b1dd`) — review
  or discard at your leisure; the agents will ignore it.
- The OPERATOR QUEUE in BUILD_STATE has your pending deploy steps (July-2 edge functions +
  secrets + cron migration, then Phase-1 migrations + verify script against live Supabase).
