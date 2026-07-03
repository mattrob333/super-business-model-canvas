# BUILD STATE â€” live tracker

> Maintained by the AI build team. Rules in `BUILD_PLAN.md` Part I. The reviewer audits this
> file against reality â€” keep it truthful and current. Newest log entries first within each
> phase.

## Status board

| Phase | Title | Status | Branch | Last update |
|---|---|---|---|---|
| 0 | Baseline verification & deploy prep | **APPROVED** | `build/phase-0-baseline` (merged, PR #2, `db7cd1f`) | 2026-07-02 |
| 1 | Data model wave 1 | **APPROVED** | `build/phase-1-migrations` (merged, PR #4, `281ce5b`) | 2026-07-02 |
| 2 | Agent worker service | **APPROVED** | `build/phase-2-worker` (merged, PR #8, `b6a8c40`) | 2026-07-02 |
| 3 | Research engine & evidence | **APPROVED** | `build/phase-3-research` (merged with reviewer fixes, PR #13) | 2026-07-03 |
| 4 | Competitor canvases & gap engine | NOT STARTED | â€” | â€” |
| 5 | Section agent workspaces | NOT STARTED | â€” | â€” |
| 6 | War Room & orchestration | NOT STARTED | â€” | â€” |
| 7 | Metrics, KPIs & interpretation | NOT STARTED | â€” | â€” |
| 8 | Hardening & commercial | HELD (await direction) | â€” | â€” |

Statuses: `NOT STARTED` â†’ `IN PROGRESS` â†’ `AWAITING REVIEW` â†’ `APPROVED` (or back to
`IN PROGRESS` on review findings). Only one phase `IN PROGRESS` unless BUILD_PLAN Part IV
concurrency rule is invoked (note it here if so).

## BLOCKERS (open)

_(none)_

<!-- Format:
### BLK-<n>: <title> (raised <date>, phase <n>)
Context: â€¦
Recommended resolution: â€¦
Status: OPEN | RESOLVED (<how>)
-->

## OPERATOR QUEUE (needs Matt)

- **From July 2 session (pre-Phase-0):** deploy updated edge functions; set
  `CREDENTIALS_ENCRYPTION_KEY`; Vault service key + run cron migration; set `VITE_*` build
  vars. Exact steps: `DEVLOG.md` â†’ "Deployment checklist".
- **From Phase 0 (this pass):** same deploy is still outstanding â€” nothing new to deploy yet
  since Phase 0 made no code changes, only verified/documented. When you do run the July-2
  deploy, use `scripts/smoke-test.md` (new, this phase) to confirm all 6 flows work afterward.

- **Housekeeping (July 2, post-Phase-1):** delete four merged remote branches via the GitHub
  UI â€” `build/phase-0-baseline`, `build/phase-1-migrations`, `fix/rf-1-3-opus-model-id`,
  `enterprise-strategy-workspace` (all fully merged into main; agent push access cannot
  delete branches). The unmerged `edit/edt-6cd24209-â€¦` Lovable leftover (tip `958b1dd`) is
  yours to review or discard.
- **Completed 2026-07-02 via Supabase MCP:** Phase-1 schema/seed migrations and Phase-2.2
  queue-locking migration were applied to live project `mehhuxzamnpxnkbrslls`; verification
  checks passed for tables, columns, enums, RLS/policies, seed sanity, queue RPC functions, and
  queue RPC browser-role restrictions. A follow-up live migration
  `restrict_agent_job_rpc_execute` was added after Supabase security advisors flagged the worker
  queue RPCs as publicly executable by default; `anon`/`authenticated` execution is now revoked
  and `service_role` execution granted.
- **From Phase 2.5-2.6:** deploy updated edge functions after review approval:
  `supabase functions deploy agent-run` and `supabase functions deploy workspace-chat`. Set
  staging/frontend env `VITE_RUNTIME_MODE=enqueue` only when the worker service is deployed and
  has `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and any optional research keys. Keep
  `VITE_RUNTIME_MODE=inline` (or omit it with the legacy endpoint configured) for rollback.
- **From Phase 2.10:** deploy the worker service only after reviewer approval. Build context is
  `worker/` and the container command is `node dist/index.js` from `worker/Dockerfile`. Required
  runtime env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`. Optional env:
  `WORKER_ID`, `POLL_INTERVAL_MS`, `JOB_HEARTBEAT_STALE_SECONDS`, `JOB_MAX_ATTEMPTS`,
  `SECTION_ANALYSIS_MAX_TURNS`, `SECTION_ANALYSIS_TASK_BUDGET_TOKENS`,
  `SECTION_ANALYSIS_MAX_BUDGET_USD`, `WORKSPACE_CHAT_MAX_TURNS`,
  `WORKSPACE_CHAT_TASK_BUDGET_TOKENS`, `WORKSPACE_CHAT_MAX_BUDGET_USD`, `XAI_API_KEY`,
  `FIRECRAWL_API_KEY`, `FRED_API_KEY`, `GOOGLE_TRENDS_API_KEY`, `GITHUB_TOKEN`, `OPENROUTER_API_KEY`. Example Fly path: from repo root run `fly launch --dockerfile
  worker/Dockerfile --name super-bmc-worker --no-deploy`, set secrets with `fly secrets set
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=...`, then `fly deploy
  --dockerfile worker/Dockerfile`. After the worker is healthy, deploy the edge functions above
  and only then switch frontend/staging `VITE_RUNTIME_MODE=enqueue`.

- **From Phase 3 reviewer pass (2026-07-03):**
  1. Apply migration `20260703090000_staleness_loop_provisioning.sql` to live project
     `mehhuxzamnpxnkbrslls` (build agent can do this via Supabase MCP, same as prior phases).
  2. Redeploy the two edge functions updated in this pass when doing the standing deploy:
     `supabase functions deploy agent-run` and `supabase functions deploy scheduled-loop-tick`.
  3. After `ANTHROPIC_API_KEY` exists in the worker env, run the live verifier golden set once
     and record the score here: from `worker/`:
     `GOLDEN_LIVE=1 ANTHROPIC_API_KEY=sk-... npx vitest run verifier-golden` (must be >= 9/10).

<!-- Agents append: exact commands/clicks, why needed, which acceptance criterion waits on it. -->

## REVIEW FINDINGS

### Phase 2 - RF-2-4 (MEDIUM) - FIXED pending re-review (2026-07-02)
**Problem:** Reviewer found model-route resolution for section analysis was nondeterministic:
the profile's legacy `standard` route_key and the `section_analysis` task_class row could tie
under the old query ordering.
**Fix:** Worker route selection now ranks candidates explicitly:
account route_key -> account task_class -> global route_key -> global task_class. Unit tests pin
the precedence and preserve the legacy route_key fallback.

### Phase 2 - RF-2-3 (HIGH) - FIXED pending re-review (2026-07-02)
**Problem:** If a job handler threw after marking the linked `agent_runs` row `running`, the job
retry/dead-letter path updated `agent_jobs` but left `agent_runs` stuck `running`, causing the UI
to poll forever.
**Fix:** The worker dispatcher now catches job-handler errors, marks the linked run `failed` with
`error`, `summary`, and `completed_at` under `.eq("account_id", job.account_id)`, then rethrows so
the queue retry/dead-letter path still runs. Unit coverage pins the failed-run update.

### Phase 2 - RF-2-2 (HIGH) - FIXED pending re-review (2026-07-02)
**Problem:** Reviewer found `ClaudeAgentRunner` treated every SDK result message as success,
masking `error_max_budget_usd`, `error_max_turns`, and `error_during_execution` as later JSON
parse failures.
**Fix:** `runner.ts` now throws immediately when the result subtype is not `success`, preserving
the SDK subtype in the error message for retry/dead-letter diagnosis.

### Phase 2 â€” RF-2-1 (HIGH) â€” FIXED pending re-review (2026-07-02)
**Problem:** Reviewer exercised the queue SQL on scratch Postgres and found that a stale
`running` job with `attempts >= max_attempts` is skipped forever by `claim_next_agent_job`
because the reclaim branch only allowed `attempts < max_attempts`; `fail_agent_job` also cannot
be called after the owning worker has crashed. This creates an orphaned `running` row and
violates the crash-recovery acceptance criterion.
**Fix:** Added migration `20260702112000_reap_stale_agent_jobs.sql` and mirrored the change into
`20260702110000_agent_job_queue_locking.sql` + `schema.sql`: `claim_next_agent_job` now first
reaps stale final-attempt `running` jobs to `failed_permanent` before selecting the next claimable
job. `scripts/verify-schema.sql` now asserts the reaper branch is present. Worker tests include a
boundary test documenting that claim is where stale final-attempt jobs are reaped.
**Note:** Reviewer requested a SQL-level test when work order 2.9's test suite is built; still
tracked for 2.9.

### Phase 1 â€” RF-1-3 (MEDIUM) â€” RESOLVED by reviewer (2026-07-02)
**Problem:** The RF-1-2 patch introduced a typo'd model ID on the premium route:
`strategy_synthesis` seeded as provider `anthropic` + `claude-opus-4.8` (dots). Direct
Anthropic API IDs use dashes (`claude-opus-4-8`); the dotted form 404s, which would have
failed Atlas's first run in Phase 2. (OpenRouter rows with dotted slugs are correct â€” that's
OpenRouter's convention; only the direct-anthropic row was wrong.)
**Fix:** Reviewer patched seed migration + schema.sql mirror while the team was rate-limited.
Gates re-verified.
**Note:** Phase 1 close-out (status-board flip + operator-queue entry) was interrupted by the
rate limit after PR #4 merged; reviewer completed the bookkeeping in the same commit.

### Phase 1 â€” RF-1-2 (MEDIUM) â€” RESOLVED (2026-07-02)
**Problem:** `model_routes` seed rows in `20260702100300_seed_phase1.sql` referenced
deprecated/retired model IDs (`claude-opus-4-1`, `claude-3-5-haiku`, `gemini-flash-1.5`,
`grok-4`, `claude-sonnet-4-5`) that would 404 on first live use.
**Fix:** Replaced with current slugs (`claude-opus-4.8`, `claude-haiku-4.5`,
`google/gemini-2.5-flash-lite`, `grok-4.3`, `claude-sonnet-5`), cross-checked against the live
OpenRouter catalog and this repo's own existing model references. Patched in both the seed
migration and the `schema.sql` mirror. Gates re-verified clean.
**Acceptance:** Phase 1 approved by reviewer contingent on this fix landing â€” considered
RESOLVED per the reviewer's own sign-off criteria ("my sign-off stands once the patch lands").

### Phase 0 â€” APPROVED (2026-07-02)
Reviewer independently re-ran all gates on `build/phase-0-baseline` (tsc clean, build green,
lint 69 â€” matches logged claims), confirmed the diff is docs-only (127 lines, zero code
changes), and adversarially spot-checked 3 of the 12 audited functions (`bmc-chat`,
`generate-framework-report`, `agent-run`) against their callers â€” audit holds, no drift.
Smoke-test doc quality noted as good (6 flows, fail signals cross-referenced to DEVLOG fixes,
honest about not running against a live deployment â€” no fake completeness). One LOW note:
acceptance criterion 0.4 was satisfied via cross-reference to DEVLOG's existing deploy
checklist rather than duplicating it â€” reviewer accepted this as defensible, no action needed.
Merged to `main` via PR #2 (`db7cd1f`).

<!-- Reviewer appends RF-<phase>-<n> items; team marks them fixed with commit SHA. -->

---

## Side tasks

### Public landing page rebuild â€” AWAITING REVIEW (2026-07-02)

Branch: `feat/landing-page` (cut from `main`).

- Rebuilt `/` in `src/pages/Landing.tsx` as a full SaaS landing page using the existing
  shadcn/Tailwind design system: sticky nav, hero CTA, pure JSX/CSS miniature 9-block Business
  Model Canvas, How it works, Agent Team, feature grid, audience cards, FAQ accordion, final CTA,
  and footer.
- Kept the early-access lead capture path: CTA validates email, inserts into `leads`, treats
  duplicate-email `23505` as a graceful continuation, then routes to
  `/auth?mode=signup&email=<prefill>`.
- Added the requested Auth query-param support in `src/pages/Auth.tsx`: `mode=signup` opens the
  sign-up tab and `email=` prefills the sign-up email field.
- Added runtime page title and meta description from the landing page.
- Scope intentionally limited to `src/pages/Landing.tsx`, `src/pages/Auth.tsx`, and this tracker
  entry. No fabricated testimonials, customer logos, user counts, revenue metrics, or pricing
  tiers added.
- Design polish pass applied after review feedback: landing page pinned to light enterprise
  theme, hero CTA fused into one bordered control, miniature canvas restyled as a light app
  window, Atlas promoted to a feature card, feature/agent accents aligned to the roster, trust
  band added, and quantitative mock metrics removed.
- Alignment/association follow-up applied: shared landing agent accent constants added, canvas
  mock tiles now use a consistent fixed-height title/agent-chip header with pinned status dots,
  and every agent team card shows its owned BMC section in a matching accent pill.

## Phase logs

### Phase 0 â€” Baseline verification & deploy prep
Tasks: 0.1 â˜‘ Â· 0.2 â˜‘ Â· 0.3 â˜‘ Â· 0.4 â˜‘ Â· **APPROVED, merged to main (PR #2, `db7cd1f`)**

**2026-07-02 â€” Phase 0 complete, awaiting review.**

- **0.1 Fresh-clone verification** (branch `build/phase-0-baseline`, cut from `main` @ 58ba3ea):
  - `rm -rf node_modules dist && npm ci` â€” 522 packages installed clean (npm audit flags 22
    pre-existing vulnerabilities in deps, out of scope for this phase â€” not introduced by us).
  - `npx tsc -p tsconfig.app.json --noEmit` â€” **clean, exit 0**.
  - `npm run build` â€” **green**, 7.0s. Output unchanged in shape from pre-Phase-0 (same vendor
    chunking, `html2pdf` still the one >600kB chunk, pre-existing and documented).
  - `npm run lint` â€” **69 problems (50 errors, 19 warnings)** â€” exactly matches the frozen
    baseline in BUILD_PLAN.md Part I rule 3. No new lint errors introduced (no code was
    changed in this phase).
- **0.2 Static audit of all 12 edge functions vs their callers** â€” checked every function's
  request-body interface/shape against its caller's `fetch`/`functions.invoke` payload:
  `agent-run` (hermes-runtime.ts + ModelRoutingPanel + HermesRuntimePanel + useCanvasSectionRun),
  `analyze-company`, `bmc-chat`, `business-overview-chat`, `strategy-coach-chat`,
  `competitor-chat`, `research-competitors`, `generate-framework-report`,
  `recommend-frameworks` (deployed, confirmed still unused by any caller â€” matches DEVLOG.md's
  known-issue #`recommend-frameworks is deployed but never called`, not a new finding),
  `manage-provider-key` (ProviderCredentialsManager â€” `action`/body fields match),
  `scheduled-loop-tick` (ScheduledLoopsManager â€” `loopId` matches; internal self-invoke for
  per-loop dispatch also matches), `test-mcp-server` (McpConnectionsManager â€” `serverId`/
  `accountId` match).
  **Finding: no request/response shape drift detected in any of the 12 functions.** The July-2
  fixes (DEVLOG.md items 1â€“19) already resolved the drift that existed before (agent-key
  mismatch, research-competitors param mismatch, etc.) â€” this audit confirms those fixes are
  actually in the code on `main`, not just claimed in the devlog.
- **0.3 `scripts/smoke-test.md`** â€” created: 6 flows (sign up â†’ analyze company â†’ section chat
  â†’ Canvas Analyze â†’ playbook report â†’ dashboard live data), each with expected behavior and
  fail signals cross-referenced to the specific DEVLOG.md fix that addresses the known failure
  mode. Not run end-to-end against a live deployment in this phase (no live Supabase project
  session available) â€” this is a script for the operator/reviewer to execute post-deploy, per
  work order 0.3's own framing ("a click-by-click manual E2E script the operator can run").
- **0.4 Operator queue** â€” the exact deploy commands, secrets, and build vars were already
  fully specified in `DEVLOG.md` â†’ "Deployment checklist" from the July-2 session (functions
  list, `CREDENTIALS_ENCRYPTION_KEY` generation command, Vault + migration steps, `VITE_*`
  vars). Cross-referenced into `BUILD_STATE.md`'s OPERATOR QUEUE above rather than duplicated,
  per BUILD_PLAN.md's "no fake completeness" rule â€” the checklist already exists and duplicating
  it verbatim would just create a second copy to drift out of sync.

**Acceptance criteria status:**
- [x] BUILD_STATE records clean gate runs with output snippets (above)
- [x] Smoke-test doc exists and covers all 6 flows (`scripts/smoke-test.md`)
- [x] Operator queue lists every deploy step with exact commands (cross-referenced to
  DEVLOG.md's existing checklist â€” commands not duplicated here to avoid drift)

**Note for reviewer:** Phase 0's own rules (Part I rule 1) require the reviewer to mark this
`APPROVED` before Phase 1 begins. No code was touched in this phase â€” only verification and
documentation â€” so there is nothing to regress. Ready for review.

### Phase 1 â€” Data model wave 1
Tasks: 1.1 â˜‘ Â· 1.2 â˜‘ Â· 1.3 â˜‘ Â· 1.4 â˜‘ Â· 1.5 â˜‘ Â· 1.6 â˜‘ Â· **AWAITING REVIEW**

**2026-07-02 â€” Phase 1 complete on branch `build/phase-1-migrations` (cut from `main` @ `00e026b`).**

Work was split: a subagent produced the four migration files + the `schema.sql` mirror (fully
committed-quality SQL, but ran out of budget before finishing `types.ts` and committing); I
(the primary session) completed the remaining `types.ts` patches, wrote `verify-schema.sql`,
re-ran all gates, and made the actual commits. Full honesty per BUILD_PLAN rule 6: nothing here
was applied to a live Postgres instance â€” no Supabase CLI/Docker available in this environment.
Verification is structural (careful read-through + `tsc`/`build`/`lint` against the hand-authored
`types.ts`), not a real migration run. See the ordering-proof comment block at the top of
`20260702100000_workspace_orchestration_tables.sql` for the dependency-order reasoning.

**1.1 â€” New tables** (`supabase/migrations/20260702100000_workspace_orchestration_tables.sql`):
all 12 tables from spec 04 Â§5 â€” `workspace_threads`, `workspace_messages`, `context_sources`,
`insights`, `agenda_items`, `approvals`, `agent_jobs`, `cascades`, `cascade_steps`,
`cascade_runs`, `metric_snapshots`, `agent_profile_revisions` â€” created in true dependency order
(differs from the work order's literal listing order, which contains a forward reference:
`agent_jobs.cascade_run_id` â†’ `cascade_runs`, listed after `agent_jobs` in the prose; the
migration file creates `cascade_runs` before `agent_jobs` instead, documented in the file's
header comment). 7 new enums (`workspace_message_kind`, `context_source_type`,
`insight_severity`, `agenda_item_status`, `approval_kind`, `approval_status`,
`cascade_run_status`), indexes on every FK + common query path, `updated_at` triggers on
`agenda_items`/`cascades`.

**1.2 â€” Column additions** (`20260702100100_column_additions.sql`): `agent_profiles`
(+`behavior` jsonb, +`avatar` jsonb) Â· `agent_skills` (+`orchestrator_can_trigger`,
+`action_kind`) Â· `scheduled_loops` (+`action_key`, +`created_by_agent`) Â· `model_routes`
(+`task_class`, +`max_tokens_in/out`, +`cost_per_1k_in/out`, +`eval_score`, +`updated_by`) Â·
`generated_reports` (+`account_id`, +`source_cascade_run_id`, both nullable) with a documented
backfill: `account_id` populated via each row's `user_id` â†’ earliest-created
`account_members.account_id` for that user, raising a NOTICE (not failing) for any
unbackfillable row. Real limitation of this heuristic documented inline (a user's first account
isn't necessarily the account the report was generated for â€” no better signal exists on
`generated_reports` today).

**1.3 â€” RLS** (`20260702100200_rls_new_tables.sql`): standard account-scoped CRUD loop extended
to `workspace_threads`, `context_sources`, `agent_jobs`, `metric_snapshots`, `cascade_runs`.
Exceptions per BUILD_PLAN 1.3: `insights`/`agenda_items` are SELECT-only for `authenticated`
(worker writes via service role, bypassing RLS); `approvals` is SELECT+UPDATE only (no
INSERT/DELETE for `authenticated`). Child-table policies with parent-join subqueries for
`cascade_steps` (via `cascades.account_id`, nullable for templates), `workspace_messages` (via
`workspace_threads.account_id`), `agent_profile_revisions` (via `agent_profiles.account_id`,
nullable for templates). `cascades` template rows (`account_id IS NULL`) SELECT-able by any
authenticated user, matching the existing `agent_profiles` template pattern.

**1.4 â€” Seed** (`20260702100300_seed_phase1.sql`): all 10 template `agent_profiles` renamed to
`"<Callsign> â€” <Role title>"` with `avatar: {icon, accent}` set per spec 01's naming table. All
7 template cascades (Full Recon, Competitor Delta Sweep, Board Pack, Pricing War Response, Unit
Economics Duet, Launch Readiness, Cost-Down Sprint) seeded with `cascade_steps` â€” DAG structure
inferred from spec 04 Â§3 prose, documented assumptions inline (system/data-layer steps like
"research refresh" and "gap engine" assigned `agent_key: 'orchestrator'` since they aren't one
of the ten named agents; step_keys invented from the prose since the spec doesn't give literal
keys; the "3 at a time" concurrency note is a runtime parameter, not stored on `cascade_steps`).
9 `model_routes` rows (one per task_class from spec 06 Â§1), placeholder-but-plausible model
slugs explicitly flagged as needing Phase 7's model-scout sweep to keep current. All inserts
idempotent (`on conflict do nothing`, matching the existing seed migration's style; the
`model_routes` conflict target `(route_key) where account_id is null` uses the pre-existing
partial unique index â€” verified it exists in `schema.sql` line 507).

**1.5 â€” Mirror**: `supabase/schema.sql` updated with a new section (renumbered so the old
"DROP DEAD / LEGACY TABLES" section is now last) containing all of the above, matching the
file's existing section-banner style. `src/integrations/supabase/types.ts` hand-authored: all 12
new table `Row`/`Insert`/`Update` blocks, all 7 new enums added to both the `Enums` type block
and the `Constants.public.Enums` runtime object, and the 5 existing-table patches from 1.2
applied to their respective `Row`/`Insert`/`Update` blocks (`agent_profiles`, `agent_skills`,
`scheduled_loops`, `generated_reports`, `model_routes`).

**1.6 â€” `scripts/verify-schema.sql`**: SQL-editor-runnable script with ~40 PASS/FAIL assertions
covering table existence, new column existence, RLS-enabled + at-least-one-policy per new table,
enum type existence, and seed-data sanity checks (10 profiles with avatars, 7 template cascades,
cascade_steps rows present, 9 distinct task_class rows in model_routes). Not run against a live
DB in this phase (no Supabase project available) â€” ready for the operator/reviewer to run
post-deploy.

**Gate results (re-run clean, final):**
```
npx tsc -p tsconfig.app.json --noEmit   â†’ exit 0, no output (clean)
npm run build                            â†’ âœ“ built in 6.45s (green)
npm run lint                             â†’ 69 problems (50 errors, 19 warnings) â€” exact frozen baseline
```

**BLOCKERS / judgment calls (documented inline in the migrations, logged here per BUILD_PLAN
rule 5):**
- `agent_jobs.status` and `model_routes.updated_by` / `agent_skills.action_kind`: the work order
  brackets explicit value-sets for most new enum-like columns (e.g. `insights.severity`,
  `approvals.status`) but leaves these three as bare column names with no bracketed values.
  Conservative resolution: kept as free `text` with a documented expected-value-set in a column
  comment, rather than inventing an enum that Phase 2 (the worker, which owns these state
  machines) might immediately need to alter. Not treated as a hard BLOCKER since a conservative
  default was available and applied.
- `generated_reports` backfill ambiguity (a user could belong to multiple accounts): resolved by
  taking the earliest-created `account_members` row per user, documented as a best-effort
  heuristic with its real limitation stated inline (no stronger signal exists on the row).

**No other BLOCKERS.** Ready for review â€” reviewer should expect the "meatier" schema audit
flagged after Phase 0 (migrations read against a scratch DB if available, RLS coverage check,
seed-vs-spec diff).

**2026-07-02 â€” RF-1-2 fixed (post-review patch).** Reviewer's scratch-Postgres audit approved
Phase 1 overall (34-table fresh install clean, 4-migration incremental path clean + idempotent
on re-apply, verify-schema.sql 62/62 PASS, RLS/seed correctness all confirmed) with one MEDIUM
finding: `model_routes` seed rows referenced deprecated/retired model IDs (`claude-opus-4-1`,
`claude-3-5-haiku`, `gemini-flash-1.5`, `grok-4`, `claude-sonnet-4-5`) that would 404 on first
live use. Fixed in `20260702100300_seed_phase1.sql` + mirrored in `schema.sql`: `strategy_synthesis`
â†’ `claude-opus-4.8`, `section_analysis`/`research_verify`/`draft_document` â†’ `claude-sonnet-5`,
`summarize` â†’ `claude-haiku-4.5` (OpenRouter), `extract` â†’ `google/gemini-2.5-flash-lite`,
`live_search` â†’ `grok-4.3`. Cross-checked against the live OpenRouter catalog and this repo's
own existing model references (`_shared/xai-models.ts` already uses `grok-4.3`;
`recommend-frameworks/index.ts` already uses `google/gemini-2.5-flash`) so the fix stays
consistent with the rest of the codebase, not just internally consistent. Pricing columns
updated to match each model's current catalog price. Gates re-run clean: tsc clean, build
green, lint 69 (unchanged). RF-1-2 marked RESOLVED.

### Phase 2 â€” Agent worker service
Tasks: 2.1 [x] Â· 2.2 [x] Â· 2.3 [x] Â· 2.4 [x] Â· 2.5 [x] Â· 2.6 [x] Â· 2.7 [x] Â· 2.8 [x] Â· 2.9 [x] Â· 2.10 [x] Â· **APPROVED, merged to main (PR #8, `b6a8c40`)**

**2026-07-02 - Phase 2 approved and merged.**

- Reviewer approved Phase 2 after running the full suite, including SQL integration tests against
  live Postgres: 14/14 passed. Merged PR #8 (`build/phase-2-worker` -> `main`) at merge commit
  `b6a8c40`.

**2026-07-02 â€” Phase 2 started on branch `build/phase-2-worker`; work orders 2.1â€“2.2 complete.**

- **Orientation completed before worker code:** read `HANDOFF.md`, `docs/BUILD_PLAN.md` Part I
  + Phase 2 work orders, `docs/BUILD_STATE.md`, required SDK guide
  `docs/specs/07_CLAUDE_AGENT_SDK_INTEGRATION.md`, and skimmed specs 00â€“06 for product/runtime
  context. Implementation intentionally stopped at the first natural seam (2.1â€“2.2).
- **2.1 Worker package skeleton:** created `worker/` as an independent Node/TypeScript package
  with `@anthropic-ai/claude-agent-sdk@0.3.198`, Supabase service-role client wiring, env parsing,
  Dockerfile, `.env.example`, README, strict `tsconfig`, ESLint, and Vitest harness. Zod is v4 in
  the worker package because the Agent SDK peers on `^4.0.0`; the root app remains unchanged.
- **2.2 Job loop:** added a testable queue loop with claim/heartbeat/complete/fail repository
  boundary. Added migration `20260702110000_agent_job_queue_locking.sql` with queue metadata
  (`claimed_by`, `locked_at`, `heartbeat_at`, `run_after`, `max_attempts`, `last_error`), claim
  indexes, `claim_next_agent_job(...)` using `FOR UPDATE SKIP LOCKED`, and `fail_agent_job(...)`
  for retry backoff vs `failed_permanent`. Mirrored into `supabase/schema.sql`, updated
  `src/integrations/supabase/types.ts`, and extended `scripts/verify-schema.sql` checks.
- **Honest scope note:** workspace chat, edge enqueue mode, frontend runtime switch, guardrail
  hooks, and the broader Phase 2 SQL-level/crash-recovery test suite remain 2.5â€“2.10.

**Gate results for this slice:**
```
cd worker && npm run typecheck  â†’ exit 0
cd worker && npm test           â†’ 5 tests passed
cd worker && npm run build      â†’ exit 0
cd worker && npm run lint       â†’ exit 0
npx tsc -p tsconfig.app.json --noEmit â†’ exit 0
npm run build                   â†’ green
npm run lint                    â†’ 69 problems (50 errors, 19 warnings), frozen baseline unchanged
```

**Notes / constraints carried forward:**
- Live Supabase project `mehhuxzamnpxnkbrslls` now has recorded MCP-applied migrations:
  `workspace_orchestration_tables`, `column_additions`, `rls_new_tables`, `seed_phase1`,
  `agent_job_queue_locking`, `restrict_agent_job_rpc_execute`, and `reap_stale_agent_jobs`. The
  scheduled-loop cron/Vault migration remains an operator/deploy task because it requires the live
  service-role key secret.
- Supabase advisors still report pre-existing/broader warnings not introduced by Phase 2.2:
  mutable `set_updated_at` search path; public/authenticated execution on older SECURITY DEFINER
  functions (`handle_new_user`, `has_role`, `is_account_member`, `provision_account_defaults`);
  permissive insert policies on `accounts`/`leads`; leaked-password protection disabled; plus
  expected unused-index/unindexed-FK noise on fresh/empty tables. The new queue RPC public-execute
  warnings were resolved.
- The worker package install reports 0 vulnerabilities. npm warns that local Node `22.12.0` is
  below a transitive ESLint engine preference (`^22.13.0`), but worker lint still exits 0.

**2026-07-02 â€” Reviewer feedback RF-2-1 fixed and work orders 2.3â€“2.4 complete.**

- **RF-2-1 fix:** added migration `20260702112000_reap_stale_agent_jobs.sql` and mirrored the
  change into `20260702110000_agent_job_queue_locking.sql` plus `supabase/schema.sql`.
  `claim_next_agent_job(...)` now first reaps stale `running` jobs whose attempts have reached
  `max_attempts` by moving them to `failed_permanent`, preventing final-attempt crash zombies.
  `scripts/verify-schema.sql` now asserts that the function body contains this reaper path.
- **Live DB note:** user explicitly asked Codex to apply pending Supabase migrations; the reaper
  migration was applied to live project `mehhuxzamnpxnkbrslls` and verified there. This remains
  documented as sanctioned operator-scope work, not a normal worker responsibility.
- **2.3 `canvas_section_analysis`:** added `CanvasSectionAnalysisHandler` and dispatcher wiring.
  The handler loads the account/default agent profile, resolves the `section_analysis` model route,
  builds SDK prompts, runs the Claude Agent SDK with `maxTurns`, `maxBudgetUsd`,
  `settingSources: []`, `persistSession: false`, and BMC-only tool allowlist, parses the legacy
  `items`/`notes`/`confidence`/`summary` JSON shape, and updates `agent_runs` with output,
  summary, tokens, provider/model, and estimated cost under `.eq("account_id", job.account_id)`.
- **2.4 core MCP tools:** added in-process SDK MCP server `bmc` with `read_canvas`,
  `write_section_items` (proposal mode + own-section/evidence checks), `log_evidence`,
  `open_gap`, `post_insight`, `read_competitor_canvas` stub, `search_web` graceful degrade, and
  `firecrawl_scrape` graceful degrade. Every Supabase-backed handler scopes reads/writes by
  `ctx.accountId`; no tool accepts `account_id` from the model.
- **Tests added:** worker tests now cover queue-loop behavior, RF-2-1 repository boundary behavior,
  and the section-analysis handler's legacy-output/update contract. The RF-2-1 SQL-level
  regression test remains intentionally tracked for work order 2.9.

**Gate results for this slice:**
```
cd worker && npm run typecheck  â†’ exit 0
cd worker && npm test           â†’ 5 tests passed
cd worker && npm run build      â†’ exit 0
cd worker && npm run lint       â†’ exit 0
```

**2026-07-02 - Reviewer findings RF-2-2/RF-2-3/RF-2-4 fixed; work orders 2.5-2.6 complete.**

- **RF-2-2:** `ClaudeAgentRunner` now treats non-`success` SDK result subtypes as failures and
  throws with the subtype in the message, preserving causes such as `error_max_budget_usd`.
- **RF-2-3:** worker dispatch now marks linked `agent_runs` rows `failed` with `error`,
  `summary`, and `completed_at` when a job handler throws, while still rethrowing for queue retry
  and dead-letter behavior.
- **RF-2-4:** model-route selection is deterministic via explicit precedence:
  account route_key -> account task_class -> global route_key -> global task_class. Tests pin the
  legacy `standard` route tie.
- **2.5 `workspace_chat`:** added worker support for `workspace_chat` jobs. The handler loads the
  account-scoped thread/profile/messages, runs the Claude Agent SDK with BMC tools and proposal
  mode, writes the assistant reply to `workspace_messages`, and completes the linked run with
  output/tokens/cost under `.eq("account_id", job.account_id)`.
- **2.6 enqueue mode:** `agent-run` now accepts `mode: "enqueue"` to create a pending
  `agent_runs` row and queued `agent_jobs` row, while the existing inline path remains the default
  rollback path. Added `workspace-chat` edge function for auth -> user message insert -> queued
  chat job. Frontend runtime mode now supports `VITE_RUNTIME_MODE=enqueue|inline|mock`.
- **Honest scope note:** 2.7 frontend polling/runtime polish, 2.8 guardrail hooks, 2.9 SQL-level
  crash-recovery tests, and 2.10 Docker/docs/final review prep remain open.

**Gate results for this slice:**
```
cd worker && npm run typecheck  -> exit 0
cd worker && npm test           -> 7 tests passed
cd worker && npm run build      -> exit 0
cd worker && npm run lint       -> exit 0
npx tsc -p tsconfig.app.json --noEmit -> exit 0
npm run build                   -> green
npm run lint                    -> 69 problems (50 errors, 19 warnings), frozen baseline unchanged
```

**2026-07-02 - Work order 2.7 runtime rename/config transition complete.**

- Renamed the frontend live runtime implementation from `hermes-runtime.ts` /
  `HermesAgentRuntime` to `live-runtime.ts` / `LiveAgentRuntime`.
- Renamed the Settings panel from `HermesRuntimePanel` to `AgentRuntimePanel`, changed the
  Settings tab id from `hermes` to `runtime`, and changed the visible label to "Agent Runtime".
- Added `VITE_AGENT_RUNTIME_ENDPOINT` and `VITE_AGENT_RUNTIME_API_KEY` as the primary frontend
  env vars, with the old `VITE_HERMES_RUNTIME_*` names retained as deprecated fallbacks.
- Updated `.env.example`, README active setup/env docs, and active code comments. Historical
  Hermes decision docs were intentionally left untouched.

**Gate results for this slice:**
```
npx tsc -p tsconfig.app.json --noEmit -> exit 0
npm run build                   -> green
npm run lint                    -> 69 problems (50 errors, 19 warnings), within frozen <=69 baseline
```

**2026-07-02 - Work order 2.8 guardrail hooks complete.**

- Added Claude Agent SDK `PreToolUse` hooks in the worker runner path. Every BMC tool call is
  audit-logged with account id, run id, job kind, tool name, tool-use id, and a redacted/truncated
  args summary; secret-like keys are replaced with `[REDACTED]`.
- Added a hook-level evidence gate for `mcp__bmc__write_section_items`: any item with
  `confidence >= 0.7` and no `evidence_ids` is denied before the MCP tool executes. The existing
  in-tool validation remains in place as defense in depth.
- Added per-task runtime limits from worker config: section analysis and workspace chat now have
  independent `maxTurns`, SDK `taskBudget` token ceilings, and optional max USD overrides. Defaults
  are documented in `worker/.env.example` and `worker/README.md`.
- Tests cover the hook denial path, allowed evidence path, audit redaction, and propagation of
  section-analysis limits/hooks into the runner request.

**Gate results for this slice:**
```
cd worker && npm run typecheck  -> exit 0
cd worker && npm test           -> 10 tests passed
cd worker && npm run build      -> exit 0
cd worker && npm run lint       -> exit 0
npx tsc -p tsconfig.app.json --noEmit -> exit 0
npm run build                   -> green
npm run lint                    -> 69 problems (50 errors, 19 warnings), within frozen <=69 baseline
```

**2026-07-02 - Work order 2.9 test hardening complete.**

- Added BMC MCP tool tests that exercise every registered tool handler through the SDK server's
  in-process registry against a fake account-scoped schema. The tests assert account filters and
  account-scoped inserts for Supabase-backed tools, plus graceful degraded responses for Phase-3
  research stubs.
- Added an explicit in-tool guardrail test for own-section writes and high-confidence writes
  without evidence, complementing the 2.8 hook-level guardrail test.
- Added a legacy-output fixture test for the exact `items`/`notes`/`confidence`/`summary` shape
  expected by today's inline `agent-run` behavior.
- Added an optional SQL-level crash-recovery integration test. When `WORKER_TEST_DATABASE_URL`
  points at a scratch Postgres with the project schema applied, it inserts a stale final-attempt
  `running` job, calls `claim_next_agent_job`, and asserts the job is reaped to
  `failed_permanent` rather than orphaned. The test is skipped in local runs without that env var.

**Gate results for this slice:**
```
cd worker && npm run typecheck  -> exit 0
cd worker && npm test           -> 13 passed, 1 skipped (SQL integration needs WORKER_TEST_DATABASE_URL)
cd worker && npm run build      -> exit 0
cd worker && npm run lint       -> exit 0
npx tsc -p tsconfig.app.json --noEmit -> exit 0
npm run build                   -> green
npm run lint                    -> 69 problems (50 errors, 19 warnings), within frozen <=69 baseline
```

**2026-07-02 - Work order 2.10 complete; Phase 2 awaiting review.**

- Added exact worker deployment steps to the OPERATOR QUEUE. No deploys, secrets, or live
  database changes were executed in this slice.
- Phase 2 is marked `AWAITING REVIEW`; reviewer should audit the branch, run the optional SQL
  integration test with `WORKER_TEST_DATABASE_URL` against a scratch schema, and verify the queued
  runtime path before any staging switch to `VITE_RUNTIME_MODE=enqueue`.

**Final gate results for Phase 2 branch:**
```
cd worker && npm run typecheck  -> exit 0
cd worker && npm test           -> 13 passed, 1 skipped (SQL integration needs WORKER_TEST_DATABASE_URL)
cd worker && npm run build      -> exit 0
cd worker && npm run lint       -> exit 0
npx tsc -p tsconfig.app.json --noEmit -> exit 0
npm run build                   -> green
npm run lint                    -> 69 problems (50 errors, 19 warnings), within frozen <=69 baseline
```

**Side tasks merged after Phase 2 approval.**

- **Landing page branch:** rebased `feat/landing-page` on updated `main`, re-ran gates, and
  merged PR #7 at merge commit `3c10b26`. Gate results before merge: `npx tsc -p
  tsconfig.app.json --noEmit` exit 0; `npm run build` green; `npm run lint` 68 problems, within
  frozen <=69 baseline; worker typecheck/tests/lint still green.
- **App light-mode polish:** merged PR #9 (`feat/app-light-polish` -> `main`) at merge commit
  `761c8de`. Added the shared subtle grid page-canvas treatment, card discipline, spec notes,
  and 1440px before/after screenshots for Dashboard, Canvas, and Settings. Gates before merge:
  `npx tsc -p tsconfig.app.json --noEmit` exit 0; `npm run build` green; `npm run lint`
  68 problems, within frozen <=68 baseline.

### Phase 3 - Research engine & evidence
Tasks: 3.1 [x] - 3.2 [x] - 3.3 [x] - 3.4 [x] - 3.5 [x] - 3.6 [x] - 3.7 [x]

**2026-07-03 - REVIEWER PASS: RF-3-8..11 fixed directly by the reviewer; Phase 3 APPROVED and
merged to main (PR #13).**

- **RF-3-8 (BLOCKER, fixed):** the verifier golden set now exercises the real verification
  unit. `verifyClaimAgainstExcerpt` is exported from `worker/src/jobs/company-research.ts`
  (same prompt/parsing/mapping the pipeline uses) and the test runs all 10 golden claims
  through it: fixture mode replays recorded verifier responses (including fenced and malformed
  outputs, which must fail closed to `unsupported`) and asserts the claim/excerpt actually
  reach the prompt; live mode (`GOLDEN_LIVE=1` + `ANTHROPIC_API_KEY`) runs the same claims
  against the real research_verify model and requires >= 9/10.
- **RF-3-9 (HIGH, fixed):** evidence popovers now have a real data path. New
  `src/hooks/useCanvasEvidence.ts` loads the latest `canvas_section_versions` per section for
  the active account and hydrates `evidence_ids` into `evidence_items` rows;
  `EnterpriseBusinessModelCanvas` prefers versioned rich items and falls back to legacy
  analysis strings per section.
- **RF-3-10 (MEDIUM, fixed):** the staleness sweep is now actually scheduled and complete:
  - Migration `20260703090000_staleness_loop_provisioning.sql`: unique partial index
    `(account_id, action_key)`, `provision_account_defaults` now seeds a weekly
    `staleness_sweep` loop (Mon 06:00 UTC, orchestrator-owned) for new accounts, plus a
    backfill for existing accounts. Mirrored in `schema.sql`; provisioning + idempotency
    functionally tested on scratch Postgres.
  - `scheduled-loop-tick` now routes action-key loops (`staleness_sweep`,
    `feed_refresh:<feed_key>`) to enqueued worker jobs; `agent-run` maps those runTypes to the
    matching job kinds (previously ONLY workspace_chat/canvas_section_analysis were reachable,
    so loop-driven worker jobs had no producer at all).
  - Worker sweep treats null `last_verified_at` as never-verified (ages by `created_at`).
  - New `run-status.ts` helper: `feed_refresh` and `staleness_sweep` jobs now mark their
    durable `agent_runs` row completed (previously left `pending` forever).
- **RF-3-11 (LOW, fixed):** verify-schema task_class count updated to 10; added checks for the
  unique loop index and staleness provisioning.
- **RF-3-7 (LOW, fixed early):** research evidence writes now reuse an existing
  `evidence_items` row matching (account, source_url, excerpt) instead of duplicating; test added.
- **Reviewer gate results:** worker typecheck/test/build/lint clean (36 passed, 2 skipped:
  SQL integration + live golden, both env-gated); root tsc exit 0; `npm run build` green;
  `npm run lint` 68 problems (frozen ceiling 68). Scratch Postgres: fresh `schema.sql` -> 86/86
  verification assertions PASS; main schema + three Phase-3 migrations applied in order ->
  86/86 PASS; provisioning functional test seeds exactly one staleness loop per account.

**2026-07-02 - RF-3-4 through RF-3-7 fixed/logged; work orders 3.5-3.7 complete.**

- **RF-3-4:** added provider-aware research execution. Anthropic routes use `ClaudeAgentRunner`;
  OpenRouter routes use `OpenRouterChatRunner` against `https://openrouter.ai/api/v1/chat/completions`
  with route params and clear `OPENROUTER_API_KEY not configured` failures. Worker env/docs now include
  `OPENROUTER_API_KEY`.
- **RF-3-5:** added migration `20260702190000_add_extract_escalated_route.sql`, mirrored in
  `supabase/schema.sql`, and extended `scripts/verify-schema.sql`. `company_research` now escalates
  to task class `extract_escalated`, guards that the escalated model differs from primary extract,
  and enforces `research_verify` stays on an Anthropic Claude route.
- **RF-3-6:** model output parsing is tolerant of fenced/prose-wrapped JSON. Unparseable primary
  extraction triggers escalation; unparseable verifier output becomes an unsupported verdict with
  confidence capped at 0.5.
- **RF-3-7:** logged as known debt: repeated research runs can duplicate `evidence_items` for the same
  source URL. Candidate fix is source URL plus content-hash dedup before insert.
- **3.5:** Canvas section cards now render evidence popovers for evidence-bearing canvas item objects,
  including source, date, excerpt, link, confidence, and freshness while preserving legacy string items.
- **3.6:** added `staleness_sweep` worker job to downgrade account-scoped canvas section freshness after
  stale/outdated thresholds.
- **3.7:** added fixture-only verifier golden set (10 claims, requires at least 9/10), cited-item ratio
  assertion for company research, cache TTL/reuse tests, and feed-health-on-404 test. CI remains offline.
- **Live DB:** applied `20260702190000_add_extract_escalated_route.sql` to live project
  `mehhuxzamnpxnkbrslls` via Supabase MCP as migration `add_extract_escalated_route`; verification query
  returned the expected global `extract_escalated` Anthropic route.

**Final Phase 3 gate results:**
```
cd worker && npm run typecheck  -> exit 0
cd worker && npm test           -> 33 passed, 1 skipped (SQL integration needs WORKER_TEST_DATABASE_URL)
cd worker && npm run build      -> exit 0
cd worker && npm run lint       -> exit 0
npx tsc -p tsconfig.app.json --noEmit -> exit 0
npm run build                   -> green
npm run lint                    -> 68 problems (49 errors, 19 warnings), within frozen <=68 baseline
```

**2026-07-02 - Work orders 3.3-3.4 company research slice complete on `build/phase-3-research`.**

- **3.3 `company_research`:** added a worker job kind routed through the dispatcher. The job crawls
  the target company through `FeedRunner` only, writes account-scoped `evidence_items`, extracts BMC
  claims with the `extract` task class on the budget route, verifies every claim through the
  `research_verify` task class on the mid route, and writes evidence-linked `canvas_section_versions`.
- **Verification discipline:** unsupported claims are capped at confidence 0.5 and flagged;
  contradicted claims are not written to canvas items and instead create account-scoped gaps and
  insights with evidence ids.
- **3.4 escalation ladder:** invalid budget extraction escalates to the mid extract route and writes
  `research.escalation_rate` to `metric_snapshots` with `feed_key: firecrawl_scrape` inputs.
- **Tests:** added fixture-only company research tests covering cited canvas item writes, contradicted
  verifier output, unsupported confidence capping, dispatcher support, and forced extraction
  escalation. No live network calls are used.

**Gate results for 3.3-3.4 slice:**
```
cd worker && npm run typecheck  -> exit 0
cd worker && npm test           -> 27 passed, 1 skipped (SQL integration needs WORKER_TEST_DATABASE_URL)
cd worker && npm run build      -> exit 0
cd worker && npm run lint       -> exit 0
npx tsc -p tsconfig.app.json --noEmit -> exit 0
npm run build                   -> green
npm run lint                    -> 68 problems (49 errors, 19 warnings), within frozen <=68 baseline
```

**2026-07-02 - Review findings RF-3-1 through RF-3-3 fixed before 3.3-3.4 work.**

- **RF-3-1:** `FeedRunner` now ignores non-ok cache rows and writes degraded/failing cache entries
  with a 300-second backoff expiry instead of the feed's full TTL. Health writes still run for every
  result so `data_feeds.health/last_error` remain current.
- **RF-3-2:** Grok live-search requests now include live-search parameters and citation return; cited
  URLs are normalized into evidence candidates. Note: checked current xAI docs; the public docs now
  emphasize the Responses API `web_search` tool, but this worker keeps the reviewer-requested
  chat-completions compatibility path.
- **RF-3-3:** `BUILD_STATE.md` was rewritten as valid UTF-8 and Phase 3 mojibake was cleaned.
- **Live DB:** applied `20260702130000_data_feeds_and_cache.sql` to live project
  `mehhuxzamnpxnkbrslls` via Supabase MCP as migration `data_feeds_and_cache`; verification query
  showed 6 `data_feeds` rows and 0 `feed_cache` rows.

**2026-07-02 - Reviewer follow-up for work orders 3.1-3.2 on `build/phase-3-research`.**

- Pulled latest `main` after reviewer-merged PR #11 and rebased `build/phase-3-research` cleanly
  before continuing.
- Treat `npm run lint` **68 problems** as the new ceiling after a pre-existing lint issue was
  removed elsewhere; rule remains "never increase."
- Completed the remaining 3.2 gaps: all six wave-1 fetchers now have recorded-fixture tests with
  mocked fetches and no live network calls. Firecrawl scrape, Grok live search, FRED, Google
  Trends (via `GOOGLE_TRENDS_API_KEY` provider adapter), GDELT, and GitHub each normalize into
  evidence candidates and, where applicable, metric candidates.
- Wired Phase-2 MCP tools `search_web` and `firecrawl_scrape` through `FeedRunner.refresh`, so
  they use the same account-scoped feed cache as `feed_refresh` jobs instead of returning Phase-3
  stubs.

**2026-07-02 - Work orders 3.1-3.2 feed framework complete on `build/phase-3-research`.**

- **Orientation:** read BUILD_PLAN Phase 3 work orders, spec 05 §6, and spec 07 §3 before coding.
- **3.1 schema:** added migration `20260702130000_data_feeds_and_cache.sql` with `data_feeds`,
  `feed_cache`, `data_feed_kind`, `data_feed_health`, indexes, RLS select policies, and six global
  default feed rows. Mirrored into `supabase/schema.sql`, updated Supabase types, and extended
  `scripts/verify-schema.sql` checks.
- **3.1 worker framework:** added feed candidate types, fetcher registry, TTL cache read/write,
  feed health updates, and `feed_refresh` job handling. `feed_refresh` jobs require an active
  `scheduled_loops.action_key = feed_refresh:<feed_key>` row for the job account before running.
- **3.2 wave-1 fetchers:** added Firecrawl scrape, Grok live search, FRED series, Google Trends,
  GDELT count, and GitHub repo stats fetchers. API-key-backed feeds degrade explicitly when env
  is missing. GitHub uses `GITHUB_TOKEN`; Google Trends uses
  `GOOGLE_TRENDS_API_KEY` for the provider adapter.
- **Tests:** worker tests cover keyless degradation, fixture-backed normalization for all six
  wave-1 fetchers, cached `search_web` / `firecrawl_scrape` MCP tool plumbing, and scheduled-loop
  enforcement for feed refresh jobs.

**Gate results for this slice:**
```
cd worker && npm run typecheck  -> exit 0
cd worker && npm test           -> 21 passed, 1 skipped (SQL integration needs WORKER_TEST_DATABASE_URL)
cd worker && npm run build      -> exit 0
cd worker && npm run lint       -> exit 0
npx tsc -p tsconfig.app.json --noEmit -> exit 0
npm run build                   -> green
npm run lint                    -> 68 problems (49 errors, 19 warnings), within frozen <=68 baseline
```

### Phase 4 â€” Competitor canvases & gap engine
Tasks: 4.1 â˜ Â· 4.2 â˜ Â· 4.3 â˜ Â· 4.4 â˜ Â· 4.5 â˜ Â· 4.6 â˜ Â· 4.7 â˜

### Phase 5 â€” Section agent workspaces
Tasks: 5.1 â˜ Â· 5.2 â˜ Â· 5.3 â˜ Â· 5.4 â˜ Â· 5.5 â˜ Â· 5.6 â˜ Â· 5.7 â˜ Â· 5.8 â˜ Â· 5.9 â˜

### Phase 6 â€” War Room & orchestration
Tasks: 6.1 â˜ Â· 6.2 â˜ Â· 6.3 â˜ Â· 6.4 â˜ Â· 6.5 â˜ Â· 6.6 â˜ Â· 6.7 â˜ Â· 6.8 â˜ Â· 6.9 â˜

### Phase 7 â€” Metrics, KPIs & interpretation
Tasks: 7.1 â˜ Â· 7.2 â˜ Â· 7.3 â˜ Â· 7.4 â˜ Â· 7.5 â˜ Â· 7.6 â˜ Â· 7.7 â˜
