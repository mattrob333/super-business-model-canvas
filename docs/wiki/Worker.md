# Worker

Back to [Home](./Home.md).

The worker is a standalone Node process (`worker/` package, `@superbmc/worker`) that polls the
`agent_jobs` table in Supabase and executes every background job in the product: canvas analysis,
company/competitor research, chat replies, skills, briefings, knowledge jobs, feed refreshes and
maintenance sweeps. It has no HTTP surface — it is a pure queue consumer deployed on Fly.io
(`worker/fly.toml`, app `super-bmc-worker`).

---

## 1. Process shape

### Entry point — `worker/src/index.ts`

Boot order:

1. `loadConfig()` (`worker/src/config/env.ts`) parses env with zod. Required: `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`. Optional keys: `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`,
   `XAI_API_KEY`, `FIRECRAWL_API_KEY`, `FRED_API_KEY`, `GOOGLE_TRENDS_API_KEY`, `GITHUB_TOKEN`.
   Defaults: `POLL_INTERVAL_MS=5000`, `JOB_HEARTBEAT_STALE_SECONDS=120`, `JOB_MAX_ATTEMPTS=3`,
   40 turns / 64k task-budget tokens for both section analysis and workspace chat.
   `workerId` falls back to `worker-${process.pid}`.
2. `claudeSelfCheck()` — a fire-and-forget boot-time SDK health probe ("Reply with exactly: OK",
   1 turn, $0.30 cap). Added after the 2026-07-06 live incident where chat/skill CLI children died
   with only "exited with code 1"; the result or full failure is printed to stdout so it is
   readable via `fly logs`. It never blocks the job loop.
3. Builds the service-role Supabase client, `SupabaseJobRepository`, the dispatcher
   (`createJobDispatcher`), and a `JobLoop` with `heartbeatIntervalMs = max(1000, POLL_INTERVAL_MS/2)`.
4. Registers `SIGINT`/`SIGTERM` → `loop.stop()`, then `await loop.runForever()`.

### JobLoop — `worker/src/queue/job-loop.ts`

`runOnce()` is the whole job lifecycle:

- **Claim**: `repository.claimNext(workerId, {staleAfterSeconds, defaultMaxAttempts})` — returns
  `null` when the queue is empty.
- **Heartbeat**: a `setInterval` calls `repository.heartbeat(job.id, workerId)` every
  `heartbeatIntervalMs` while the handler runs; cleared in `finally`.
- **Complete / fail**: handler success → `repository.complete(...)`; handler throw →
  `repository.fail(job.id, workerId, error)`.

`runForever()` loops `runOnce()` until `stop()`; when no job was worked it sleeps
`pollIntervalMs`. **Backoff rule**: the whole `runOnce()` call is wrapped in try/catch — a
transient claim/complete failure logs `[job-loop] poll cycle failed; backing off:` and idles the
loop, it never rethrows. The in-code comment cites the reason verbatim:

> Live incident 2026-07-07: one "fetch failed" while claiming crash-looped the worker until Fly
> parked both machines stopped — every queued job then sat pending forever.

A poll exception must never kill the process.

### SupabaseJobRepository — `worker/src/queue/supabase-job-repository.ts`

- `claimNext` → RPC `claim_next_agent_job(p_worker_id, p_stale_after_seconds, p_default_max_attempts)`.
- `heartbeat` → direct `agent_jobs` UPDATE of `heartbeat_at`, guarded by
  `claimed_by = workerId AND status = 'running'`.
- `complete` → UPDATE to `status='completed'`, same guard, clears `last_error`.
- `fail` → RPC `fail_agent_job(p_job_id, p_worker_id, p_error)`.

### The SECURITY DEFINER claim RPC — `supabase/migrations/20260702110000_agent_job_queue_locking.sql`

The worker runs with the service-role key, so **RLS is not the concurrency boundary** — claiming
must be atomic inside Postgres. `claim_next_agent_job` is `SECURITY DEFINER` and:

