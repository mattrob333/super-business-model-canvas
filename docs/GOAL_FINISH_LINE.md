# GOAL: Finish Super BMC to launch-ready

Owner directive (2026-07-07): "finish out this app as best you can with a
team of agents to run until you're finished… break it up into phases where
you're checking and correcting any bugs before you go to the next phase."

## Definition of DONE

The app is done when all of the following are true and verified (not
claimed):

1. **Every skill tile is real.** All 27 catalog skills either run end-to-end
   (enqueue → worker → verified artifact on the shelf → context note) or are
   removed from the catalog. No permanent "Coming" tiles.
2. **Every document is a deliverable.** All artifact types render with a
   bespoke exhibit + numbered sources; the public share page shows sources
   too; inline citation markers link claims to sources where the payload
   carries evidence quotes.
3. **Chat is trustworthy.** Agents run their skills instead of describing
   them, replies render rich and clean, Atlas replies carry action buttons,
   no dead ends (every failure states what happened and what to do).
4. **Numbers are honest.** Every dashboard/workspace metric is computed from
   real data or removed. No decorative numbers.
5. **The engine stays up.** Deploys fail loudly unless a worker machine is
   running; scheduled loops fire; a stuck queue is diagnosable from GitHub
   Actions alone.
6. **No known company bleed.** Every read/write of company-derived data is
   era-scoped (canvas, gaps, competitors, artifacts, briefings, documents,
   threads — and anything a QA sweep finds beyond those).
7. **Gates green at every merge.** App+node tsc, vite build, lint ≤ frozen
   ceiling, worker tsc/vitest/build/eslint, UTF-8 check — per commit.

Explicitly OUT of scope (blocked or deferred by owner):
- Tier-1 data feeds (awaiting API keys) — feed-dependent features degrade
  honestly via the existing grok feed.
- True token streaming in chat (worker architecture change; separate effort).
- Multi-user invites/roles (needs a dedicated tenancy security pass first).
- Audio overviews (owner: not wanted).

## Phases (bug-check gate between each)

- **Phase 1 — Skills completion wave.** Build the 14 unimplemented skills on
  the Phase G toolkit pattern with an agent team (builder → 2 adversarial
  reviewers → fixer, per skill), then hand-integrate: registry, catalog
  migration, full gates. Feed-dependent skills company-scope their cache
  keys and spot-check against real excerpts; canvas-only skills use honest
  parser-level verification; every skill fails honestly when inputs are
  missing.
- **Phase 2 — Verification pass 1.** Adversarial review of everything Phase
  1 landed plus the live paths it touches (run_skill keys list, Studio
  tiles, shelf, artifact exhibits for new payload shapes). Fix every
  confirmed medium+ finding before proceeding.
- **Phase 3 — Document experience completion.** Share page gets sources;
  inline [n] citations rendered from evidence order; exhibits for the new
  Phase 1 payloads; print polish.
- **Phase 4 — Chat polish.** Rich-text rendering pass on agent replies,
  inline run-started chips for run_skill, action-button coverage checked,
  empty/error states audited.
- **Phase 5 — Honest numbers.** Audit every metric on Dashboard/rooms;
  compute from real queries or delete; explain each number in place.
- **Phase 6 — Final QA + tenancy/security sweep.** Multi-agent audit
  (frontend routes, worker jobs, RLS/account scoping, company scoping),
  fix confirmed findings, final gates, BUILD_STATE "GOAL COMPLETE" entry,
  HANDOFF updated.

## Execution rules

- I orchestrate; agents build in isolated files; I personally review and do
  all integration (registry/migrations/shared files) myself.
- Full gate suite before every commit; squash-merge each phase as its own
  PR; verify the deploy started a worker machine before calling it live.
- Any live bug the owner reports mid-goal preempts the current phase.
- BUILD_STATE gets an honest entry per phase, including what was NOT done.
