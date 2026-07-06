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

## Phase F — Forge & proof (NEXT FOR CODEX, 2026-07-06 handoff)

Atlas's own briefings keep flagging the same hole: Value Propositions gaps
have no runnable skill, so the directive falls back to "run a section
analysis". Give Forge (value_propositions) real hands, and wire artifacts
back into agent context so finished work compounds.

1. **`forge.differentiator_audit` skill** (worker `skill-run.ts` registry +
   catalog migration flipping `implemented` for it only): compare own
   value_propositions items against ALL researched competitors' items
   (the segment_expansion pattern), classify each own claim as
   unique / contested / table-stakes with the named contesting competitor,
   verifier-spot-check up to 4 claims, write a skill_artifacts row
   (markdown body + typed payload). Mirror relay.channel_gap_scan end to end
   — including the "requires … canvas items first" honest failures.
2. **`forge.proof_gap_scan` skill**: for each own value_propositions item,
   check evidence_ids on the latest canvas rows; items with zero evidence or
   assumption-prefixed text become a "proof gap" list with a suggested
   evidence source per item (crawl page, owner document, metric). No web
   calls needed — this one is pure database analysis + one model pass +
   verifier. Write the artifact; open ONE `gaps` row per proof gap
   (severity medium, gap_type missing_data) — stamp `business_context_version_id`
   from the company scope like every other writer.
3. **Artifact → context source wiring**: on artifact creation, upsert a
   `context_sources` row (type `note`, name = artifact title, config.text =
   a <=1200-char summary of body_md) for the OWNING section agent's profile,
   so the next chat turn in that room already knows the artifact exists.
   Cap: keep only the 5 newest artifact-sourced notes per profile (delete
   older artifact-sourced ones; never touch user-created sources).
4. **Catalog copy**: update the two skills' descriptions to say exactly what
   they consume and produce (the tiles are the UI contract).

Binding rules for this phase:
- COMPANY SCOPING IS LAW (new, 2026-07-06): every read of
  canvas_section_versions / gaps / companies / skill_artifacts goes through
  `loadCompanyScope` (worker: `worker/src/db/company-scope.ts`) and filters
  `.in("business_context_version_id", scope.contextIds)`; every write stamps
  `business_context_version_id: scope.activeContextId`. Copy the pattern from
  skill-run.ts — do NOT hand-roll account-wide queries.
- Skills must fail loudly with actionable messages when inputs are missing;
  never write an artifact from unverifiable model output (parse-or-throw).
- Tests: extend `worker/src/__tests__/skill-run.test.ts` fixtures with a
  second company's rows and assert they never reach the artifact (the
  atlas-briefing.test.ts pattern).
- Gates before every commit: root `npx tsc --noEmit` + `npm run build` +
  `npm run lint` (frozen ceiling 65); worker `npx tsc --noEmit` +
  `npx vitest run` + `npm run build` + `npx eslint src`; UTF-8 decode check
  on touched files (no cp1252 mojibake).
- Migration-only changes to `skill_catalog.implemented`; the worker throws
  for unimplemented keys — keep that invariant.

## Known-fragile spots (do not regress)

- Workspace chat auto-send: must wait for `threadsLoaded` + `messagesReady`
  and only fire into an empty thread (RF-LIVE-29 — duplicate-thread bug).
- Legacy analysis shape nests sections under `data.canvas.*` — always read
  through `getActiveAnalysisCanvas()` (RF-LIVE-17).
- Chat model routes must be anthropic-provider only (RF-LIVE-8); worker runs
  non-root (RF-LIVE-7); chat budget floor $0.75 (RF-LIVE-18).
- "Assumption:" prefix is data, not decoration — display strips it
  (src/lib/assumption.ts); storage keeps it until evidence upgrades it.
- Company scoping (2026-07-06): all canvas/gaps/companies/skill_artifacts
  reads AND writes are scoped to the active company era via
  `loadCompanyScope` (worker/src/db/company-scope.ts mirrored by
  src/lib/company-scope.ts). An unscoped account-wide query reintroduces the
  cross-company pollution bug.
- Every page is a lazy chunk: deploys rename them, so `src/main.tsx` has a
  `vite:preloadError` one-shot reload + `AppErrorBoundary` is the last line
  of defense. Do not remove either, and keep new routes lazy-loaded inside
  `withSuspense`.

