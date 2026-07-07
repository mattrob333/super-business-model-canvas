# Operations

[← Back to Home](./Home.md)

How Super BMC is deployed, migrated, diagnosed, scheduled, and kept honest.
Everything on this page is grounded in the workflow files under
`.github/workflows/`, the Fly configs, the Supabase migrations, and the live
incident log in `docs/BUILD_STATE.md`. The one-time owner setup (Fly apps,
GitHub secrets, DNS) lives in `DEPLOY.md` at the repo root — this page covers
day-2 operations.

---

## 1. Deploy pipeline (`.github/workflows/deploy.yml`)

**Trigger:** every push to `main` (plus manual `workflow_dispatch`).
Concurrency group `deploy-main` with `cancel-in-progress: false`, so deploys
queue rather than cancel each other. Two parallel jobs:

### `web` — frontend (`super-bmc-web`)

`flyctl deploy --remote-only --config fly.web.toml`, passing four build args
into the Vite bundle:

- `VITE_SUPABASE_URL` (repo secret)
- `VITE_SUPABASE_PUBLISHABLE_KEY` (repo secret)
- `VITE_RUNTIME_MODE` (repo *variable*, defaults to `enqueue`)
- `VITE_AGENT_RUNTIME_ENDPOINT` (derived: `$VITE_SUPABASE_URL/functions/v1/agent-run`)

These are the only values that ever reach the browser bundle — they are
public by design.

### `worker` — agent job worker (`super-bmc-worker`)

Runs `flyctl deploy --remote-only` from the `worker/` directory (the Docker
build context must be `worker/`), then a second step that exists because of a
live incident. The workflow comment states the reason verbatim:

> flyctl deploy UPDATES stopped machines without STARTING them — a
> parked fleet stays parked through any number of green deploys (live
> incident 2026-07-07: worker down ~6h across 7 "successful" deploys;
> every queued briefing/chat/skill sat pending). Deploy is not done
> until a non-standby machine is actually running.

The **"Ensure worker machines are started"** step:

1. Lists machines as JSON and starts every non-standby machine whose state is
   not `started` (`flyctl machine start "$id" || true`).
2. Sleeps 10 seconds, prints `flyctl machine list`.
3. Counts started non-standby machines and **fails the deploy** if the count
   is below 1:

   ```
   ::error::No started (non-standby) worker machines after deploy — the job queue would starve silently.
   exit 1
   ```

A green Deploy run therefore means *a running worker*, not just a pushed
image. (BUILD_STATE, "HOTFIX 2", 2026-07-07: the diagnose run found both
machines STOPPED with no app log lines since 21:35Z the previous day; seven
consecutive green deploys had shipped code onto a parked fleet.)

### Worker `fly.toml` — restart policy and memory (quoted)

`worker/fly.toml` encodes two more incident lessons as config, with the
rationale in comments:

Restart policy:

```toml
# Restart forever: the default on-failure policy gives up after repeated
# crashes and leaves machines STOPPED (live incident 2026-07-07 — the queue
# then starves silently). A background poller must always come back.
[[restart]]
  policy = "always"
```

Memory sizing:

```toml
[[vm]]
  size = "shared-cpu-1x"
  # 1GB: the Claude Agent SDK spawns a Node CLI child per model call; at
  # 512MB the spawn is the prime suspect for the live "exited with code 1"
  # failures (2026-07-06 incident, see BUILD_STATE).
  memory = "1024mb"
```

Other worker settings: app `super-bmc-worker`, region `iad`, `kill_signal =
"SIGINT"`, `kill_timeout = "30s"`, no HTTP service (it is a background job
poller). Its secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`ANTHROPIC_API_KEY`, …) are set via `flyctl secrets set` / the Ops
`sync-secrets` task, never baked into the image.

---

## 2. Database migrations and edge functions

### `DB Migrate` (`.github/workflows/db-migrate.yml`)

