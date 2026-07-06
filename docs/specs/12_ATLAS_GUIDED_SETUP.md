# Spec 12 — Atlas Guided Setup ("State of the Union")

> How Atlas onboards a company. (Owner directive 2026-07-06.) On first contact Atlas
> tells the owner where they stand — market position vs tracked competitors, what data
> the system holds, what's missing — and then **walks them through fixing it**, one
> directed action at a time, verifying each step against the database before issuing
> the next. This is the cross-company generalization of the per-agent data-gap
> protocol (RF-LIVE-21): gaps are onboarding, not dead ends — and Atlas owns the
> whole tour. **Everything Atlas-side in this spec is Phase 6; nothing here is built.**

## Design intent

The first minutes with Atlas must not feel like an empty chat box. A new owner (or one
returning after weeks) should get a general's situation briefing and a single order:
"run this first." The product's core promise — evidence over vibes — starts here: Atlas
never narrates a company it can't see, and never pretends a step happened that the
database says didn't.

## 1. The State of the Union opener

On the first run for a company — and on demand thereafter ("give me the state of the
union") — Atlas produces a short synopsis with exactly three parts:

1. **Where you sit.** Market position relative to tracked competitors, stated plainly
   and only as far as evidence supports it: "you're in fourth place on pricing
   flexibility, bleeding on channel presence, strongest on product depth." Every
   positional claim traces to competitor canvases, skill artifacts, or gap-engine
   findings; where the evidence isn't there yet, Atlas says "unknown — that's one of
   the gaps below" instead of ranking by intuition.
2. **What exists vs what's missing.** A data-completeness read across the nine
   sections: which canvases have verified items, which agents have run, which skills
   have produced artifacts, what the Gap Register holds.
3. **One directed next action.** Not a list of options — the single highest-leverage
   step, with why it comes first. The eye lands on "run this first."

Short is binding: the opener is a briefing, not a report. Depth lives in the attached
artifact (§4) and in the rooms Atlas sends the user to.

## 2. Directed next actions — a path, not a menu

Atlas's early messages send the user somewhere specific and expect them back:

> "Go to Yield's room and run the pricing teardown. When it finishes, come back and
> tell me — I'll show you what it changes about your position."

Rules of the directive form:

- **One action per message.** Ordered path, not a dashboard of chips. The next step
  is revealed when the current one is done.
- **Named destinations.** The directive names the agent (roster callsign, spec 01),
  the room, and the specific skill or analysis to run — which must be a **real,
  implemented, runnable** skill (spec 10 §6: the catalog surfaces only what the
  worker can execute; Atlas inherits that constraint).
- **Every instruction explains why** — what having the result unlocks strategically.
  Same discipline as the section-agent data-gap protocol's step (3).
- Where the missing input is an owner-only fact (a churn rate, a margin), the
  directive is "add it" (Strategic Goals, context-source upload) — not "run something".

## 3. Completion detection — read the database, not the claim

When the user returns and says "done", Atlas **checks**. It reads the actual state —
`agent_runs` (did the run happen, did it succeed), `canvas_section_versions` (did the
section change), `skill_artifacts` / `generated_reports` (did the deliverable land),
`gaps` (did the gap close) — and responds to what it finds:

- **Verified done** → acknowledge concretely ("Yield's teardown landed — you're priced
  below the median with a weaker packaging story"), then issue the next
  deficiency-filling directive.
- **Not found** → say so without accusation, diagnose (run failed? still queued? wrong
  room?), and re-issue or adjust the directive.

The loop repeats — assess, direct, verify, redirect — until the data foundation is
complete: every section grounded, the flagship skills run, the Gap Register down to
gaps that need the market (not the owner) to answer. At that point the State of the
Union graduates from onboarding tour to standing briefing (the spec 03 pulse and the
Phase 6 doctrine loop take over).

## 4. Rendered synopses in chat

Where a synopsis benefits from structure — competitive position, data-completeness by
section — Atlas attaches a **typed artifact rendered per spec 11** (paper sheet, title
block, provenance footer; competitive matrix or completeness board layout) instead of
a wall of chat text. The chat message stays short; the document carries the exhibit.
This is a **Phase 6 deliverable**: it depends on Atlas existing and on spec 11's typed
renderers, and ships with them — until then it is design intent, not behavior.

## 5. What exists today vs what this spec adds

Be precise about the boundary. **Built now (shipped 2026-07-06, RF-LIVE-21):**

- The per-agent **data-gap protocol** in `worker/src/jobs/workspace-chat.ts`: when a
  section agent lacks data it must say so, name the missing information, say exactly
  how to get it, and explain what it unlocks — never guess or pad. The empty-section
  prompt line points at the same protocol.
- The per-room suggested prompt in `src/components/workspace/WorkspaceThread.tsx`:
  every room ends its prompts with "What information are you missing to give me your
  best advice — and how do I get it?"
- The **gap engine and Gap Register**: real `gaps` rows, account-scoped, with triage
  actions and the "What is a gap?" explainer.

**Not built (Phase 6, this spec):** Atlas itself, the State of the Union synopsis,
directed-action sequencing, database-verified completion checks, and the rendered
synopsis artifacts. Each section agent today coaches through *its own* missing data;
Atlas's walkthrough is the same move made **cross-company** — one guide who sees all
nine sections, the competitor set, and the register, and turns them into one ordered
path.

## 6. Placement

Per spec 03 (decided 2026-07-02): Atlas lives in the **collapsible right-side dock on
the Canvas page** — ~380px expanded, slim avatar tab collapsed; avatar + pulse line +
action chips + the Atlas thread with composer. Later the dock mounts app-wide; the
Phase 6 **War Room** is Atlas's full-screen home, and dock + War Room share one
thread. Atlas is **not a tenth room** — the guided-setup loop runs in the dock beside
the canvas it is helping to fill, which is the point.

## Binding rules

- **B1 — No fabricated standings.** Atlas never asserts market position without
  evidence it can cite; unknowns are named as gaps, never ranked by guess.
- **B2 — Real skills only.** Directed actions reference implemented, runnable skills
  and existing surfaces — never a step the product can't execute yet.
- **B3 — The database is the referee.** Completion checks read `agent_runs`,
  `canvas_section_versions`, `skill_artifacts`, and `gaps`; a user's "done" is a
  prompt to verify, never a fact to record.
- **B4 — Every directive carries its why.** Each instruction states what completing
  it unlocks — the RF-LIVE-21 discipline, made non-negotiable at the Atlas level.
- **B5 — One step at a time.** An ordered path, single next action per message; menus
  of options are a failure of the doctrine (spec 10 §5: one constraint at a time).
- **B6 — Structured synopses render as documents.** Anything exhibit-shaped ships as
  a spec 11 artifact on the paper sheet — never inline JSON, pipes, or a text wall.
