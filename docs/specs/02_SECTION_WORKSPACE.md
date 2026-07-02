# Spec 02 — Section Agent Workspaces

> The full-screen room you enter when you click a BMC section. One workspace per section agent
> (nine total). Serious, well-crafted, built for real human+agent collaborative work — not a
> chat popup. Atlas's workspace (the War Room) is Spec 03; it shares components with this spec.

## Design intent

Walking into a section workspace should feel like walking into a **domain expert's office**:
their name on the door, their working files on the desk, the section's live canvas on the wall,
and a bench of instruments (skills/templates/frameworks) they actually use. The tone is
enterprise-calm: 8px radii, generous whitespace, the agent's accent color used sparingly
(avatar ring, active states, primary buttons) — never neon, never gimmicky.
Light-mode page canvases use the established subtle grid background; cards remain white,
bordered, and lightly shadowed above that texture.

## Route & entry

- Route: `/workspace/:sectionKey` (e.g. `/workspace/revenue_streams`). `/agents/:agentKey`
  detail page gains an "Enter workspace" primary action.
- **Two-tier entry from the Canvas page.** Clicking a section card opens the existing side
  sheet demoted to a **peek drawer**: agent avatar + name + status at the top, the section's
  items with confidence dots and evidence chips, and the plain bullet editor for ten-second
  manual fixes. The drawer's AI chat is **removed** — in its place a single primary button,
  "Open ⟨Agent⟩'s workspace →", which navigates here. Rationale: quick edits shouldn't cost a
  navigation; conversations shouldn't happen against the stateless `bmc-chat` path when the
  real agent (queued runtime, tools, evidence discipline) exists. Glance/edit in the drawer;
  go deep in the workspace.
- Full screen: workspace renders **outside the AppShell content column** — it keeps only a slim
  top bar (workspace switcher, back-to-canvas, account). Sidebar collapses to icon rail.
- Workspace switcher: a compact 9-dot BMC mini-map in the top bar lets you jump between agent
  rooms without going back to the canvas. Atlas's War Room is the tenth, visually distinct stop.