**Trigger:** push to `main` touching `supabase/migrations/**`. Continuous
migration deployment to the live project (`SUPABASE_PROJECT_REF:
mehhuxzamnpxnkbrslls`). Migrations follow the repo's idempotent convention
(BUILD_PLAN rules 11/12), so re-application is safe; the manual Ops
`apply-migrations` task remains for ad-hoc runs.

Steps (single job `apply-migrations`, using `supabase/setup-cli@v1` with
`SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`):

1. `supabase link --project-ref "$SUPABASE_PROJECT_REF"`
2. `supabase db push --include-all` — if it succeeds, done.
3. **Self-healing reconcile** on the specific failure `Remote migration
   versions not found` (any other failure exits 1):
   - Manually-applied history rows the CLI suggests reverting get
     `supabase migration repair --status reverted <versions>` (bookkeeping
     only — nothing is actually reverted in the database).
   - Every repo migration file below the cutoff `20260705000000` (everything
     below is confirmed applied live, per BUILD_STATE) is recorded as applied
     with `supabase migration repair --status applied <version> || true`
     without re-running it.
   - `supabase db push --include-all` again to push the rest.

### `Edge Deploy` (`.github/workflows/edge-deploy.yml`)

**Trigger:** push to `main` touching `supabase/functions/**`. One job,
one step: `supabase functions deploy --project-ref "$SUPABASE_PROJECT_REF"`
redeploys **all** functions to the live project. Push-triggered (mirroring
the DB Migrate pattern) because `workflow_dispatch` is not available to the
API integration; the manual Ops `deploy-edge-functions` task remains for
ad-hoc runs.

---

## 3. Diagnostics (`.github/workflows/diagnose.yml`)

**Trigger:** push to `main` that changes the file `.github/diagnose-now`.
This is deliberate: a commit touching that file is the trigger, which makes
diagnostics usable by agents that lack `workflow_dispatch` permission.

**How to trigger:** make any commit that modifies `.github/diagnose-now`
(e.g. append a timestamp line) and push to `main`. Same output as the Ops
`worker-diagnose` task.

What the single `worker-diagnose` job dumps, in order:

1. **Machine status + memory** — `flyctl status -a super-bmc-worker` and
   `flyctl machine list -a super-bmc-worker`.
2. **Secret NAMES on the worker** — `flyctl secrets list -a super-bmc-worker`.
   Names only; values are never printed.
3. **Recent worker logs** — `timeout 45 flyctl logs -a super-bmc-worker
   --no-tail || true`.
4. **Job queue state (last 20 jobs + open runs)** — a read-only Node script
   is base64-encoded and executed **on the worker machine** via
   `flyctl ssh console -C "node -e ..."`. The workflow comment explains why:

   > Read-only queue state, executed ON the worker machine (the service
   > key already lives there as an env var and never leaves it). Prints
   > job/run statuses, attempts, and truncated errors — no key material.

   The script queries PostgREST with the worker's own `SUPABASE_URL` /
   `SUPABASE_SERVICE_ROLE_KEY` env vars and prints:
   - `agent_jobs` newest 20: id, kind, status, attempts/max_attempts,
     run_after, locked_at, heartbeat_at, claimed_by, `last_error` truncated
     to 240 chars, created_at.
   - `agent_runs` still `pending`/`running`, newest 20: id, run_type, status,
     error (truncated), created_at, started_at.

---

## 4. Scheduled autonomy (pg_cron → `scheduled-loop-tick`)

### The heartbeat

Migration `supabase/migrations/20260702090000_schedule_loop_tick.sql` creates
the `pg_cron` + `pg_net` extensions and schedules cron job
`scheduled-loop-tick` on `*/5 * * * *`: every 5 minutes it `net.http_post`s
to `https://mehhuxzamnpxnkbrslls.supabase.co/functions/v1/scheduled-loop-tick`
with a Bearer token read from `vault.decrypted_secrets where name =
'service_role_key'`.