1. Dead-letters stale final-attempt runners: `running` jobs whose
   `coalesce(heartbeat_at, locked_at, created_at)` is older than `p_stale_after_seconds` with
   `attempts >= max_attempts` become `failed_permanent` ("Worker heartbeat expired after final
   attempt").
2. Selects one eligible job — `queued` with `run_after <= now()` and attempts remaining, **or**
   `running` with a stale heartbeat (crash recovery) — ordered by `run_after, created_at`, with
   `FOR UPDATE SKIP LOCKED` so concurrent workers never double-claim.
3. Marks it `running`, increments `attempts`, stamps `claimed_by/locked_at/heartbeat_at`.

`fail_agent_job` (also SECURITY DEFINER) centralizes retry state: at `attempts >= max_attempts`
the job goes `failed_permanent`; otherwise it is re-queued with exponential backoff
`least(900, 2^(attempts-1) * 30)` seconds in `run_after`. Both functions have EXECUTE revoked
from `public`/`anon`/`authenticated` and granted only to `service_role`
(reinforced by migration `20260702111000_restrict_agent_job_rpc_execute.sql`).

### Fly restart policy — `worker/fly.toml`

```toml
[[restart]]
  policy = "always"
```

The default `on-failure` policy gives up after repeated crashes and leaves machines STOPPED —
exactly what happened in the 2026-07-07 live incident, silently starving the queue. A background
poller must always come back. Also notable: `kill_signal = "SIGINT"` (matches the graceful
`loop.stop()` handler), `kill_timeout = "30s"`, and 1 GB memory because the Claude Agent SDK
spawns a Node CLI child per model call (512 MB was the prime suspect for the 2026-07-06
"exited with code 1" spawn failures).

---

## 2. Job lifecycle

```mermaid
sequenceDiagram
    participant App as App / chat tool (enqueue)
    participant DB as Postgres (agent_jobs)
    participant Loop as JobLoop (worker)
    participant H as Dispatcher / handler

    App->>DB: INSERT agent_jobs (status=queued, run_after=now, agent_run_id)
    loop every POLL_INTERVAL_MS
        Loop->>DB: rpc claim_next_agent_job(worker_id, stale_after, max_attempts)
        Note over DB: FOR UPDATE SKIP LOCKED<br/>queued OR stale-running job<br/>status=running, attempts+1
        DB-->>Loop: job row (or none -> sleep)
    end
    par heartbeat interval
        Loop->>DB: UPDATE heartbeat_at (claimed_by=me, status=running)
    and execute
        Loop->>H: handler(job) via createJobDispatcher
    end
    alt handler resolves
        Loop->>DB: UPDATE status=completed, last_error=null
    else handler throws
        H->>DB: agent_runs status=failed (markAgentRunFailed)
        Loop->>DB: rpc fail_agent_job(job, worker, error)
        alt attempts < max_attempts
            Note over DB: status=queued, run_after=now()+min(900, 2^(n-1)*30)s
        else final attempt
            Note over DB: status=failed_permanent
        end
    end
```

---

## 3. Dispatch — `worker/src/jobs/dispatch.ts`

`createJobDispatcher(options)` constructs every handler once and returns a `JobHandler` that
switches on `job.kind`. These are **all** the kinds that exist (anything else throws
`Unsupported job kind`):

| `job.kind` | Handler file | What it does |
|---|---|---|
| `canvas_section_analysis` | `worker/src/jobs/canvas-section-analysis.ts` | One BMC section analyzed by its section agent: builds legacy-format prompts, runs the Claude agent with the `bmc` MCP server in proposal mode, parses the structured output, completes the `agent_runs` row. |
| `workspace_chat` | `worker/src/jobs/workspace-chat.ts` | One chat reply in a workspace thread (section agent or Atlas). See §5. |
| `atlas_briefing` | `worker/src/jobs/atlas-briefing.ts` | Atlas "State of the Union": deterministic scoped queries assemble coverage/gaps/artifacts/competitors, one model call narrates them; coverage and change deltas are computed in code, never by the model (rule B1/B3). |
| `company_research` | `worker/src/jobs/company-research.ts` (`handle`) | Researches the user's own company from its URL: crawl/search feeds → claim extraction (budget route, escalation on failure) → adversarial verifier per claim (`verifyClaimAgainstExcerpt`) → evidence + canvas versions; thin sections get a `web_search_backfill` pass. |
| `competitor_research` | `worker/src/jobs/company-research.ts` (`handleCompetitor`) | Same verified pipeline pointed at a competitor entity; writes competitor-scoped canvas versions. |
| `feed_refresh` | `worker/src/jobs/feed-refresh.ts` | Refreshes one data feed through `FeedRunner`; refuses to run unless an **active `scheduled_loops` row authorizes** `feed_refresh:<feed_key>` for the account. |
| `gap_engine` | `worker/src/jobs/gap-engine.ts` | Deterministic (no model) competitor-gap computation: latest own canvas vs latest competitor canvas per section, token-overlap < 0.58 opens a scored gap; also computes the Threat Index (`competitor_gap_v1` / `threat_index_v1`). |
| `dossier_refresh` | `worker/src/jobs/knowledge-jobs.ts` (`handleDossierRefresh`) | Refreshes an agent dossier document only when watched sources yield new evidence ("never rewrite on vibes"); verifier spot-checks new claims before version++. |
| `summary_update` | `worker/src/jobs/knowledge-jobs.ts` (`handleSummaryUpdate`) | Rebuilds an agent's `atlas_summary` doc from its dossiers; budget route first, escalated route on validation failure; unparseable output on both is a **hard failure**, never an empty overwrite (RF-5A-1). |
| `grounding_suggest` | `worker/src/jobs/knowledge-jobs.ts` (`handleGroundingSuggest`) | Proposes real-world names for generic canvas items, each backed by an existing evidence excerpt and gated by the adversarial verifier; only `confirmed` candidates are upserted to `grounding_suggestions` for owner review. |
| `onboarding_extract` | `worker/src/jobs/knowledge-jobs.ts` (`handleOnboardingExtract`) | Parses a founder document (pdf-parse / mammoth), extracts owner-provided canvas facts + dossiers + owner questions, verifies each claim against its own excerpt, writes owner canvas versions, then enqueues a `grounding_suggest` follow-up. Failure marks the document `failed` instead of stranding it in `parsing` (RF-5A-5). |
| `skill_run` | `worker/src/jobs/skill-run.ts` | Runs one skill by `skill_key`: seven early skills are inlined (pricing teardown, avatar refinement, segment expansion, channel gap scan, channel economics, differentiator audit, proof gap scan); everything else resolves through `SKILL_REGISTRY` in `worker/src/jobs/skills/index.ts` (20 standalone modules sharing `skills/toolkit.ts`). Every skill ends in a typed `skill_artifacts` row with a verifier spot-check; unimplemented keys fail loudly. |
| `staleness_sweep` | `worker/src/jobs/staleness-sweep.ts` | Freshness maintenance: `fresh/unverified` canvas versions older than `stale_days` (default 30) → `stale`; `stale` older than `outdated_days` (default 90) → `outdated`. Never-verified rows are aged by `created_at` so a bare `.lt` doesn't skip them forever. |

Cross-cutting: the dispatcher wraps every handler in try/catch and on error calls
`markAgentRunFailed`, stamping the linked `agent_runs` row `failed` (scoped by
`agent_run_id` **and** `account_id`) before rethrowing so the queue retry machinery still runs.

---

## 4. Agent runtime — `worker/src/agent/`

### ClaudeAgentRunner (`runner.ts`)

The default `AgentRunner`. Wraps `query()` from `@anthropic-ai/claude-agent-sdk` with:

- `permissionMode: "bypassPermissions"`, `settingSources: []`, `persistSession: false`;
- `disallowedTools: ["Bash", "Write", "Edit"]` hard-coded — agents get only the MCP tools each
  job passes in via `allowedTools`;
- a rolling 20-entry stderr tail appended to any thrown error (2026-07-05/06 incident: CLI
  children died with only "exited with code 1");
- a non-`success` result subtype or a stream ending without a result message throws.

### OpenRouterChatRunner (`runner.ts`)

Plain chat-completions fallback runner (no tools, single system+user call) against
`openrouter.ai/api/v1/chat/completions`. Knowledge jobs and research pick a runner **per model
route**: `provider === "anthropic"` → ClaudeAgentRunner, `provider === "openrouter"` →
OpenRouterChatRunner, anything else throws (see `runnerForRoute` in `knowledge-jobs.ts`).

### Guardrails / hooks (`guardrails.ts`)

`createAgentHooks(context)` installs two `PreToolUse` hooks on every agentic run:

- **Audit**: logs `agent_tool_call` (account, run, kind, tool, summarized args) with secret-shaped
  keys (`token`, `api_key`, `service_role`, …) redacted and values truncated.
- **Evidence gate**: on `mcp__bmc__write_section_items`, any item with `confidence >= 0.7` and no
  `evidence_ids` is **denied** ("High-confidence canvas items require evidence_ids."). The same
  rule is enforced again inside the tool itself — defense in depth.

### Task limits (`limits.ts`)

`taskLimitsFromConfig` maps env to per-task budgets for `sectionAnalysis` and `workspaceChat`
(`maxTurns`, `taskBudgetTokens`, optional `maxBudgetUsd`). When `maxBudgetUsd` is unset, handlers
compute `budgetForRoute(route)` from the route's per-1k costs — chat budgets for ~150k input /
8k output tokens with a $0.75 floor, because the old ~$0.13 ceiling tripped
`error_max_budget_usd` mid-answer (incident RF-LIVE-19, 2026-07-06).

### Model routes

Routes live in the `model_routes` table (`provider`, `model_name`, `route_key`, `task_class`,
per-1k costs, optional `params`), global rows (`account_id IS NULL`) plus per-account overrides.
`chooseModelRoute(routes, accountId, routeKey, taskClass)` (exported from
`canvas-section-analysis.ts`) ranks candidates: account+route_key (0), account+task_class (1),
global+route_key (2), global+task_class (3).

**Anthropic-only rule for chat**: `WorkspaceChatHandler.loadModelRoute` filters candidates to
`provider === "anthropic"` before choosing, because chat runs on the Claude Agent SDK (MCP tools,
proposal mode) — profiles seeded with the legacy `standard` (xai/grok) route otherwise fed a Grok
model name to the Claude CLI, which replied with a model-not-found message *as the agent*
(incident RF-LIVE-8, 2026-07-06). Non-anthropic selections fall back to the anthropic
`workspace_chat` then `section_analysis` defaults; none configured is a hard error.

---

## 5. Chat — `worker/src/jobs/workspace-chat.ts`

Payload requires `thread_id`. The handler loads the thread (scoped to `job.account_id`), its
agent profile, an anthropic model route, up to 30 messages, enabled context sources, and the
company scope. Then prompt assembly forks:

- **Section agents** (`buildChatSystemPrompt`): profile instructions + chat discipline (no raw
  JSON/tool dumps in replies) + run_skill discipline + the shared `DATA_GAP_PROTOCOL` + company
  brief + the section's latest canvas snapshot (pre-loaded so the agent doesn't burn tool calls
  re-reading it) + the room's runnable skills **by exact key** — added after the 2026-07-07
  Vault/moat-audit incident where agents guessed keys, got denied, and hand-wrote the "skill" as
  a wall of chat text.
