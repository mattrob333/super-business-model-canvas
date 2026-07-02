# Spec 04 — Orchestration, Cascades & Scheduling

> The mechanics under Specs 01–03: how Atlas calls the nine, how work is scheduled, how
> multi-agent cascades produce reports and dashboard metrics, and the data-model additions
> that make it durable. Runtime engine per `AGENT_RUNTIME_DECISION.md` (Claude Agent SDK
> worker + Supabase as source of truth + pg_cron).

## 1. The orchestration protocol

Four primitives connect the ten agents. Everything else composes from these.

### 1a. Delegation (Atlas → section agent)
Atlas's `delegate_to_agent(agent_key, goal, context, action_key?)` tool:
1. Validates the target action's `orchestrator_can_trigger` flag (per-action toggle, Spec 02).
2. Inserts an `agent_jobs` row (`kind: delegation`, `parent_run_id` = Atlas's current run,
   `cascade_run_id` if inside a cascade) + a pending `agent_runs` row for the target.
3. Worker picks the job, runs the section agent **with its own profile, tools, and behavior
   settings** — a delegated run is identical to a human-triggered run except for
   `trigger_type: cascade` and the parent linkage.
4. On completion the result is written to `agent_runs.output`; a `delegation_completed` event
   resolves Atlas's pending card (Spec 03) and, if Atlas's run is still open, the result is
   fed back into its context.

Rules: **depth 1 only** (section agents cannot delegate — matches the seeded guardrail),
per-account concurrency cap (default 3, from `accounts.runtime_config.maxConcurrentRuns`),
per-delegation budget slice.

### 1b. The insight bus (section agents → Atlas, and each other)
`post_insight(severity, title, body, section_key, evidence_ids, tags)` → `insights` table.
- Severities: `info` · `notable` · `warning` · `critical`. `critical` insights (competitor
  price cut, key partner lost) also enqueue an immediate Atlas triage job — Atlas reacts in
  minutes, not at the next weekly sweep.
- Tags include `conflict` (disagreement with another section's stance — triggers a Conflict
  card, Spec 03), `opportunity`, `risk`, `delta` (competitor movement).
- Section agents *read* the bus (scoped query tool) so Compass can see Anchor's churn signal —
  but only Atlas turns insights into agenda items, briefs, or schedule changes.

### 1c. The agenda (Atlas → human)
`write_agenda_item(title, rationale, impact, effort, linked_gap_ids, linked_insight_ids)` →
`agenda_items`. Human Accept/Dismiss/Discuss (Spec 03). Dismissals store a reason and are
injected into Atlas's future context — the agenda learns the operator's taste.

### 1d. Approvals (any agent → outside world)
`propose_outreach` / canvas-change proposals / Atlas schedule changes → `approvals` table
(`status: pending/approved/declined`, payload jsonb, `expires_at`). The worker only executes
an outward action from an *approved* row. This is the hard propose-before-execute boundary.

## 2. Scheduling — who sets crons and how

One mechanism, three authors. All schedules are rows in the existing `scheduled_loops` table
(pg_cron ticks `scheduled-loop-tick` every 5 min; already wired).

| Author | Path | Guardrail |
|---|---|---|
| **Human** | ⏱ Schedule on any action card (Spec 02/03) | none needed |
| **Atlas — proposal** (default) | `schedule_loop(...)` with behavior `suggest` → approval row → human approves → loop created | shows in Approvals with rationale |
| **Atlas — autonomous** | allowed only when the target agent's `proactivity = act-on-schedule` **and** the action's `orchestrator_can_trigger` is on | bounded by loop + account budgets; every change posts an `info` insight ("I moved Yield's sweep to daily because…") |

Loop rows gain `action_key` (which skill/template/framework to run) and `created_by_agent`
(audit). Budget enforcement and failure-limits already exist in `scheduled-loop-tick`.
**Cadence tuning:** Atlas may propose cadence changes in response to conditions (price war →
daily sweeps; quiet quarter → monthly). The Schedules tab (Spec 03) is the single pane of
glass over every loop in the account.

## 3. Cascades — sequenced multi-agent workflows

A **cascade** is a named, versioned DAG of steps that produces a defined output (report,
metric refresh, agenda update). Cascades are data, not code — stored in `cascades` +
`cascade_steps`, executed by the worker, so new ones can be authored (eventually by Atlas
itself) without a deploy.

**Step shape:** `{ id, cascade_id, order_group, agent_key, action_key, input_template,
depends_on[] }`. Steps in the same `order_group` run in parallel (respecting the concurrency
cap); a step's input template can reference upstream step outputs (`{{steps.pricing_diff.output}}`).
Final steps are usually Atlas synthesis steps.

**Execution:** `run_cascade(cascade_key, params)` → `cascade_runs` row (status, per-step
statuses, total cost) → worker walks the DAG via the delegation primitive. Failures: a failed
step marks dependents `skipped`, the cascade completes `partial`, and Atlas's synthesis step
is told what's missing (a partial brief that says so beats a silent failure).

### Shipped cascade library (v1)