## Layout (three zones, 12-col grid)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ top bar: ⌂ Canvas · [9-dot switcher] ····························· account   │
├───────────────┬──────────────────────────────────────────┬───────────────────┤
│ LEFT RAIL (3) │            CENTER — CHAT (6)             │ ACTIONS PANEL (3) │
│               │                                          │                   │
│ ┌───────────┐ │  Thread header: topic + participants     │  [Skills]         │
│ │ ◉ YIELD   │ │                                          │  [Templates]      │
│ │ Head of   │ │  ┌ agent message ──────────────────┐     │  [Frameworks]     │
│ │ Monetiz.  │ │  │ …streamed text, citations [1][2] │     │  [Schedules]      │
│ │ ● active  │ │  └──────────────────────────────────┘     │                   │
│ │      ⚙︎   │ │  ┌ tool call card ─────────────────┐     │  ┌─ action card ─┐ │
│ └───────────┘ │  │ ▸ firecrawl_scrape(stripe.com/…) │     │  │ Pricing Diff  │ │
│               │  └──────────────────────────────────┘     │  │ ▷ Run  ⏱ Cron │ │
│ SECTION       │  ┌ artifact card ──────────────────┐     │  │ ☑ Atlas may   │ │
│ CANVAS        │  │ 📄 Pricing Intel Report · open   │     │  │   trigger     │ │
│ · item ●0.9  │  └──────────────────────────────────┘     │  └───────────────┘ │
│ · item ●0.7  │                                          │                   │
│ · item ○0.4  │  ┌ human message ──────────────────┐     │  RUN QUEUE        │
│ [+ add]       │  └──────────────────────────────────┘     │  · Pricing Diff   │
│               │                                          │    running 0:42   │
│ CONTEXT       │  ┌────────────────────────────────────┐  │  · Fit Audit      │
│ SOURCES       │  │ composer  [/] slash · attach · send │  │    Mon 9:00 ⏱    │
│ · 📄 file     │  └────────────────────────────────────┘  │                   │
│ · 🔗 url      │                                          │                   │
│ · 🧾 evidence │                                          │                   │
│ [+ add]       │                                          │                   │
└───────────────┴──────────────────────────────────────────┴───────────────────┘
```

Breakpoints: ≥1280px three columns (3/6/3). 1024–1279px: actions panel becomes a right drawer
(toggle in top bar). <1024px: single column, left rail collapses into the thread header, actions
behind a floating button. The workspace is desktop-first; mobile gets a functional but simplified
read/chat experience.

## Zone 1 — Left rail (identity, canvas, context)

### 1a. Agent identity block (top-left, per the requirement)
- Avatar (icon motif on accent-tinted disc, 48px), **callsign** in semibold, role title in
  muted text, live status chip: `● active` (in a run) / `○ idle` / `⏱ scheduled — next run in 2h`
  / `⚠ needs attention` (failed run or budget exhausted).
- **⚙︎ behavior & prompt** — the "subtle" settings entry point: a quiet ghost icon-button that
  opens a right **Sheet** (not a modal — you keep seeing the room) with:
  - **System instructions** editor (monospace textarea, edits `agent_profiles.system_instructions`,
    versioned: keep last 10 in `agent_profile_revisions`; "restore" per revision).
  - **Behavior settings** (writes `agent_profiles.behavior`): proactivity (observe / suggest /
    act-on-schedule), risk posture, verbosity, evidence bar (min confidence slider).
  - **Model route** select (existing `model_routes` tiers) and **monthly budget** input.
  - **Danger zone**: pause agent, reset to template instructions.
  - All changes take effect on the *next* run; an inline note says so.

### 1b. Section canvas panel
The section's live items from `canvas_section_versions` — because the BMC stays the shared
source of truth, it is physically present in the room:
- Each item: text, confidence dot (● ≥0.7 solid in accent, ○ <0.7 hollow), evidence count
  badge (click → evidence popover: source, date, excerpt, link), freshness tint (stale items
  desaturate).
- Inline edit / add / archive (writes a new section version; human edits get `created_by` user,
  full audit trail preserved).
- "Discuss" hover action per item → inserts the item into the composer as a quoted reference.
- Header shows section title + tiny trend sparkline (item count / avg confidence over versions).

### 1c. Context sources panel ("files under the avatar", per the requirement)
The agent's working set — what it reads on every run. The **Company Brief** (the company
name/industry/description/products block edited today via `BusinessOverviewSheet`) is always
the first row — read-only here, every agent receives it on every run; clicking it opens the
brief in the drawer viewer. The rest is backed by new `context_sources` table
(Spec 04): 
- Types: **file** (uploaded to Supabase Storage: PDFs, CSVs, decks), **url** (watched page —
  optionally re-scraped on schedule), **evidence collection** (saved filter over
  `evidence_items`), **note** (pinned human guidance, e.g. "we will never compete on price").
- Row: type icon, name, freshness stamp, on/off toggle (excluded sources stay listed but dim).
- `[+ add source]` → dialog with tabs File / URL / Evidence / Note.
- Sources are injected into the agent's context on every run and cited as `[S1]`-style refs
  in chat, distinguishable from web evidence `[1]` refs.

## Zone 2a — Instrument strip (what makes each room unique)

**One chassis, unique instruments.** The frame above (left rail / center / actions) is
identical in all nine rooms — users learn it once. What makes Yield's office feel nothing
like Compass's is the **instrument strip**: a collapsible row of 2–4 domain modules pinned to
the top of the center column, above the thread header. Instruments are shared components
(stat tile, trend sparkline, watchlist, delta board) configured per agent — same grid slots,
different modules — reading `metric_snapshots`, `evidence_items`, and `gaps` filtered to the
section. They are read-only views of what the agent's feeds and runs have produced; clicking
any instrument inserts its subject into the composer as a quoted reference.

| Agent | Instruments (v1) |
|---|---|
| Compass | segment cards (size/fit) · Google Trends interest sparkline · segment-drift alert |
| Forge | differentiation matrix vs competitors · review-mining sentiment tile · feature-gap count |
| Relay | share-of-voice trend (GDELT/social) · channel mix bar · competitor content cadence |
| Anchor | review/NPS-proxy sentiment trend · churn-signal watchlist · community activity tile |
| Yield | competitor pricing delta board · unit-economics tiles · pricing-change event feed |
| Vault | resource/dependency health list · hiring-signal tile (careers scrapes) · tech-stack watch |
| Tempo | ship-velocity tile (changelog/GitHub feeds) · launch-readiness checklist · activity coverage |
| Envoy | partner watchlist w/ latest news · partnership-opportunity feed · ecosystem count |
| Ledger | cost-line tiles · FRED macro overlay (rates/CPI) · cost-down opportunity count |

Empty state per instrument: a quiet "no data yet — runs on ⟨feed cadence⟩" placeholder, never
a fake chart. The strip collapses to a one-line summary chip row; collapsed state persists
per user per room.

## Zone 2 — Center chat (the collaboration surface)

- **Threads, not one endless scroll.** Thread list behind the header dropdown; new thread per
  topic ("Q3 repricing", "Segment drift investigation"). Backed by `workspace_threads` +
  `workspace_messages` (Spec 04) — persistent, resumable, account-scoped. Default thread:
  "Open floor".
- **Message types** (all first-class cards, not text blobs):
  - *Agent text* — streamed, markdown, with citation chips (`[1]` → evidence popover).
  - *Tool call* — collapsed card: tool name + arg summary, expandable to result preview.
    Builds trust; this is where "serious" is earned.
  - *Artifact* — a produced doc/report/table: title, type icon, "open" (drawer viewer) and
    "save to Reports". Artifacts persist as `generated_reports` or `documents`.
  - *Proposal* — when the agent wants to change the canvas or send outreach: a diff-style card
    (before/after items, or the outreach draft) with **Approve / Edit / Decline** buttons.
    Approving writes the canvas version or queues the outreach. This is the
    propose-before-execute guardrail made visible.
  - *Delegation notice* — when Atlas triggered work here: "⚡ Atlas requested: refresh pricing
    matrix (cascade: Competitor Delta Sweep)" with link to the parent cascade run.
  - *Human* message — with attach (files become context sources scoped to the thread).
- **Composer**: multiline, `Enter` to send, `⇧Enter` newline. **Slash commands** map to the
  actions panel: `/run pricing-diff`, `/schedule fit-audit weekly`, `/frame porter`, `/canvas add`.
  Typeahead popover lists available actions. Attach button, and a subtle model-route indicator.
- While the agent runs: inline status ("Yield is scraping 3 pricing pages… 0:42") with cancel.
  Chat runs are `agent_runs` rows (`run_type: workspace_chat`) — same durability as everything.

## Zone 3 — Actions panel (right)

Tabbed: **Skills · Templates · Frameworks · Schedules**. All contents come from the DB
(`agent_skills` for skills; `frameworks` filtered by section relevance; new `templates` type),
preloaded per agent per the roster (Spec 01).

- **Action card**: name, one-line description, est. cost/duration chip, and three controls:
  - **▷ Run** — executes now, output lands in the chat as tool-call + artifact cards.
  - **⏱ Schedule** — popover: preset cadences (daily / weekly Mon 9:00 / monthly 1st) or raw
    cron; writes `scheduled_loops` (loop per action per agent). Existing schedule shows as a
    filled chip with next-run time; click to edit/pause.
  - **☑ Atlas may trigger** — per-action toggle (`orchestrator_can_trigger`); when on, this
    action is callable by Atlas's `delegate_to_agent` / cascades without human initiation.
- **Skills** = agent procedures ("Pricing Diff Sweep", "Review Mining Pass", "Partner Prospect
  Refresh") — the domain tools from Spec 01 packaged with instructions.
- **Templates** = document scaffolds ("Positioning One-Pager", "Cost-Down Brief", "ICP Card") —
  run = generate the doc from current canvas + evidence.
- **Frameworks** = the playbook library scoped to this section (e.g. Yield sees Pricing
  frameworks + unit economics; the full cross-section frameworks live with Atlas).
- **Run queue** (bottom, persistent): in-flight runs with elapsed time, then upcoming scheduled
  runs with countdown. Failed runs show ⚠ with retry. Mirrors `agent_runs` + `scheduled_loops`.

## States

- **First visit (empty)**: identity block present; canvas panel shows section items from the
  analysis; chat shows a tailored agent intro ("I'm Yield. I watch pricing, packaging and unit
  economics. Here's what I can see so far…" + 2–3 evidence-based observations + 3 suggested
  first actions as buttons). No blank-page paralysis.
- **Agent working**: status chip pulses in accent; run queue animates; composer stays usable
  (queue follow-ups).
- **Degraded**: runtime unreachable → banner "Runtime offline — chat and runs paused; canvas and
  history remain available" (read-only still works because the DB is the source of truth).

## Component inventory (build once, share with Spec 03)

`AgentIdentityCard`, `AgentSettingsSheet`, `SectionCanvasPanel`, `ContextSourcesPanel`,
`WorkspaceThread` (+ `MessageCard` variants: text/tool/artifact/proposal/delegation),
`Composer` (slash commands), `ActionsPanel` (+ `ActionCard`, `SchedulePopover`), `RunQueue`,
`WorkspaceTopBar` (+ 9-dot switcher). Existing `BMCSectionEditor` chat logic is the seed for
`WorkspaceThread`; existing `ScheduledLoopsManager` logic is the seed for `SchedulePopover`.

## Migration of legacy chat surfaces (decided 2026-07-02)

Three pre-workspace AI surfaces exist on `main`; when workspaces ship (Phase 5) they resolve
as follows — the goal is **one chat per scope**, never two ways to talk about the same thing:

1. **`BMCSectionEditor`** (canvas section side sheet, `bmc-chat` SSE) — *demoted, not
   deleted*: becomes the chat-less peek drawer described in "Route & entry" (agent identity
   header, items w/ confidence + evidence, plain editor, "Open workspace" CTA).
2. **`ChatDrawer`** (Analysis page section/competitor chat, also `bmc-chat`) — *retired*
   in the same pass; competitor Q&A moves to the Phase-4 competitor drill-down.
3. **`BusinessOverviewSheet` / `BusinessOverviewEditor`** (`business-overview-chat`) — the
   data it edits is promoted to the **Company Brief** (canonical context document, first row
   of every workspace's context sources). The form editor stays; its embedded AI chat is kept
   short-term and *retired in Phase 6*, when brief edits become an Atlas proposal ("update our
   company brief to say…") passing through the normal approval flow with an audit trail.
4. The `bmc-chat` / `business-overview-chat` edge functions stay for the drawer/editor until
   their retirement steps, then are removed with their callers.

## Non-goals (v1)

Multiplayer presence, voice, agent-to-agent chat visible in section rooms (agents converse via
the insight bus, surfaced only in the War Room), mobile-optimized editing.