- **Atlas** (`agent_key === "orchestrator"`, `buildAtlasChatSystemPrompt`): no canvas section of
  its own — its prompt carries the cross-company board (coverage, gap summary, implemented
  skills) assembled by the *same* queries `atlas_briefing` uses (rule B1). It deliberately
  **drops** `profile.system_instructions`, because the legacy seeded persona mandated raw-JSON
  replies. Doctrine: one directed action at a time, direct users to rooms/skills that exist,
  never edit the canvas itself, verify completion against the database.

**Action-block contract**: when Atlas's single directed action is a room visit, the reply ends
with exactly one fenced block whose language is `action`, containing one JSON object:

````
```action
{"room":"<section_key>","action":"<one imperative sentence>","skill_key":"<key or null>","skill_title":"<title or null>","label":"<button label>"}
```
````

Nothing may follow the block; only listed rooms/skills are legal; it is the only exception to
the no-raw-JSON rule and the app replaces it with a real button.

The run executes with the `bmc` MCP server (`allowedTools: ["mcp__bmc__*"]`), proposal mode on,
and `allowSkillRuns: !isOrchestrator` (Atlas directs, section agents run). The reply passes
through `stripLeadingToolEcho` (drops a leading JSON-shaped echo only when >=40 chars of real
prose follow — owner finding 2026-07-06) before being inserted into `workspace_messages` and
completing the `agent_runs` row with tokens/cost.