**One-time Vault requirement:** the migration header is explicit —

```sql
-- Prerequisite (one-time, run manually in the SQL Editor — never commit the key):
--   select vault.create_secret('<service-role-key>', 'service_role_key');
```

This was a real blocker: BLK-OPS-1 in BUILD_STATE stopped the cron and
staleness-loop migrations until the owner added the `service_role_key` Vault
secret (resolved 2026-07-03; re-verified `has_service_role_key = true`
without reading the value).

### The edge function (`supabase/functions/scheduled-loop-tick/index.ts`)

Due `scheduled_loops` rows become durable `agent_runs` + `agent_jobs` the
worker executes — the system works while the owner sleeps.

**Two auth paths:**

- **Service-role sweep** (the cron path): a Bearer token exactly equal to
  `SUPABASE_SERVICE_ROLE_KEY` may process **all** due active loops
  (`next_run_at IS NULL OR next_run_at <= now`, limit 25 per tick).
- **User "Run Now"** (Settings page): a user JWT must supply a `loopId`,
  authenticate via `auth.getUser()`, and be a member (`account_members`) of
  the loop's account. It may only run that ONE named loop — never sweep
  everything. Missing auth/loopId → 401; non-member → 403.

**Per-loop guards, in order** (`processLoop`):

1. Failure ceiling — `failure_count >= max_consecutive_failures` parks the
   loop as `exhausted_failures` instead of erroring every 5 minutes forever.
2. Monthly budget — 30-day scheduled spend (summed `agent_runs.estimated_cost`
   for `trigger_type = 'scheduled'`) at or over `monthly_budget` parks it as
   `exhausted_budget`.
3. **CAS claim on `next_run_at`** — claim BEFORE executing: the update sets
   `last_run_at`/the newly computed `next_run_at` *conditioned on the
   observed `next_run_at`* (`.eq`/`.is null`). Whichever tick wins the update
   owns this occurrence; a lost claim means another tick (or a concurrent Run
   Now) already took it, and the loop is skipped — overlapping ticks can
   never double-enqueue the same occurrence.
4. Execute via the `agent-run` edge function (service role), so scheduled
   work flows through the exact same run+job pipeline as manual work.
   Success resets `failure_count`; failure increments it.

**Action-key map** (`enqueueSpecForActionKey`) — a loop's `action_key`
selects the worker job, all enqueued with `mode: 'enqueue'`:

| `action_key` | run type / input |
|---|---|
| `staleness_sweep` | `staleness_sweep` |
| `atlas_briefing` | `atlas_briefing` |
| `gap_engine` | `gap_engine` |
| `feed_refresh:<feed_key>` | `feed_refresh` with `{ feed_key }` |
| `skill_run:<skill_key>` | `skill_run` with `{ skill_key }` |

A non-null key the map doesn't know **fails loudly** ("Unknown action_key …
refusing to run a fallback action") — never a silent fallback. Legacy loops
with no `action_key` keep the original inline Value Propositions
section-analysis behavior. (`triggered_by` is a uuid column; the loop id
rides in `input.scheduled_loop_id` — the old string tag broke every
scheduled enqueue, per the 2026-07-07 hardening note in the file header.)

### Seeded loops (verified in migrations)

`provision_account_defaults()` seeds both defaults for every account, bound
to the account's `orchestrator` profile, with a unique partial index
`(account_id, action_key) where action_key is not null` guaranteeing one loop
per action per account:

- **Weekly staleness sweep** — `'Canvas staleness sweep'`, cron `0 6 * * 1`
  (Mondays 06:00 UTC), `action_key = 'staleness_sweep'`
  (`20260703090000_staleness_loop_provisioning.sql`, incl. backfill for
  existing accounts).
