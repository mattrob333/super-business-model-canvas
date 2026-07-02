# BUILD STATE — live tracker

> Maintained by the AI build team. Rules in `BUILD_PLAN.md` Part I. The reviewer audits this
> file against reality — keep it truthful and current. Newest log entries first within each
> phase.

## Status board

| Phase | Title | Status | Branch | Last update |
|---|---|---|---|---|
| 0 | Baseline verification & deploy prep | **AWAITING REVIEW** | `build/phase-0-baseline` | 2026-07-02 |
| 1 | Data model wave 1 | NOT STARTED | — | — |
| 2 | Agent worker service | NOT STARTED | — | — |
| 3 | Research engine & evidence | NOT STARTED | — | — |
| 4 | Competitor canvases & gap engine | NOT STARTED | — | — |
| 5 | Section agent workspaces | NOT STARTED | — | — |
| 6 | War Room & orchestration | NOT STARTED | — | — |
| 7 | Metrics, KPIs & interpretation | NOT STARTED | — | — |
| 8 | Hardening & commercial | HELD (await direction) | — | — |

Statuses: `NOT STARTED` → `IN PROGRESS` → `AWAITING REVIEW` → `APPROVED` (or back to
`IN PROGRESS` on review findings). Only one phase `IN PROGRESS` unless BUILD_PLAN Part IV
concurrency rule is invoked (note it here if so).

## BLOCKERS (open)

_(none)_

<!-- Format:
### BLK-<n>: <title> (raised <date>, phase <n>)
Context: …
Recommended resolution: …
Status: OPEN | RESOLVED (<how>)
-->

## OPERATOR QUEUE (needs Matt)

- **From July 2 session (pre-Phase-0):** deploy updated edge functions; set
  `CREDENTIALS_ENCRYPTION_KEY`; Vault service key + run cron migration; set `VITE_*` build
  vars. Exact steps: `DEVLOG.md` → "Deployment checklist".
- **From Phase 0 (this pass):** same deploy is still outstanding — nothing new to deploy yet
  since Phase 0 made no code changes, only verified/documented. When you do run the July-2
  deploy, use `scripts/smoke-test.md` (new, this phase) to confirm all 6 flows work afterward.

<!-- Agents append: exact commands/clicks, why needed, which acceptance criterion waits on it. -->

## REVIEW FINDINGS

_(none yet)_

<!-- Reviewer appends RF-<phase>-<n> items; team marks them fixed with commit SHA. -->

---

## Phase logs

### Phase 0 — Baseline verification & deploy prep
Tasks: 0.1 ☑ · 0.2 ☑ · 0.3 ☑ · 0.4 ☑ (0.4 is documentation only — already captured in
DEVLOG.md's deployment checklist, cross-referenced above; no new operator action required
beyond what was already queued)

**2026-07-02 — Phase 0 complete, awaiting review.**

- **0.1 Fresh-clone verification** (branch `build/phase-0-baseline`, cut from `main` @ 58ba3ea):
  - `rm -rf node_modules dist && npm ci` — 522 packages installed clean (npm audit flags 22
    pre-existing vulnerabilities in deps, out of scope for this phase — not introduced by us).
  - `npx tsc -p tsconfig.app.json --noEmit` — **clean, exit 0**.
  - `npm run build` — **green**, 7.0s. Output unchanged in shape from pre-Phase-0 (same vendor
    chunking, `html2pdf` still the one >600kB chunk, pre-existing and documented).
  - `npm run lint` — **69 problems (50 errors, 19 warnings)** — exactly matches the frozen
    baseline in BUILD_PLAN.md Part I rule 3. No new lint errors introduced (no code was
    changed in this phase).
