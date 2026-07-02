# Spec 03 — The War Room (Atlas's Workspace)

> Where the orchestrator lives. The marquee feature of Super BMC: a full-screen strategy
> command center where the human and Atlas run the company's direction together. The Business
> Model Canvas remains the centerpiece and shared source of truth — the War Room is built
> *around* it, literally.

## Design intent

Every other room in the app belongs to a specialist. This room belongs to the **company**.
It should feel like the best strategy war rooms do: the whole battlefield visible at a glance,
the chief strategist at your side, and every claim traceable to evidence. Visual register:
darker, calmer, more cinematic than the section rooms — same 8px enterprise system, but the
canvas map gets room to breathe and the indigo accent is reserved for Atlas alone. If a VC
screenshots one screen of this product for their partner meeting, it's this one.

## Route & entry

- Route: `/war-room`. Nav: first item in the sidebar after Dashboard, labeled **War Room** with
  Atlas's avatar; also reachable from the 10th stop of the workspace switcher (Spec 02) and via
  a persistent "Ask Atlas" affordance in the top bar app-wide (opens War Room with composer
  focused).
- The Dashboard remains the passive at-a-glance page; the War Room is the *active* room. The
  Dashboard's Strategic Health tile deep-links here.

## Layout

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ top bar: ⌂ · [switcher] · COMPANY NAME — WAR ROOM ················· account    │
├──────────────┬──────────────────────────────────────────────┬──────────────────┤
│ LEFT (3)     │            CENTER (6)                        │ RIGHT (3)        │
│              │                                              │                  │
│ ┌──────────┐ │  ┌──────── THE MAP (collapsible) ─────────┐  │ [Playbooks]      │
│ │ ◉ ATLAS  │ │  │      live BMC command view             │  │ [Cascades]       │
│ │ Chief    │ │  │  ┌────┬────┬────┬────┬────┐            │  │ [Schedules]      │
│ │ Strategist│ │  │  │ EN │ TE │ FO │ AN │ CO │  9 tiles,  │  │ [Digests]        │
│ │ ● watch  │ │  │  │ ◉  │    │ ⚡ │    │ ◉  │  health-   │  │                  │
│ │      ⚙︎  │ │  │  ├────┼────┤    ├────┼────┤  tinted,   │  │ ┌─ cascade ────┐ │
│ └──────────┘ │  │  │ VA │    │    │    │ RE │  agent     │  │ │ Competitor   │ │
│              │  │  └────┴────┴────┴────┴────┘  chips,    │  │ │ Delta Sweep  │ │
│ NEXT MOVES   │  │  │  LEDGER   │   YIELD    │  gap dots  │  │ │ ▷ Run ⏱ Wed  │ │
│ 1. ▲ Reprice │  │  └───────────┴────────────┘            │  │ │ 6 steps      │ │
│    tier 2    │  │   [health 74 ▂▃▅] [4 gaps] [2 running] │  │ └──────────────┘ │
│ 2. Partner   │  └────────────────────────────────────────┘  │                  │
│    with X    │                                              │ DELEGATIONS      │
│ 3. …         │  ┌──────── ATLAS CHAT ────────────────────┐  │ · Yield ⟳ 0:42   │
│              │  │  strategy conversation:                 │  │ · Forge ✓ done   │
│ INSIGHT FEED │  │  briefs · delegation cards · framework  │  │ · Envoy ⏱ queued │
│ · Yield: ⚠   │  │  reports · conflict resolutions         │  │                  │
│   Acme -20%  │  │                                         │  │ APPROVALS (2)    │
│ · Envoy: X   │  │  ┌ composer /delegate /cascade /brief ┐ │  │ · outreach draft │
│   signed Y   │  │  └─────────────────────────────────────┘ │  │ · canvas change  │
└──────────────┴──────────────────────────────────────────────┴──────────────────┘
```

Center column is a vertical split: **The Map** (top, collapsible to a slim health strip) and
**Atlas chat** (bottom, takes remaining height). Collapsing the Map gives a full-height
strategy chat; expanding it gives the map two-thirds of the column for deep review. The split
position persists per user.

## The Map — the BMC as command view (centerpiece)

The classic 9-block canvas layout (same grid placement as `section-types.ts`), rendered as a
**live heatmap**, not a document:

- **Tile tint** = section health, computed per section (weighted: avg item confidence,
  freshness, open gap severity, competitor delta). Healthy = neutral surface; degrading =
  progressively warmer tint. Colorblind-safe ramp; score number available on hover.
- **Agent chip** (avatar, bottom-right of tile): status ring — pulsing = running now,
  ⏱ = scheduled soon, ⚠ = needs attention. Hover = last run summary + next run time.
- **Gap dots** (top-right): up to 3 severity-colored dots; click → gaps drawer filtered to
  section.
- **Delta badges**: when the competitor gap engine (ROADMAP Phase 4) detects a section where a
  named competitor is outpacing, a small `▼ vs Acme` badge appears.
- **Click a tile** → radial quick-menu: *Enter workspace* (→ Spec 02 room) · *Ask Atlas about
  this* (inserts section reference into composer) · *Run section refresh* (delegates).
- **Map footer strip**: overall Strategic Health score + 30-day sparkline · open gaps count ·
  runs in flight · evidence freshness %. This strip *is* the collapsed state of the Map.
- **Modes** (segmented control, top-right of Map): **Health** (default) · **Freshness** ·
  **vs Competitor** (pick competitor → per-section win/lose/tie tinting) · **Activity**
  (last-7-days agent runs density). These are the "quick glance strategy / directional
  real-time battle" views.

The Map reads the same tables everything else writes (`canvas_section_versions`, `gaps`,
`agent_runs`, `scheduled_loops`, `metric_snapshots`) — it is a *view* of the shared source of
truth, never a copy.

## Left rail

- **Atlas identity block** — same component as Spec 02 (avatar, callsign, status, ⚙︎ settings
  sheet with Atlas's system instructions + behavior + budget). Atlas's context sources include
  every section, all competitor canvases, the gap register, and the insight bus — shown
  read-only ("Atlas sees: 9 sections · 3 competitors · 12 sources").
- **Next Moves** — the ranked agenda (`agenda_items`, Spec 04). Each: title, impact/effort
  chips, "because" line linking to gaps/insights/evidence. Actions: Accept (→ tracked),
  Dismiss (with reason — feeds Atlas's learning), Discuss (→ composer). Atlas re-ranks after
  material events; a subtle "updated 2h ago by Atlas" stamp keeps it honest.
- **Insight feed** — the live wire: latest `insights` from all nine agents (severity-tagged,
  clickable through to source run/evidence). This is where "Yield: Acme cut Pro tier 20%"
  appears minutes after the pricing watcher fires.

## Atlas chat (center-bottom)

Same thread system as Spec 02 with Atlas-specific message cards:

- **Delegation card** — when Atlas farms work out: agent avatar, goal, status (queued/running/
  done), and on completion an inline result summary + "open in [agent] workspace" link. A
  cascade shows as a **stacked delegation card** with per-step progress.
- **Brief card** — generated strategy briefs/board memos: executive summary inline, full doc in
  the drawer viewer, "export PDF" (html2pdf exists) and "save to Reports".
- **Framework card** — a run framework (SWOT/Porter/…) rendered as its native shape (2×2 grid,
  five forces, etc.) populated with cited canvas data — not a wall of text.
- **Conflict card** — when two agents disagree (e.g. Forge wants premium positioning, Yield
  sees price sensitivity): both positions side-by-side with evidence, Atlas's recommendation,
  and Accept/Override buttons. Overrides are recorded — the human is the final strategist.
- **Composer slash commands**: `/delegate yield "refresh pricing matrix"`, `/cascade board-pack`,
  `/brief weekly`, `/frame swot`, `/schedule envoy prospect-refresh monthly`, `/focus channels`
  (sets a strategy focus that biases agenda ranking and loop cadences).

## Right rail

Tabs: **Playbooks · Cascades · Schedules · Digests**.

- **Playbooks** — full cross-section framework library (the section rooms only see their slice).
  Run → framework card in chat.
- **Cascades** — the multi-agent sequences (defined in Spec 04): card shows step count, last
  run, est. cost/duration; ▷ Run · ⏱ Schedule · view DAG (drawer with per-step status for the
  last run).
- **Schedules** — the account's entire cron surface in one place: every `scheduled_loops` row
  across all ten agents, grouped by agent, with pause/edit; plus Atlas-proposed schedule changes
  awaiting approval ("Atlas suggests moving Yield's pricing sweep to daily during the Acme price
  war — Approve / Decline").
- **Delegations** (persistent below tabs) — everything in flight across the fleet right now.
- **Approvals** (persistent, badge-counted) — the propose-before-execute queue: outreach drafts,
  canvas-change proposals, schedule changes. Nothing external ever leaves without passing
  through this list.

## How Atlas triggers things (the contract, in UI terms)

1. Human asks in chat, or an insight/schedule fires → Atlas reasons in the thread.
2. Atlas calls `delegate_to_agent` / `run_cascade` → delegation card appears; the target
   agent's workspace simultaneously shows the delegation notice (Spec 02) — full transparency,
   both rooms see the same event.
3. Results flow back as insights + completed delegation cards; Atlas synthesizes; agenda/Map
   update in place.
4. Anything outward-facing or destructive stops in Approvals.

## States

- **First visit**: the Map renders from the existing analysis immediately (even before any agent
  has run — tiles tint from confidence data). Atlas introduces itself with a genuine reading of
  the canvas: top 3 observations, 1 suggested cascade, 1 suggested schedule. The room is never
  empty because the canvas already exists.
- **Quiet state**: nothing running → Map calm, feed shows last 24h, Atlas status "watching".
- **Battle state**: cascade running → Map tiles pulse as their agents work; delegations rail
  fills; this is the demo moment.

## Build notes

- Shares all Spec 02 components; new: `WarRoomMap` (+ `MapTile`, `MapFooterStrip`, mode control),
  `AgendaPanel`, `InsightFeed`, `DelegationCard`, `BriefCard`, `FrameworkCard`, `ConflictCard`,
  `ApprovalsQueue`, `CascadeCard`.
- The Map's health computation runs server-side (worker writes `metric_snapshots` per section
  after relevant events) so the frontend only reads — keeps the map instant and the formula
  centrally versioned.
- Realtime: subscribe (Supabase Realtime) to `agent_runs`, `insights`, `agenda_items`,
  `metric_snapshots` for live pulse without polling.
- Ship order within this spec: Map (read-only) → Atlas chat with delegation cards → agenda +
  insight feed → cascades/approvals rails. A read-only Map + working chat is already a credible
  marquee.
