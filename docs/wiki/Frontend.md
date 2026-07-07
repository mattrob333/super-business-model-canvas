# Frontend

[← Back to Home](./Home.md)

The frontend is a Vite + React + TypeScript single-page app (`src/`) built on React Router, TanStack Query, Tailwind, and shadcn/ui primitives (`src/components/ui/`). It talks to Supabase (Postgres + edge functions) via `src/integrations/supabase/client`, and to the agent worker exclusively through the `AgentRuntime` abstraction in `src/lib/agent-runtime/` — the browser never calls an LLM directly.

---

## 1. App shell and routing

### Entry point and failure recovery — `src/main.tsx`

`src/main.tsx` renders `<AppErrorBoundary><ThemeProvider><App /></ThemeProvider></AppErrorBoundary>` and installs one global listener before mounting:

- **Chunk-reload recovery.** Every page is a lazy chunk, and each deploy renames the chunk files. A tab opened before a deploy fails to import chunks that no longer exist. `main.tsx` listens for Vite's `vite:preloadError` event and reloads the page to pick up the new build — guarded by a `sessionStorage` timestamp (`chunk-reload-at`) so it auto-reloads at most once per 30 seconds. A reload that does not fix it (still-stale `index.html`) falls through to the error boundary instead of loop-reloading.
- **`AppErrorBoundary`** (`src/components/AppErrorBoundary.tsx`) is the last line of defense: any uncaught render error shows an honest recovery screen with a "Reload the app" button and the error message, styled with plain inline styles so it works even if the CSS pipeline itself broke.

### Routes — `src/App.tsx`

`App.tsx` wires `QueryClientProvider → AuthProvider → TooltipProvider → BrowserRouter`. Only `Landing` and `Auth` are imported eagerly; **every other page is `lazy()`-loaded** and wrapped by a `withSuspense()` helper with a spinner fallback. `RequireAuth` (an `<Outlet />` wrapper using `useAuth`) redirects unauthenticated users to `/auth`.

| Route | Page component | Lazy | Shell |
|---|---|---|---|
| `/` | `Landing` | no | public, no shell |
| `/auth` | `Auth` | no | public, no shell |
| `/share/:token` | `SharedArtifactPage` | yes | public, no shell |
| `/dev/overlays` (DEV builds only) | `DevOverlayPreview` | yes | public, no shell |
| `/workspace/:sectionKey` | `Workspace` | yes | auth, **outside** AppShell (full-screen room) |
| `/war-room` | `WarRoom` | yes | auth, **outside** AppShell (full-screen room) |
| `/dashboard` | `Dashboard` | yes | AppShell |
| `/canvas` | `Canvas` (re-exports `Analysis`) | yes | AppShell |
| `/analyze` | redirect → `/canvas` | — | — |
| `/competitors/:competitorId/canvas` | `CompetitorCanvas` | yes | AppShell |
| `/gaps` | `Gaps` | yes | AppShell |
| `/knowledge` | `Knowledge` | yes | AppShell |
| `/agents`, `/agents/:agentId` | `Agents`, `AgentDetail` | yes | AppShell |
| `/activity` | `Activity` | yes | AppShell |
| `/artifacts/:id` | `ArtifactPage` | yes | AppShell |
| `/my-analyses` | `MyAnalyses` | yes | AppShell |
| `/playbooks`, `/playbooks/framework/:frameworkId`, `/playbooks/reports/:reportId` | `Playbooks`, `FrameworkDetail`, `ReportViewer` | yes | AppShell |
| `/admin`, `/admin/frameworks`, `/admin/frameworks/new`, `/admin/frameworks/:id/edit` | `Admin`, `AdminFrameworks`, `FrameworkEditor` | yes | AppShell |
| `/settings` | `Settings` | yes | AppShell |
| `*` | `NotFound` | yes | no shell |

### Inside vs. outside the shell

`AppShell` (`src/components/layout/AppShell.tsx`) is a simple chrome: `SidebarNav` on the left, `TopBar` above a scrollable `<main>` with the routed `<Outlet />`. Three kinds of pages deliberately render **outside** it:

