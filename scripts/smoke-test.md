# Manual E2E Smoke Test

> Run this against a deployed environment (staging or prod) after any edge-function deploy or
> frontend rebuild. Each flow should be run in order — later flows assume earlier ones succeeded.
> Record pass/fail + notes in `docs/BUILD_STATE.md` phase log when run as part of a review.

**Prerequisites**
- Supabase project with `schema.sql` + migrations applied, edge functions deployed
- `CREDENTIALS_ENCRYPTION_KEY` secret set
- At least one AI provider key set in Supabase secrets (xAI recommended)
- Frontend built/served with `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_HERMES_RUNTIME_ENDPOINT` set

---

## Flow 1 — Sign up
1. Go to `/auth`, create a new account (email + password).
2. **Expect:** redirected into the app (Dashboard or Canvas), `TopBar` shows your email/name,
   `account_members` row created for a new `accounts` row.
3. **Fail signal:** stuck on `/auth`, console shows 401/403, or TopBar shows "Guest".

## Flow 2 — Analyze a company
1. Navigate to `/canvas` (or wherever the URL-input hero lives — check `Analysis.tsx` if route
   moved).
2. Enter a real company URL (e.g. `stripe.com`).
3. **Expect:** loading state with numbered steps, then a populated 9-section BMC grid + business
   overview within ~60s. A `saved_analyses` / `business_context_versions` row is created.
4. **Fail signal:** immediate error → `XAI_API_KEY` missing or `analyze-company` not deployed.
   Spinner never resolves → check edge function logs for timeout/500.

## Flow 3 — Section chat
1. Click into any BMC section (e.g. Key Partnerships) to open its editor/chat panel.
2. Send a message ("What are the biggest risks here?").
3. **Expect:** streamed response appears incrementally (not one giant blob at the end); a durable
   record is written (check `agent_runs` or the chat's backing table depending on which lane is
   wired — see `HANDOFF.md` AI Architecture Map).
4. **Fail signal:** "Not authenticated" error (JWT not being sent/validated) or blank response
   (SSE stream not consumed — see DEVLOG.md item #6 fix).

## Flow 4 — Canvas Analyze (agent run)
1. On a BMC section card, click "Analyze".
2. **Expect:** loading overlay, then new items land in that section with a confidence indicator;
   an `agent_runs` row is created with `status: completed`, tokens/cost populated (not mock
   zeros, if `VITE_HERMES_RUNTIME_ENDPOINT` is set to a live deployment).
3. **Fail signal:** error banner on the card (check the `agent-run` function logs); items never
   update (stuck in mock mode — verify the env var made it into the actual build, not just
   `.env` locally).

## Flow 5 — Playbook report
1. Navigate to `/playbooks`, pick a framework (e.g. SWOT or Porter's Five Forces).
2. Run it against the analyzed company from Flow 2.
3. **Expect:** a generated report renders in the `ReportViewerDrawer`/`ReportViewer` page,
   backed by a `generated_reports` row.
4. **Fail signal:** empty Porter report (see DEVLOG.md fix — needs
   `20250701120000_fix_porter_report_schema.sql` applied); 500 from
   `generate-framework-report` (check code-fence stripping fix landed, DEVLOG item #8).

## Flow 6 — Dashboard shows real data
1. Navigate to `/dashboard`.
2. **Expect:** Strategic Health score computed (not a placeholder number), open gaps by
   severity, evidence count, last 5 agent runs, loop status counts, last 3 reports — all reading
   live tables (per DEVLOG.md "Shipped as a loose-end tie-up" — Dashboard wiring).
3. **Fail signal:** static/zero placeholder tiles → frontend build predates the Dashboard live-
   wiring commit, or `account_id` scoping is broken (check RLS).

---

## Recording results
When this smoke test is run as part of a phase review, log the outcome in
`docs/BUILD_STATE.md` under the relevant phase's log section: which flows passed, which failed
and why, and the commit/deploy SHA tested against.
