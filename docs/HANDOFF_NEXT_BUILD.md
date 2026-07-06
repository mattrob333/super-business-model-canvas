# Next Build Handoff — the "make it indispensable" phases

Written 2026-07-06 after owner live-test rounds RF-LIVE-1..29 (see BUILD_STATE
REVIEW FINDINGS). State of the app: the core loop works end to end — URL or
pitch deck → canvas (assumptions labeled) → competitor research → gap engine →
Gap Register → "Fix with agent" → grounded agent chat with the data-gap
protocol. What's left is depth and delivery: skills that DO the work the
agents currently only describe, crawl coverage, and Atlas.

Read first: HANDOFF.md (binding review lessons), NORTH_STAR.md, specs 10, 11,
12. House rules apply: gates before every commit (root tsc/build/lint ≤ 65;
worker tsc/vitest/build/lint), select-back-verify on client writes,
account_id scoping everywhere, UTF-8 (no cp1252 mojibake), BUILD_STATE entry
per slice, honest scope notes.

## Phase A — Research depth (unblocks everything downstream)

1. **Multi-page competitor crawl.** Single homepage crawl leaves 2/9 sections
   populated (RF-LIVE-28 note). Crawl a small page set per competitor:
   /pricing, /about, /customers|/case-studies, /careers, plus homepage; feed
   all excerpts to the (now distillation-ruled) claim extractor. Cap pages
   and bytes; keep AbortSignal timeouts; dedupe evidence (RF-3-7 helper).
2. **Firecrawl 403 fallback** → grok_live_search for blocked sites (deferred
   since round 2; company-research.ts).
3. **Competitor drill-down compaction.** Item cards render full evidence
   excerpts inline and balloon the grid. Match the main canvas pattern:
   clean item text + evidence count badge with popover (components exist —
   EvidencePopover / EvidenceBadge).

## Phase B — Skills become real (gap-driven priority)

The Gap Register is the demand signal: implement first the skills the gap
engine keeps pointing at. Contract per skill is spec 10 (FeedRunner APIs,
verifier gate, typed spec-11 artifact, honest `implemented` flag).

1. **Segment/avatar pair (Compass):** avatar refinement + segment expansion
   scan — the owner's live gap ("define our own segments") maps directly.
2. **Channel gap scan (Relay)** and **channel economics** (pairs with Ledger).
3. Each new skill: typed ArtifactDocument layout (spec 11 inventory), lands
   on the room Studio shelf (already live).

## Phase C — Agents get hands (close the conversation loop)

1. **Agent-triggered section analysis from chat.** Agents say "want me to
   kick that off?" but can't. Add an MCP tool (bmc server) that enqueues
   `canvas_section_analysis` for the agent's own section, gated on the
   user's explicit yes in-thread; surface the queued run in the room queue.
2. **Paste → context source + proposal in one motion.** When the user pastes
   data the agent asked for, the agent files it as a context source AND
   returns a canvas proposal (existing proposal loop) in the same turn.
   Prompt + tool support; never silent writes (proposal mode stays binding).
3. **Assumption upgrade path.** Section analysis re-runs should replace
   "Assumption:"-prefixed items with evidence-cited versions when verified —
   and drop the prefix when they do (worker: canvas-section-analysis).

## Phase D — Atlas v1 (spec 12, the State of the Union)

1. **Dock chassis** on the canvas page (~380px collapsible right panel per
   spec 03/12 §6): avatar, action chips, thread. Wire to a workspace_chat
   profile (orchestrator agent_key) first — orchestration follows.
2. **State of the Union job**: worker job that reads canvas coverage,
   competitor set, gaps, artifacts → three-part briefing (position / data
   state / ONE directed action) per spec 12 §1, binding rules B1–B6.
   Completion checks read the database (agent_runs, canvas_section_versions,
   skill_artifacts, gaps) — never trust "done".
3. **Directed-action loop**: chips route to the named room/skill (the Gap
   Register "Fix with" pattern, generalized).

## Phase E — Delivery & polish (parallel-friendly, good Codex slices)

1. **Unified intake**: one modal on the fresh-start screen — URL / file drop /
   paste text (NotebookLM pattern); routes to analyze-company URL or document
   mode, or Knowledge ingestion for big files.
2. **/artifacts/:id route + share links** (spec 11 §share-ready; BUILD_PLAN
   6.10) — the McKinsey-grade deliverable needs a URL.
3. **Tenancy hardening**: saved_analyses is user-scoped, not account-scoped
   (noted RF-LIVE-14) — migrate toward account tenancy before multi-user.
4. **Chat message polish**: streaming (or optimistic chunking), and the
   Studio "Coming" tiles hidden until ≥1 implemented skill per room ships.

## Known-fragile spots (do not regress)

- Workspace chat auto-send: must wait for `threadsLoaded` + `messagesReady`
  and only fire into an empty thread (RF-LIVE-29 — duplicate-thread bug).
- Legacy analysis shape nests sections under `data.canvas.*` — always read
  through `getActiveAnalysisCanvas()` (RF-LIVE-17).
- Chat model routes must be anthropic-provider only (RF-LIVE-8); worker runs
  non-root (RF-LIVE-7); chat budget floor $0.75 (RF-LIVE-18).
- "Assumption:" prefix is data, not decoration — display strips it
  (src/lib/assumption.ts); storage keeps it until evidence upgrades it.