- **Agent rooms** (`/workspace/:sectionKey`, `/war-room`) — full-screen rooms per spec 02; they bring their own slim `WorkspaceTopBar` instead of the sidebar.
- **Share pages** (`/share/:token`) — public documents; no auth, no chrome.
- **Landing / Auth** — marketing and sign-in.

`/artifacts/:id` stays inside the shell (it is an internal reading view); its public twin `/share/:token` does not.

---

## 2. Canvas and analysis

### `src/pages/Analysis.tsx` (served as `/canvas` via `src/pages/Canvas.tsx`)

`Canvas.tsx` is a 5-line re-export — `/canvas` is the canonical route, `Analysis.tsx` is the implementation. The flow:

1. **Analyze a company.** `handleAnalyze(url)` calls the `analyze-company` Supabase edge function (`supabase.functions.invoke`). Failures dig the real error out of `error.context` because `invoke` wraps non-2xx responses in a generic message. While loading, the hero (`UrlInput` + `ProcessSteps`) shows a "Researching your company" state.
2. **Persist and bridge.** On success the payload is stored in session (`src/lib/active-analysis.ts`, `src/lib/active-workspace.ts`) and auto-saved to `saved_analyses` via `saveAnalysisRecord`, which also calls `bridgeAnalysisToCanvasVersions` (`src/lib/canvas-version-bridge.ts`) so the agents see versioned `canvas_section_versions` rows. A company-sync effect compares the loaded company's key (`companyKeyOf`) against the active scope from `src/lib/company-scope.ts` and re-bridges on a backfill or a company switch, then `invalidateCompanyScope(accountId)` — so gaps, competitors, and Atlas briefings all follow the company on screen.
3. **Render.** A company header with `CompanyProfileDrawer` (the **business overview inline card** — editing it flows through `handleBusinessOverviewUpdate`, which merges into `analysisData.company` and auto-saves with bridge), then `EnterpriseBusinessModelCanvas` (`src/components/canvas/EnterpriseBusinessModelCanvas.tsx`) rendering the nine BMC sections. Section edits go through `handleBMCSectionUpdate`, which maps `CanvasSectionKey` → legacy camelCase keys (`key_partners` → `keyPartners`), updates `analysisData.canvas`, and auto-saves.
4. **Extras.** "New company" (`startFreshAnalysis`) actually clears everything; `copyToMarkdown` exports the full analysis; the `AtlasDock` mounts beside the canvas once a company exists, and the page pads its right edge (`lg:pr-[calc(clamp(440px,26vw,600px)+16px)]`) when the dock is open so Atlas shares the row instead of covering the canvas.

### Competitor landscape and research

`CompetitiveLandscape` (`src/components/CompetitiveLandscape.tsx`) renders the analysis's `similarCompanies` as cards. Each card uses `useCompetitorResearch` (`src/hooks/useCompetitorResearch.ts`): for each suggested competitor it resolves whether a persisted `companies` entity exists (matched by website host, else exact name), exposes the latest Threat Index, and can start the full chain — create the entity, enqueue a `competitor_research` run (the worker chains `gap_engine` on completion). Run state is derived from the durable `agent_runs` row, not local state, so an in-flight run survives reloads and a worker failure surfaces on the card. Researched competitors open `/competitors/:competitorId/canvas` (`src/pages/CompetitorCanvas.tsx`), the evidence-cited competitor canvas with win/lose verdicts derived from the gap engine's `section_delta` metric.

---

## 3. Workspace rooms

### The chassis — `src/pages/Workspace.tsx`

`/workspace/:sectionKey` validates the param against `CANVAS_SECTION_KEYS` (`src/components/canvas/section-types.ts`; invalid keys redirect to `/canvas`) and renders the full-screen room, one per BMC section, staffed by the agent from `AGENT_ROSTER` (`src/lib/agent-roster.ts`). Layout (12-col grid; on mobile the chat leads and side panels collapse into `MobileCollapse`):

