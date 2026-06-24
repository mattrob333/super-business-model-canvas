# Course Corrections — Outer Loop -> Inner Loop

The OUTER loop appends prioritized directives here on detecting drift, guardrail violations, quality regressions, or off-task work. The INNER loop reads this FIRST every tick and resolves OPEN corrections as top priority before normal work.

**Protocol:**
- Outer APPENDS corrections as OPEN; never edits build-state.md (avoids write races).
- Inner addresses each OPEN item, then marks it RESOLVED (commit <sha>) and moves it to Resolved. After resolving all OPEN items, **clean up the Open section** by writing `_(none — inner loop in alignment as of last audit)_`.
- Severity: BLOCKER (stop normal work, fix now) / HIGH (this tick) / MEDIUM (within 2 ticks) / LOW (when convenient).

---

## Open Corrections

### CORR-001: Lint baseline is wrong — do NOT attempt to fix pre-existing errors
**Severity:** HIGH
**Added:** 2026-06-24T21:42Z (Supervisor audit)
**Context:** The build-state.md documents lint baseline as "22 errors, 9 warnings." This is incorrect. The ACTUAL baseline on `main` (commit 6c6d3d2) is **52 errors, 16 warnings**. The enterprise branch currently shows **52 errors, 21 warnings** — zero new errors, +5 warnings (all useMemo dependency warnings in new pages: Canvas, Gaps, Knowledge).
**Directive:** Update your mental model: the lint baseline is 52 errors / 16 warnings. The current 52 errors are ALL pre-existing (`no-explicit-any` in pre-existing files, `no-require-imports` in tailwind.config.ts, `no-empty-object-type` in shadcn ui components). Do NOT spend ticks trying to fix these. The quality gate is "pre-existing errors must NOT increase" — and they haven't. The +5 warnings are acceptable but should not grow further. Proceed with Phase 6 normally.
**Resolution:** _(pending)_

### CORR-002: Phase 6 guidance — vertical slice must prove full loop
**Severity:** MEDIUM
**Added:** 2026-06-24T21:42Z (Supervisor audit)
**Context:** Phase 6 is the first agentic vertical slice. The build-state.md "Next Action" section correctly identifies the approach: user clicks canvas section → MockAgentRuntime.startRun() → agent_runs record → simulated analysis → result in canvas_section_versions → UI update. This is the critical proof-of-concept for the entire architecture.
**Directive:** Ensure the Phase 6 vertical slice demonstrates the COMPLETE loop end-to-end: (1) UI trigger from CanvasSectionCard, (2) AgentRuntime.startRun() call, (3) agent_runs record created in DB, (4) result written to canvas_section_versions, (5) UI refreshes to show updated section + run record. Do NOT build half the loop and move on — the value is in proving the full circuit works. Keep MockAgentRuntime as the runtime (real Hermes integration is Phase 7). Test with a real Supabase connection if possible, or at minimum verify the code paths are correct.
**Resolution:** _(pending)_

## Resolved Corrections
_(history appended below)_
