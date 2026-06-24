# Course Corrections — Outer Loop -> Inner Loop

The OUTER loop appends prioritized directives here on detecting drift, guardrail violations, quality regressions, or off-task work. The INNER loop reads this FIRST every tick and resolves OPEN corrections as top priority before normal work.

**Protocol:**
- Outer APPENDS corrections as OPEN; never edits build-state.md (avoids write races).
- Inner addresses each OPEN item, then marks it RESOLVED (commit <sha>) and moves it to Resolved. After resolving all OPEN items, **clean up the Open section** by writing `_(none — inner loop in alignment as of last audit)_`.
- Severity: BLOCKER (stop normal work, fix now) / HIGH (this tick) / MEDIUM (within 2 ticks) / LOW (when convenient).

---

## Open Corrections

_(none — inner loop in alignment as of last audit)_

## Resolved Corrections

### CORR-001: Lint baseline is wrong — do NOT attempt to fix pre-existing errors
**Resolved:** 2026-06-24 (commit d51c1df) — Build-state.md updated with correct lint baseline (52 errors / 16 warnings on main). Confirmed current branch: 52 errors, 20 warnings (zero new errors, +4 warnings from new pages — all useMemo dependency warnings, acceptable). Did not attempt to fix pre-existing errors.

### CORR-002: Phase 6 guidance — vertical slice must prove full loop
**Resolved:** 2026-06-24 (commit d51c1df) — Phase 6 vertical slice implemented with the COMPLETE loop: (1) UI trigger via "Analyze" button on CanvasSectionCard, (2) AgentRuntime.startRun() call via useCanvasSectionRun hook, (3) agent_runs record created in DB by MockAgentRuntime, (4) result written to canvas_section_versions with confidence + freshness, (5) UI refreshes automatically showing agent-produced items. MockAgentRuntime remains the runtime (Phase 7 will add real Hermes integration).