| Cascade | Steps (→ = depends) | Output | Default schedule |
|---|---|---|---|
| **Full Recon** | research refresh → all 9 section agents (parallel, 3 at a time) → gap engine → Atlas synthesis | refreshed canvas + gap register + Strategy Brief | manual / on onboarding |
| **Competitor Delta Sweep** | Yield pricing diff ∥ Forge claim diff ∥ Relay channel watch ∥ Envoy alliance watch ∥ Tempo velocity watch → gap engine delta → Atlas delta digest | "What changed this week" digest + Map delta badges | weekly |
| **Board Pack** | metric refresh → each agent's section summary → Atlas board memo (template) | board-ready PDF | monthly |
| **Pricing War Response** | Yield deep pricing analysis → Ledger margin floor → Compass price-sensitivity read → Atlas options memo (hold/match/reframe) | decision memo + agenda items | triggered by Yield `critical` insight |
| **Unit Economics Duet** | Yield revenue model ∥ Ledger cost model → joint unit-econ report | LTV/CAC/margin report + dashboard metrics | monthly |
| **Launch Readiness** | Forge positioning ∥ Relay channel plan ∥ Anchor onboarding readiness ∥ Tempo ops check → Atlas go/no-go brief | readiness scorecard | manual |
| **Cost-Down Sprint** | Ledger savings candidates → Vault/Tempo feasibility checks → Atlas ranked savings plan | cost-down brief + agenda items | quarterly |

## 4. Outputs — where cascade/agent work lands

- **Documents** (`generated_reports`, extended with `source_cascade_run_id`): briefs, memos,
  one-pagers, board packs. Viewable in-app (drawer), exportable to PDF.
- **Frontend data**: canvas section versions (via approved proposals or direct agent writes
  within confidence rules), `gaps`, `insights`, `agenda_items`, partner-prospect pipeline.
- **Dashboard metrics** (`metric_snapshots`): worker writes typed snapshots
  (`metric_key`, `section_key?`, `value numeric`, `label`, `computed_at`, `inputs jsonb`) —
  section health scores, overall Strategic Health, unit-econ numbers, sentiment trend,
  velocity comparison. Dashboard tiles and the War Room Map read snapshots only — **no
  metric math in the frontend** (the Dashboard formula shipped 2026-07-02 migrates into the
  worker when this lands).
- **Forms**: survey/questionnaire drafts (Compass, Anchor) stored as documents with a
  shareable-form flag (v2: hosted form links).
- **Outreach**: drafts only, via Approvals (Envoy partner intros, Anchor customer check-ins,
  Compass discovery invites).

## 5. Data-model additions (one migration series)

```sql
-- messaging & rooms
workspace_threads   (id, account_id, agent_profile_id, title, created_by, created_at, archived)
workspace_messages  (id, thread_id, role, kind,           -- text|tool_call|artifact|proposal|delegation
                     content jsonb, agent_run_id?, created_at)
context_sources     (id, account_id, agent_profile_id, thread_id?, type,   -- file|url|evidence_query|note
                     name, uri, config jsonb, enabled, refreshed_at, created_by, created_at)

-- orchestration
insights            (id, account_id, agent_profile_id, severity, title, body,
                     section_key?, tags text[], evidence_ids uuid[], agent_run_id?,
                     read_at?, created_at)
agenda_items        (id, account_id, title, rationale, impact, effort, rank,
                     status,                                -- proposed|accepted|dismissed|done
                     dismissed_reason?, linked_gap_ids uuid[], linked_insight_ids uuid[],
                     created_by_agent_run_id?, created_at, updated_at)
approvals           (id, account_id, kind,                  -- outreach|canvas_change|schedule_change
                     payload jsonb, status, requested_by_agent_profile_id,
                     decided_by?, decided_at?, expires_at?, created_at)
agent_jobs          (id, account_id, kind, payload jsonb, status, attempts,
                     agent_run_id?, parent_run_id?, cascade_run_id?, created_at)

-- cascades
cascades            (id, account_id?,                       -- null = template library
                     cascade_key, name, description, output_kind, version, enabled)
cascade_steps       (id, cascade_id, step_key, order_group, agent_key, action_key,
                     input_template jsonb, depends_on text[])
cascade_runs        (id, account_id, cascade_id, status,    -- running|completed|partial|failed
                     step_states jsonb, total_cost, triggered_by, started_at, completed_at)

-- metrics & audit
metric_snapshots    (id, account_id, metric_key, section_key?, value numeric, label,
                     inputs jsonb, computed_at)
agent_profile_revisions (id, agent_profile_id, system_instructions, behavior jsonb,
                     changed_by, created_at)

-- column additions
agent_profiles      + behavior jsonb, avatar jsonb           -- {icon, accent}
agent_skills        + orchestrator_can_trigger bool, action_kind  -- skill|template|framework
scheduled_loops     + action_key text, created_by_agent bool
generated_reports   + source_cascade_run_id uuid, account_id uuid  -- fixes user-vs-account scoping
```

All account-scoped with the standard RLS pattern (`is_account_member`). Realtime enabled on
`insights`, `agent_runs`, `agenda_items`, `metric_snapshots`, `cascade_runs`.

## 6. Build sequencing (slots into ROADMAP)

1. **Phase 2 (worker)** carries: `agent_jobs`, delegation primitive, `workspace_threads/messages`
   (chat through the worker).
2. **Phase 3–4** carry: `insights`, `metric_snapshots` (research + gap engine write them),
   `context_sources`.
3. **Phase 5 (section workspaces)** carries: Spec 02 UI, `agent_profile_revisions`, behavior
   settings, action cards + schedule popover.
4. **Phase 6 (War Room)** carries: Spec 03 UI, `agenda_items`, `approvals`, `cascades/*`,
   the v1 cascade library, conflict cards.
5. **Phase 7** carries: digests, Atlas-authored cascades, autonomous cadence tuning.

## 7. Guardrails (system-wide, enforced in the worker, restated once)

Depth-1 delegation only · every run durable in `agent_runs` · evidence-or-low-confidence on
canvas writes · outward actions only through approved `approvals` rows · budgets at loop,
cascade, and account level · section agents never write outside their section · Atlas never
does section-level analysis itself.