### The bmc MCP toolset — `worker/src/tools/bmc-tools.ts`

`createBmcServer(client, ctx)` builds an in-process SDK MCP server named `bmc`. Every tool is
closed over `ctx.accountId` — the model never chooses the tenant.

| Tool | Behavior | Guards |
|---|---|---|
| `read_canvas` | Latest version of one section | Account + active-company context chain (`loadCompanyScope`), own-company rows only (`competitor_id IS NULL`). |
| `write_section_items` | Propose (or write) replacement items for a section | DENIED outside `ctx.ownSectionKey`; DENIED if `confidence >= 0.7` with no `evidence_ids`; in `proposalMode` returns a proposal instead of writing; on real writes the model-supplied `business_context_version_id` is ownership-verified first (Phase 6 fix). |
| `log_evidence` | Insert into `evidence_items` | Stamped with `ctx.accountId` + `created_by_agent_run_id`. |
| `open_gap` | Insert into `gaps` | Stamped with account + active context id from company scope. |
| `post_insight` | Insert into `insights` | Stamped with account/profile/run. |
| `read_competitor_canvas` | Latest competitor canvas per section | Account **and** active-company context chain — the era filter was missing until the Phase 6 tenancy sweep (the exact owner-reported bleed class). |
| `search_web` | Live web search via the cached `grok_live_search` feed | Cache key `tool:search_web:<query>`; degrades gracefully when `XAI_API_KEY` unset. |
| `firecrawl_scrape` | Scrape a URL via the cached `firecrawl_scrape` feed | Cache key `tool:firecrawl_scrape:<url>`; degrades when unset. |
| `run_skill` | Enqueue a `skill_run` job + pending `agent_runs` row | Registered **only** when `ctx.allowSkillRuns` (section-agent chat, never Atlas). Rules below. |

