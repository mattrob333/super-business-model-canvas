# Super BMC Agent Workspaces — Overview & Reading Guide

> Written: July 2026. The explainer for the workspace era of Super BMC: ten agents, ten rooms,
> one shared canvas. Read this first; the numbered specs carry the detail.

## The mental model in five sentences

The **Business Model Canvas is the shared source of truth** — nine sections in Postgres,
versioned, evidence-linked, and every agent and screen reads and writes *that*, never a copy.
**Nine domain-expert agents** each own one section the way an executive owns a function: their
own workspace, tools, standing orders, and outputs. **Atlas, the chief strategist**, owns no
section — it owns the *whole board*: it reads everything the nine surface, arbitrates their
conflicts, runs playbooks and cascades, keeps the "Next Moves" agenda, and briefs the human.
Work happens in **workspaces** — full-screen rooms where a human collaborates with one agent —
and flows between rooms through four primitives: delegation, insights, agenda, approvals.
The system runs on a cadence even when nobody is looking, and everything outward-facing stops
at a human approval queue.

## The cast

| Room | Agent | Owns |
|---|---|---|
| War Room ★ | **Atlas** — Chief Strategist | strategy, agenda, briefs, cascades, schedules |
| Workspace | **Compass** — Market Intelligence | Customer Segments |
| Workspace | **Forge** — Product Value | Value Propositions |
| Workspace | **Relay** — Distribution | Channels |
| Workspace | **Anchor** — Customer Success | Customer Relationships |
| Workspace | **Yield** — Monetization | Revenue Streams |
| Workspace | **Vault** — Assets & Capabilities | Key Resources |
| Workspace | **Tempo** — Operations | Key Activities |
| Workspace | **Envoy** — Alliances | Key Partners |
| Workspace | **Ledger** — Cost & Efficiency | Cost Structure |

## How a signal becomes strategy (the loop, end to end)

1. **Tuesday 06:00** — Yield's scheduled pricing sweep (a `scheduled_loops` row, pg_cron)
   diffs competitor pricing pages via Firecrawl. Acme cut their Pro tier 20%.
2. Yield logs the evidence, posts a **critical insight** to the bus, and updates its section's
   competitor delta.
3. The critical insight enqueues an immediate **Atlas triage**. Atlas fires the *Pricing War
   Response* cascade: Yield deep-dive ∥ Ledger margin floor ∥ Compass price-sensitivity read,
   then synthesizes an options memo (hold / match / reframe).
4. **06:20** — the War Room Map shows Revenue Streams tinted warm with a `▼ vs Acme` badge;
   the agenda has a new #1 ("Respond to Acme price cut — options attached"); the memo sits in
   Atlas chat as a brief card; a proposed schedule change ("move pricing sweep to daily")
   waits in Approvals.
5. **08:00** — the human opens the War Room, reads the memo, accepts the agenda item, approves
   the daily cadence, and asks Atlas one question in chat before standup.

Nothing in that flow required the human to remember to check anything — and every claim in
the memo links back to a scraped page with a timestamp.

## The specs

| Doc | What it defines |
|---|---|
| **[01_AGENT_ROSTER.md](./01_AGENT_ROSTER.md)** | All ten agents: callsigns, personas, tools, outputs, standing orders, synergy map |
| **[02_SECTION_WORKSPACE.md](./02_SECTION_WORKSPACE.md)** | The full-screen section room: identity + context rail, chat, actions panel, behavior settings |
| **[03_ORCHESTRATOR_WORKSPACE.md](./03_ORCHESTRATOR_WORKSPACE.md)** | The War Room ★: the BMC command Map, Atlas chat, agenda, insight feed, cascades & approvals rails |
| **[04_ORCHESTRATION_AND_CASCADES.md](./04_ORCHESTRATION_AND_CASCADES.md)** | The mechanics: delegation, insight bus, scheduling authorship, cascade DAGs, outputs, data model, guardrails |

Companions: [`../VISION.md`](../VISION.md) (why this wins), [`../AGENT_RUNTIME_DECISION.md`](../AGENT_RUNTIME_DECISION.md)
(the engine: Claude Agent SDK worker + Supabase + pg_cron), [`../ROADMAP.md`](../ROADMAP.md)
(phases — these specs land in Phases 2–6), [`../DEVLOG.md`](../DEVLOG.md) (state of the repo).

## Design principles (apply to every screen in the suite)

1. **The canvas is the centerpiece.** Rooms display and edit slices of it; the War Room Map *is*
   it. No screen invents a second truth.
2. **Serious, calm, enterprise.** 8px radii, restrained accent per agent, no gimmicks. Trust is
   the product.
3. **Show the work.** Tool calls, citations, and delegation cards are visible. An agent that
   hides its process is indistinguishable from one that makes things up.
4. **Propose before execute.** Agents draft; humans approve anything outward or destructive.
5. **Durable everything.** Every run, message, insight, and decision is a Postgres row. Close
   the laptop for five days; the system's memory is intact and the work continued.