- **Daily Atlas briefing** — `'Morning briefing from Atlas'`, cron
  `0 11 * * *` (11:00 UTC, before a US workday), `action_key =
  'atlas_briefing'` (`20260707160000_atlas_briefing_loop.sql`, incl. backfill
  and a re-arm of loops parked by the pre-hardening `triggered_by` bug).

---

## 5. Secrets policy

From `DEPLOY.md` (the binding runbook) and `HANDOFF.md`:

- **Provider API keys live in exactly one human-facing place: GitHub repo
  secrets.** The Ops `sync-secrets` task propagates them to Fly worker
  secrets and Supabase edge-function secrets. "Keys never appear in code,
  chat, or build output."
- **The frontend bundle only ever contains `VITE_*` values, which are public
  by design.** Provider keys never ship to the browser.
- **The service-role key exists only in Fly worker secrets and the Supabase
  Vault** (`service_role_key`, read by the pg_cron tick). It is never in the
  frontend, never committed to the repo, never pasted in chat — the Vault
  `create_secret` is run manually in the SQL Editor only, and BUILD_STATE
  records verifying the secret *exists* "without reading its value".
- **The worker's service-role key bypasses RLS** (HANDOFF.md, standing #1
  reviewer check): "Every tool handler and job must filter by the job's
  `account_id` in code (spec 07 §3)." Since 2026-07-06 this extends to
  company scoping: every canvas/gaps/companies/skill_artifacts read and
  write goes through `loadCompanyScope` and filters/stamps
  `business_context_version_id` — an unscoped account-wide query
  reintroduces the cross-company pollution bug.
- Rotation: update the GitHub secret → run Ops `sync-secrets` (Day-2 ops,
  `DEPLOY.md`).

Environment variable map (who reads what, from `DEPLOY.md`):

| Where | Values |
|---|---|
| Frontend bundle (build args, public) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_RUNTIME_MODE=enqueue`, `VITE_AGENT_RUNTIME_ENDPOINT` |
| Fly worker secrets | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `XAI_API_KEY`, `FIRECRAWL_API_KEY`, optional feed keys |
| Supabase edge function secrets | `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `XAI_API_KEY`, `FIRECRAWL_API_KEY`, `CREDENTIALS_ENCRYPTION_KEY` |
| Supabase Vault | `service_role_key` (pg_cron loop tick) |

---

## 6. Gates — the binding pre-commit checklist

Every commit runs the full gate set and records the results in a BUILD_STATE
entry. The exact commands, copied from the most recent gate block
(GOAL PHASE 6, 2026-07-07):

```
cd worker && npx tsc --noEmit          -> exit 0
cd worker && npx vitest run            -> 382 passed, 2 skipped
cd worker && npm run build             -> exit 0
cd worker && npx eslint src            -> exit 0
npx tsc -p tsconfig.app.json --noEmit  -> exit 0
npx tsc -p tsconfig.node.json --noEmit -> exit 0
npm run build                          -> green
npm run lint                           -> 64 problems, within frozen <=65 ceiling
UTF-8 touched-file decode              -> encoding clean, exit 0
```

**WARNING — the root typecheck command is load-bearing.** Plain
`npx tsc --noEmit` at the repo root **checks NOTHING**: it is a no-op under
this repo's project-references tsconfig. BUILD_STATE (owner round 6c,
2026-07-06) records four rounds of "green" gates missing a
`ReferenceError` that crashed every `/workspace` visit because the gate
command had drifted to the bare form, and Vite's transpile-only build
shipped the bare identifier anyway. The binding correction from that entry:

> GATE CORRECTION (binding): root typecheck is
> `npx tsc -p tsconfig.app.json --noEmit` + `npx tsc -p tsconfig.node.json --noEmit`.

The lint ceiling is a frozen baseline (currently ≤ 65 problems; the actual
count has held at 64 — 46 errors, 18 warnings). New lint debt is not
allowed; the ceiling only ratchets down (68 → 65 with the overlay system).

