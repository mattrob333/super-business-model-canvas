# SuperBMC A2UI Catalog — the whitelist

This folder is the generative-UI surface for Atlas workflow runs
(`docs/atlas/atlas-orchestrator-a2ui-spec.md` §3, build plan AT-3/AT-4).

## The cap is law

The catalog holds **exactly 10 components** and is COMPLETE:

VariableCard · GapPrompt · ChoiceChips · ScoreTable · ComparisonStrip ·
ValueThemeCard · ConfidenceBadge · CoverageMap · WorkflowRunCard ·
ContradictionAlert

- A new component is a **deliberate catalog PR** with its own review — never a
  convenience addition to make one layout easier. Compose the 10.
- The dispatcher's component map in `catalog.tsx` IS the whitelist. An
  off-catalog name renders a rejection marker and logs a `[a2ui]` warning; it
  never throws and NEVER evaluates model-generated JSX/HTML/markup.

## How it works

- The worker (`worker/src/workflows/a2ui.ts`) emits A2UI messages
  (`createSurface` / `updateComponents` / `updateDataModel`) as durable
  `workspace_messages` rows (`kind: 'a2ui'`, one surface per workflow run).
- `src/lib/a2ui.ts` folds every row of a thread into per-surface state:
  ordered components + a data model. Components bind into the data model via
  JSON Pointer (`resolvePointer`), so re-folding after a poll updates every
  bound component — the job-queue adaptation of "render once, stay live".
- Writes go through ONE path: `write_brain_variable` RPC
  (`src/lib/brain.ts`) — `user_override` from VariableCard edits,
  `user_stated` from GapPrompt/ChoiceChips answers. Trust ordering lives
  server-side; machine re-runs may contradict user values but never
  overwrite them.