`run_skill` rules, in order:

1. **One per reply** — a closure flag (`skillRunStartedThisReply`) lives for one chat turn;
   a second call is DENIED ("Report the run you already started").
2. **Exact keys** — the key must exist in `skill_catalog` with `implemented = true`. A miss
   returns a *self-correcting denial* listing the room's real runnable keys (2026-07-07 incident:
   Vault guessed keys, gave up, hand-wrote the audit).
3. **Own room only** — `skill.agent_key` must equal `agent_${ctx.ownSectionKey}`; other rooms'
   skills are DENIED with a redirect instruction.
4. Requires an analyzed company (`scope.activeContextId`); and if the job insert fails after the
   run insert, the run is immediately marked `failed` so no pending run is ever left with no job
   behind it.

---

## 6. Tenancy law

The worker's Supabase client uses the **service-role key, which bypasses RLS entirely** — so
`account_id` scoping in worker code is the *only* tenant boundary. Three layers:

1. **Account scoping**: every query and insert carries `job.account_id` / `ctx.accountId`
   explicitly (the migration comment in `20260702110000` states it plainly: "The worker uses the
   service-role key, so RLS is not the concurrency boundary").
2. **Company-era scoping** — `worker/src/db/company-scope.ts` (mirror of
   `src/lib/company-scope.ts`; keep in sync). One account holds many companies over time; each
   analysis creates a `business_context_versions` row. `computeCompanyScope` partitions those
   rows into company "eras" (matched by normalized website domain first, company name second;
   anonymous ensure-rows inherit the nearest older named context's era) and returns the ACTIVE
   company's full `contextIds` chain. Every canvas/gap/competitor/briefing read filters
   `.in("business_context_version_id", scope.contextIds)` so opening Salesforce never surfaces
   Tier4's data (owner bug 2026-07-06).
3. **Payload ids are untrusted** — job payloads are written by the app but treated as hostile.
   The Phase 6 final QA sweep (docs/BUILD_STATE.md, "GOAL PHASE 6", 2026-07-07) found and fixed
   three worker holes: `read_competitor_canvas` missing the company-era filter;
   `write_section_items` trusting a model-supplied `business_context_version_id` (now verified
   to belong to the account before writing); and `knowledge-jobs` stamping a payload context id
   unverified (now `verifiedBusinessContextId()`, which throws
   "does not belong to the job account" on mismatch). The same sweep hardened RLS on the app
   side (migration `20260707200000`).

---

## 7. Feeds — `worker/src/feeds/`

`FeedRunner` (`feed-runner.ts`) is the single gateway to external data:

- **Feed config** comes from the `data_feeds` table (global row or per-account override,
  account row preferred), keyed by `feed_key`, carrying `config` and `ttl_seconds`.
- **Cache**: `feed_cache` upserts on `(account_id, feed_key, cache_key)`. Reads only return rows
  with `health = 'ok'` and `expires_at` in the future. Writes get `ttl_seconds` from the feed
  when healthy, or a short **300 s TTL when degraded/failing** so failures retry soon.
- **Fetchers** (`fetchers.ts`), keyed by `feed_key`: `firecrawl_scrape` (Firecrawl v2 scrape),
  `grok_live_search` (xAI live search), `fred_series` (FRED observations → metrics),
  `google_trends` (SerpAPI engine), `gdelt_count` (no key needed), `github_repo_stats`. Every
  fetcher returns `degraded(...)` instead of throwing when its API key is missing or the
  upstream call fails — tools and jobs surface `health`/`error` rather than crashing the run.

**Company-scoped cacheKey rule**: because `feed_cache` is keyed per account, any cached query
whose answer depends on *which company* is active must bake the company (and, where relevant, the
competitor set) into the cache key — e.g. skills use
`` `ecosystem_watch:${job.account_id}:${slug(companyName)}` `` and talent radar/velocity watch add
competitor slugs. Otherwise switching companies within the TTL replays the previous company's
cached excerpts (the skill tests assert the exact keys, e.g.
`worker/src/__tests__/skills/ecosystem-watch.test.ts`). Research runs and chat tools scope by URL
or query for the same reason.

`feed_refresh` jobs add an authorization gate: an active `scheduled_loops` row with
`action_key = feed_refresh:<feed_key>` must exist for the account, or the job fails.

---

## 8. Testing

Vitest suite under `worker/src/__tests__/` (`worker/vitest.config.ts`: node environment,
`src/**/*.test.ts`). Shape:

- **In-memory Supabase fakes per suite** — e.g. `FakeSupabaseClient`/`FakeQuery` in
  `bmc-tools.test.ts` and `canvas-section-analysis.test.ts`, `AtlasFakeClient` in
  `atlas-briefing.test.ts`. They emulate just enough postgrest chaining for the code under test.
- **Shared skill harness** — `worker/src/__tests__/skills/harness.ts`: `ScriptedSkillRunner`
  (scripted model output + verifier verdicts), `makeSkillJob`, and `SkillFakeClient`, whose
  fixtures deliberately plant a **newer row from a previous company era** (`ctx-0`) as a trap:
  any skill query that forgets company scoping picks the trap row and the assertion catches it.
- **Fixtures** — `worker/src/__tests__/fixtures/*.json` hold canned upstream responses for the
  fetcher tests (firecrawl, grok, FRED, GDELT, GitHub, Trends).
- **SQL integration test** — `queue-sql.integration.test.ts` runs real SQL against
  `WORKER_TEST_DATABASE_URL` (skipped when unset) to prove the claim RPC reaps stale
  final-attempt jobs.
- Unit coverage for the loop itself (`job-loop.test.ts`), guardrails, runner, chat
  (including `stripLeadingToolEcho`), company scope, gap engine, knowledge jobs, and one test
  file per skill module.

### Gates

Run from `worker/`; all four must be green before merging (these are the exact gates recorded in
`docs/BUILD_STATE.md` for the Phase 6 commit):

```sh
cd worker
npx tsc --noEmit     # typecheck
npx vitest run       # full suite (382 passed, 2 skipped at Phase 6)
npm run build        # tsc -p tsconfig.json
npx eslint src       # lint
```

`npm run dev` (tsx watch) runs the worker locally; deploys are `cd worker && flyctl deploy` with
secrets set via `flyctl secrets set` (see `worker/fly.toml` header comment and DEPLOY.md).