---

## 7. Incident playbook

### Symptom: runs stuck "pending" (briefings/chats/skills never complete)

1. **Trigger diagnose**: commit a change to `.github/diagnose-now`, push to
   `main`, open the Diagnose run in Actions.
2. **Read machine state first**: in the `flyctl status` / `machine list`
   output, are the non-standby machines `started`? A STOPPED fleet is the
   known killer — every queued job sits pending while nothing polls.
3. **Read the queue dump**: `agent_jobs` rows stuck `queued` with no
   `claimed_by`/`heartbeat_at` confirm no worker is claiming; rows with
   rising `attempts` and a `last_error` point at a code/provider failure
   instead.
4. If machines are stopped: `flyctl machine start <id> -a super-bmc-worker`
   (or simply re-run Deploy — its ensure-started gate now does this and
   fails loudly if it can't).

### The two past worker-down incidents (both 2026-07-07) — lessons encoded

**Incident 1 — crash-looping job loop + no restart policy** (BUILD_STATE
"HOTFIX"): both machines STOPPED since 01:06Z; skill runs and chats stuck
pending.
- Root cause 1 (code): `JobLoop.runForever` let any claimNext/complete
  exception escape — one transient `TypeError: fetch failed` against
  Supabase killed the whole process. **Fix:** a failed poll cycle logs and
  backs off; a regression test proves a throwing claim never rejects
  `runForever`.
- Root cause 2 (infra): no restart policy in `worker/fly.toml`; Fly's
  default on-failure gives up after repeated crashes and parks machines
  stopped — the queue then starves silently. **Fix:** `[[restart]] policy =
  "always"` (a background poller must always come back).
- Side effect: the diagnose workflow gained the on-worker queue-state dump.

**Incident 2 — deploys leave the fleet parked** (BUILD_STATE "HOTFIX 2"):
"Get your first briefing" spun 3+ minutes; diagnose showed both machines
STOPPED, no app logs since 21:35Z the previous day. `flyctl deploy` UPDATES
stopped machines but never STARTS them, so seven consecutive green deploys
(including the fleet hotfix itself) shipped code onto a parked fleet — the
restart policy can't help a machine that never starts. **Fix:** the
ensure-started step in `deploy.yml` — start every stopped non-standby
machine after the worker deploy and FAIL the deploy if none is running
afterwards. The entry also records the process lesson: "my earlier 'deploy
succeeded so the queue drains' claim was wrong — I verified the workflow
conclusion, not the machine state."

**Standing lessons:**

- A green deploy is not proof of a running system — verify machine state,
  not workflow conclusions.
- Background pollers must be crash-proof at two layers: the loop never dies
  on a transient error (code), and the machine always comes back if it does
  (infra `restart = always`), and the deploy refuses to end with a parked
  fleet (CI gate).
- Related earlier fix: the 2026-07-06 "exited with code 1" failures were
  memory pressure — the Claude Agent SDK spawns a Node CLI child per model
  call, which is why the worker VM is sized at 1 GB, not 512 MB.

### Other useful levers

- Worker logs live: `fly logs -a super-bmc-worker` (watch it claim jobs).
- Rollback: `fly releases -a super-bmc-web` → `fly deploy --image <previous>`,
  or revert the commit and push (`DEPLOY.md` Day-2 ops).
- Scale: keep the worker at 1 machine unless job volume demands more — the
  queue's SKIP LOCKED claiming makes multiple workers safe, but 1 is plenty
  today.
- Cron sanity (from BUILD_STATE ops notes): in the Supabase SQL editor,
  `select jobname from cron.job;` should show `scheduled-loop-tick` and
  `select name from vault.secrets;` should show `service_role_key`; if
  missing, run the `create_secret` from
  `20260702090000_schedule_loop_tick.sql` (key pasted in the SQL editor
  ONLY).

---

[← Back to Home](./Home.md)