- **Top bar** — `WorkspaceTopBar` (`src/components/workspace/WorkspaceTopBar.tsx`): back-to-canvas link, the agent's door plate, and a **room switcher** popover (a mini BMC map listing all nine rooms plus the War Room).
- **Left rail** — `AgentIdentityCard` (name on the door; live status from the latest run; opens `AgentSettingsSheet`), `SectionCanvasPanel` (the section's live canvas items with confidence dots, freshness desaturation, evidence popovers, and a "verify this assumption" hook that prefills the composer), `ContextSourcesPanel` (per-agent file/url/note sources in `agent_context_sources`), and `WorkspaceRunQueue` (recent + in-flight `agent_runs`, polled while active, each opening `AgentRunDetailDialog`).
- **Center** — `WorkspaceThread`, the collaboration thread (below).
- **Right rail** — `WorkspaceActionsPanel` (`src/components/workspace/WorkspaceActionsPanel.tsx`), the **Studio + shelf**: the top half runs the agent's signature skills from `skill_catalog` (each run is a durable agent run, polled to completion), the bottom half is the output shelf of `skill_artifacts` (company-scoped, refreshed every 30s), each opening in a `FocusDrawer` as an `ArtifactDocument`.

The room resolves its agent profile with the RF-4-13 precedence pattern: an account-scoped `agent_profiles` row wins over the global template (`account_id.eq.{id}` OR `account_id.is.null`, ordered account-first). Section items use the same fallback order as the canvas page: versioned `canvas_section_versions` items first (via `useCanvasEvidence`), else the legacy analysis strings from `getActiveAnalysisCanvas` — restoring the session pointer from the latest `saved_analyses` row if a fresh tab landed without one.

Two arrival paths seed the thread with an opening brief: `?gap=<id>` (Gap Register "Fix with agent" — loads the gap and auto-sends a working brief, one-shot per gap per tab via `sessionStorage`) and `?from=atlas` (consumes the stashed `atlas:handoff`, see §4).

### The thread model — `src/components/workspace/WorkspaceThread.tsx`

Threads are durable rows in `workspace_threads`; messages in `workspace_messages` (`role` user/agent, `kind` text/proposal). Key rules, all visible in the code:

- **Company-scoped.** The thread list filters by `business_context_version_id IN scope.contextIds`, and every new thread is stamped with `scope.activeContextId` — a previous company's chat never surfaces in the new company's room.
- **Fresh chat on entry.** Entering a room always opens a fresh (unsaved) chat; past conversations live one click away in the History picker (a popover listing the last 30 threads, plus a "named chat" creation form). The first send `ensureThread()`s the row, titled from the opening message.
- **The run loop.** Sending inserts the user message, then `getAgentRuntime(accountId).startRun({ runType: "workspace_chat", input: { thread_id } })` and polls `getRunStatus(runId)` every 3s for up to 100 attempts (~5 minutes). On `completed` it reloads the messages (the worker wrote the agent reply into the thread); on failure it shows an actionable error; if the runtime is unreachable it shows the degraded-state banner ("Runtime unreachable — chat and runs are paused") while the durable thread keeps whatever was already written.

```mermaid
sequenceDiagram
    participant U as User
    participant WT as WorkspaceThread
    participant DB as Supabase (workspace_threads / workspace_messages / agent_runs)
    participant RT as AgentRuntime (src/lib/agent-runtime)
    participant W as Worker (workspace_chat job)

    U->>WT: type message, Enter
    WT->>DB: ensureThread() — insert thread stamped with scope.activeContextId
    WT->>DB: insert workspace_messages (role=user, kind=text)
    WT->>RT: startRun({ runType: "workspace_chat", input: { thread_id } })
    RT->>DB: insert agent_runs (pending)
    W->>DB: claim run, read thread + canvas + context
    W->>DB: insert agent reply (kind=text or proposal), mark run completed
    loop every 3s, max 100 attempts
        WT->>RT: getRunStatus(runId)
        RT->>DB: select agent_runs row
    end
    WT->>DB: loadMessages(threadId)
    WT-->>U: agent reply rendered via AgentMarkdown
    opt reply is a proposal
        U->>WT: Approve / Edit / Decline
        WT->>DB: approve → append merged items as new canvas_section_versions row;<br/>record decision on the message content
    end
```

### The proposal approve/decline loop

Agent messages with `kind: "proposal"` render as a proposal card with **Approve / Edit / Decline** buttons. `approveProposal`:

1. `ensureBusinessContext()` — the active company's newest context id (creating an initial one only if the account has none).
2. Loads the latest `canvas_section_versions` items for the section **scoped to the company era**, falling back to legacy analysis strings, and **merges** the proposal in (a new version replaces the section for every reader, so approving must append, never reduce the section to the proposal alone). An `Assumption:`-prefixed item matching the proposal text is replaced rather than duplicated.
3. Inserts a new `canvas_section_versions` row (`freshness_status: "fresh"`, `created_by_agent_profile_id` stamped) and records the decision (`decision`, `decided_at`, `decided_by`) back onto the message content.

`declineProposal` records the decision only; `editProposal` drops the proposal text into the composer as a revision request.

### `AgentMarkdown` — the shared reply renderer

`src/components/chat/AgentMarkdown.tsx` is *the one* agent-reply markdown renderer, shared by every chat surface (workspace rooms, Atlas dock, War Room). ReactMarkdown + `remark-gfm`, with every element styled explicitly via arbitrary-variant Tailwind classes (the `@tailwindcss/typography` plugin is installed but not registered, so `prose` classes are inert), semantic color tokens so both themes work, and wide tables wrapped in their own `overflow-x-auto` container.

---

## 4. Atlas and the War Room

Atlas is the orchestrator agent (`agent_key: "orchestrator"`, identity in `src/lib/atlas.ts`), reachable from two surfaces that share all their machinery:

- **`AtlasDock`** (`src/components/atlas/AtlasDock.tsx`) — a collapsible right-edge dock mounted on the canvas page. Collapsed, it is a slim vertical tab with an unseen-briefing pulse; expanded, it holds the `BriefingCard` and the `AtlasChat` thread beside the canvas. Open state persists in `localStorage` (`atlas:dock-open`, default open on desktop); the chat mounts lazily on first expand and stays mounted.
- **`WarRoom`** (`src/pages/WarRoom.tsx`) — the full-page War Room on the *same chassis* as the section rooms: `WorkspaceTopBar room="atlas"`, left rail with `AtlasIdentityCard` + `ContextSourcesPanel` + `WorkspaceRunQueue`, `AtlasChat` in the center, and Atlas's Studio on the right — the `BriefingCard` plus `WarRoomShelf` (`src/components/atlas/WarRoomShelf.tsx`), the cross-room document shelf showing recent `skill_artifacts` from every room, attributed by the `<callsign>.<skill>` key prefix.

### `useAtlasBriefing` — `src/components/atlas/useAtlasBriefing.ts`

One hook, shared by both surfaces: resolves the orchestrator profile (account-scoped wins over global), loads the latest **completed `atlas_briefing` run for the active company** (filtered by `input.company_key`, stamped by the worker, against `scope.companyKey` — a previous company's briefing must not brief the new one), parses it with `parseAtlasBriefing` (`src/lib/atlas.ts`), and exposes `requestBriefing()` — a `startRun({ runType: "atlas_briefing" })` + poll loop, with an explicit `refreshStalled` signal when the run has sat pending (never claimed) past ~45s. Per-account seen state lives in `localStorage` (`atlas:seen-briefing:<accountId>`) and drives the dock's pulse (`hasUnseen`); reading a briefing marks it seen.

### `BriefingCard` and the delegation contract

`BriefingCard` (`src/components/atlas/BriefingCard.tsx`) renders the State of the Union: headline, deltas, position, coverage board, **one** directed move (the directive), and watchouts. The directive's CTA and Atlas's in-chat action buttons share the same delegation contract:

- **Worker side** (`src/lib/atlas-actions.ts` documents the contract): Atlas's chat replies may embed a fenced ` ```action ` block containing JSON — `{ room, action, skill_title?, label? }`.
- **Frontend side**: `parseAtlasActions(text)` strips every fence from the prose (malformed blocks are silently dropped, the reply reads clean either way), validates `room` against `CANVAS_SECTION_KEYS`, and returns typed `AtlasChatAction`s. `AtlasChat` renders each as a button that **stashes the directive in `sessionStorage` under `atlas:handoff`** and navigates to `/workspace/<room>?from=atlas`. The room (`Workspace.tsx`) consumes the stash one-shot (read + remove — a refresh finds nothing and sends nothing), verifies `handoff.room === sectionKey`, and hands `WorkspaceThread` an `initialPrompt` + `initialThreadTitle: "Directive from Atlas"` that opens a **fresh thread** and auto-sends the delegation for the agent to acknowledge. `BriefingCard`'s directive CTA uses the identical stash-and-navigate path.

`AtlasChat` (`src/components/atlas/AtlasChat.tsx`) is the same durable-run chat loop as `WorkspaceThread` — user message insert, `workspace_chat` run, poll until the reply lands — but with a single company-scoped thread titled "War Room" per company era (found on mount, created lazily on first send) and deliberately no auto-send machinery: Atlas speaks only when spoken to.

---

## 5. Documents (artifacts)

### `ArtifactDocument` — `src/components/skills/ArtifactDocument.tsx`

The paper-styled renderer for every skill artifact (deliberately light-themed "paper" regardless of app theme): header with title, brand logo, accent bar (`brandColor` validated hex, default `#f97316`), date, evidence count, and verifier spot-check tally; then the **exhibits**, then the markdown body, then sources, then a trust footer ("Built only from cited evidence — unknowns are marked, never invented"; `publicFooter` adds a "Made with Super Business Model Canvas" line on share pages).

The exhibits system has three layers:

- **`src/components/skills/artifact-payloads.ts`** — defensive payload parsers (`asMoatPayload`, `asPositioningPayload`, `asUnitEconomicsPayload`, `asSupplyChainPayload`, `asLifecyclePayload`, `asBuildVsBuyPayload`, `phaseGSpotCheck`). A payload that fails its contract parses to `null` and only the markdown body renders — the document never breaks on bad data.
- **`src/components/skills/PhaseGExhibits.tsx`** — the Phase G exhibit components (`MoatAuditExhibit`, `PositioningBriefExhibit`, `UnitEconomicsExhibit`, `SupplyChainExhibit`, `LifecycleMapExhibit`, `BuildVsBuyExhibit`), selected in `ArtifactDocument` by exact `skill_key` match (e.g. `vault.moat_audit`, `forge.positioning_brief`, `tempo.build_vs_buy`). Five earlier exhibits (pricing teardown, avatar cards, segment expansion, channel gap/economics) are parsed and rendered inline in `ArtifactDocument` itself.
- **`src/components/skills/GoalExhibitDispatch.tsx`** — one dispatch point for the 14 Goal-Phase-1 exhibits (market/competition/resilience families, parsers in `goal-payloads-*.ts`, components in `GoalExhibits*.tsx`), "so ArtifactDocument stays a renderer, not a switchboard." Unknown skill keys render nothing.

**Sources section**: when `sources` (evidence items) are provided, `SourcesSection` renders them NotebookLM-style as numbered cards — title, the exact excerpt the analysis saw (truncated at 360 chars), and an outbound link when `source_url` is a valid http(s) URL. Order is preserved from `evidence_ids` because it is citation order.

### `ArtifactPage` — `/artifacts/:id` (`src/pages/ArtifactPage.tsx`)

Loads the artifact from `skill_artifacts` scoped to the caller's `account_id`, then in parallel: the active (non-revoked) `artifact_shares` row, the account brand (`loadArtifactBrand` from `src/lib/artifact-brand.ts`), and the `evidence_items` behind `evidence_ids` (re-ordered to match). Renders `ArtifactDocument` with Back / Share / Print-PDF actions.

### Share flow

1. **Create** — `createShare` inserts an `artifact_shares` row with a `generateShareToken()` token; the share URL is `${origin}/share/${token}`. **Revoke** flips `revoked: true` (with a select-back verifying the update matched a row).
2. **Public read** — `/share/:token` (`SharedArtifactPage.tsx`, outside auth and shell) calls the **`shared-artifact` edge function** (`supabase/functions/shared-artifact/`) with the token; the function resolves the non-revoked share server-side and returns `{ artifact, brand, sources }`. The response crosses a trust boundary, so `parseSources` validates each source's shape and drops anything malformed. The page renders the same `ArtifactDocument` with `publicFooter`.

---

## 6. Company scoping on the client — `src/lib/company-scope.ts`

One account holds many companies over time (each URL/deck analysis bridges a new `business_context_versions` row), but versioned tables used to be read account-wide — so opening Salesforce still surfaced Tier4's canvas rows, gaps, competitors and briefings (owner bug 2026-07-06). The fix is a client-side scope, a deliberate **mirror of `worker/src/db/company-scope.ts`** (the file header says to keep the two in sync):

- **Era chain.** `computeCompanyScope(rows)` sorts the account's context rows newest-first. The active company is whichever company the newest context belongs to. Identity is `companyKeyOf(name, website)` — normalized domain first (`normalizeDomain` strips protocol/www/port), normalized company name second (`normalizeCompanyName` strips punctuation and legal suffixes like inc/llc/gmbh). Walking oldest→newest, each **named** context starts a new era, and **anonymous** contexts ("Initial business context" ensure-rows) inherit the era of the nearest older named context. The result is `CompanyScope { activeContextId, contextIds, companyKey, companyName }`, where `contextIds` is *every* context id belonging to the active company — its full history, so re-analyzing a company extends it.
- **TTL cache.** `loadCompanyScope(accountId)` queries `business_context_versions` (last 500 rows) behind a 30-second per-account cache with in-flight promise dedup — a page render fans out to many scoped readers (canvas, gaps, competitors, artifacts, Atlas dock) and they should share one query. `invalidateCompanyScope(accountId?)` clears it; `Analysis.tsx` calls it after re-bridging on a company switch.
- **The rule.** Every company-derived read filters by `scope.contextIds` (`.in("business_context_version_id", scope.contextIds)`), and every company-derived write stamps `scope.activeContextId`. In this codebase that covers, among others: workspace threads (`WorkspaceThread`, `AtlasChat`), proposal approval reads/writes (`WorkspaceThread.approveProposal`), the artifact shelves (`WorkspaceActionsPanel`, `WarRoomShelf`), competitor research (`useCompetitorResearch`), and the Atlas briefing (`useAtlasBriefing`, matched by `input.company_key` because briefings live in `agent_runs`, not a versioned table).

---

## 7. Runtime client — `src/lib/agent-runtime/`

The interface boundary between the app and the agent engine. `index.ts` defines the `AgentRuntime` interface — `startRun`, `cancelRun`, `getRunStatus`, `getRunOutput`, `getConfig`/`updateConfig`, `getActiveRunCount`, `healthCheck` — plus the guardrail types (`StartRunInput`, `RunStatus`, `RunOutput`). Two implementations:

- **`MockAgentRuntime`** (in `index.ts`) — development without an engine: inserts real `agent_runs` rows (so the Activity page shows them) and fakes completion after 2 seconds.
- **`LiveAgentRuntime`** (`live-runtime.ts`) — used when `VITE_AGENT_RUNTIME_ENDPOINT` is set (`config.ts` / `getRuntimeMode`). In direct mode it inserts the durable `agent_runs` row (pending → running), resolves the model route from the profile's `model_route_key` via `model-routing.ts`, then fire-and-forgets a POST to the `agent-run` edge function and writes the result (or error) back onto the row. In **`enqueue` mode** it POSTs `{ mode: "enqueue", ... }` and the server/worker owns the row lifecycle — this is the path the queued worker uses. Auth is the Supabase session token, falling back to a configured API key.

`getAgentRuntime(accountId?)` is a per-account cached factory: it re-creates the instance if a caller later resolves a different account, so the runtime never stays bound to a stale account.

### The poll-until-done idiom

Every surface that starts a run follows the same pattern, because runs are durable and the reply lands in the database, not the HTTP response:

```ts
const { runId } = await getAgentRuntime(accountId).startRun({ ... });
// then, every RUN_POLL_INTERVAL_MS (3s), up to RUN_POLL_MAX_ATTEMPTS (100 ≈ 5 min):
const status = await getAgentRuntime(accountId).getRunStatus(runId);
// pending | running  → schedule the next poll (a thrown fetch error also just re-polls)
// completed          → reload the durable output (thread messages, briefing run row, artifact shelf)
// failed | cancelled → surface status.error with a retry path
// attempts exhausted → honest message: the run continues in the background; check Activity
```

Implementations of this loop: `WorkspaceThread.pollRun`, `AtlasChat`'s poll, `useAtlasBriefing.pollBriefingRun` (which additionally flags `refreshStalled` when a run sits *pending* — never claimed — past ~15 polls), `WorkspaceActionsPanel`'s skill runs, and `useCompetitorResearch` (which derives state from the `agent_runs` row itself so in-flight runs survive reloads).