- **0.2 Static audit of all 12 edge functions vs their callers** — checked every function's
  request-body interface/shape against its caller's `fetch`/`functions.invoke` payload:
  `agent-run` (hermes-runtime.ts + ModelRoutingPanel + HermesRuntimePanel + useCanvasSectionRun),
  `analyze-company`, `bmc-chat`, `business-overview-chat`, `strategy-coach-chat`,
  `competitor-chat`, `research-competitors`, `generate-framework-report`,
  `recommend-frameworks` (deployed, confirmed still unused by any caller — matches DEVLOG.md's
  known-issue #`recommend-frameworks is deployed but never called`, not a new finding),
  `manage-provider-key` (ProviderCredentialsManager — `action`/body fields match),
  `scheduled-loop-tick` (ScheduledLoopsManager — `loopId` matches; internal self-invoke for
  per-loop dispatch also matches), `test-mcp-server` (McpConnectionsManager — `serverId`/
  `accountId` match).
  **Finding: no request/response shape drift detected in any of the 12 functions.** The July-2
  fixes (DEVLOG.md items 1–19) already resolved the drift that existed before (agent-key
  mismatch, research-competitors param mismatch, etc.) — this audit confirms those fixes are
  actually in the code on `main`, not just claimed in the devlog.
- **0.3 `scripts/smoke-test.md`** — created: 6 flows (sign up → analyze company → section chat
  → Canvas Analyze → playbook report → dashboard live data), each with expected behavior and
  fail signals cross-referenced to the specific DEVLOG.md fix that addresses the known failure
  mode. Not run end-to-end against a live deployment in this phase (no live Supabase project
  session available) — this is a script for the operator/reviewer to execute post-deploy, per
  work order 0.3's own framing ("a click-by-click manual E2E script the operator can run").
- **0.4 Operator queue** — the exact deploy commands, secrets, and build vars were already
  fully specified in `DEVLOG.md` → "Deployment checklist" from the July-2 session (functions
  list, `CREDENTIALS_ENCRYPTION_KEY` generation command, Vault + migration steps, `VITE_*`
  vars). Cross-referenced into `BUILD_STATE.md`'s OPERATOR QUEUE above rather than duplicated,
  per BUILD_PLAN.md's "no fake completeness" rule — the checklist already exists and duplicating
  it verbatim would just create a second copy to drift out of sync.

**Acceptance criteria status:**
- [x] BUILD_STATE records clean gate runs with output snippets (above)
- [x] Smoke-test doc exists and covers all 6 flows (`scripts/smoke-test.md`)
- [x] Operator queue lists every deploy step with exact commands (cross-referenced to
  DEVLOG.md's existing checklist — commands not duplicated here to avoid drift)

**Note for reviewer:** Phase 0's own rules (Part I rule 1) require the reviewer to mark this
`APPROVED` before Phase 1 begins. No code was touched in this phase — only verification and
documentation — so there is nothing to regress. Ready for review.

### Phase 1 — Data model wave 1
Tasks: 1.1 ☐ · 1.2 ☐ · 1.3 ☐ · 1.4 ☐ · 1.5 ☐ · 1.6 ☐

### Phase 2 — Agent worker service
Tasks: 2.1 ☐ · 2.2 ☐ · 2.3 ☐ · 2.4 ☐ · 2.5 ☐ · 2.6 ☐ · 2.7 ☐ · 2.8 ☐ · 2.9 ☐ · 2.10 ☐

### Phase 3 — Research engine & evidence
Tasks: 3.1 ☐ · 3.2 ☐ · 3.3 ☐ · 3.4 ☐ · 3.5 ☐ · 3.6 ☐ · 3.7 ☐

### Phase 4 — Competitor canvases & gap engine
Tasks: 4.1 ☐ · 4.2 ☐ · 4.3 ☐ · 4.4 ☐ · 4.5 ☐ · 4.6 ☐ · 4.7 ☐

### Phase 5 — Section agent workspaces
Tasks: 5.1 ☐ · 5.2 ☐ · 5.3 ☐ · 5.4 ☐ · 5.5 ☐ · 5.6 ☐ · 5.7 ☐ · 5.8 ☐ · 5.9 ☐

### Phase 6 — War Room & orchestration
Tasks: 6.1 ☐ · 6.2 ☐ · 6.3 ☐ · 6.4 ☐ · 6.5 ☐ · 6.6 ☐ · 6.7 ☐ · 6.8 ☐ · 6.9 ☐

### Phase 7 — Metrics, KPIs & interpretation
Tasks: 7.1 ☐ · 7.2 ☐ · 7.3 ☐ · 7.4 ☐ · 7.5 ☐ · 7.6 ☐ · 7.7 ☐
