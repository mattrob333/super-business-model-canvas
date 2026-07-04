# Spec 09 — The Overlay System (Focus Drawer)

> One standard overlay for the whole app. Decided 2026-07-04 after the live smoke test
> exposed stacked, inconsistent drawers (see audit summary at bottom). Binding for all
> current surfaces and all Phase 5–6 UI. When specs 02/03/08 say "drawer viewer",
> "peek drawer", or "sheet", they mean this component.

## 1. The four-tier taxonomy (which surface for which job)

| Tier | Job | Component | Examples |
|---|---|---|---|
| **Popover** | Glance at a fact, no task | shadcn Popover | evidence citations, hover cards |
| **Dialog (modal)** | Interrupt: confirm/decide, one small thing | shadcn Dialog | delete confirms, cost approvals |
| **Focus Drawer** | Read or work on one focused thing, page context stays visible | `FocusDrawer` (this spec) | company profile, section editor, dossiers, reports, briefs, gap details, cascade DAGs |
| **Route (full screen)** | Live in it | React route | agent workspaces, War Room |

Documents never open in modals. Work never happens in popovers. Rooms are never drawers.

## 2. Hard rules

1. **One drawer at a time. A drawer NEVER opens another drawer.** Mode changes
   (view ↔ edit) swap content inside the same drawer; conversation happens in the
   drawer's AI rail; navigating to different content replaces the drawer's content.
   Popovers and small confirm Dialogs MAY open above a drawer; nothing else may.
2. **Radix under everything.** Every drawer is built on the shared `FocusDrawer`
   component (Radix Dialog via shadcn Sheet primitives): portaled, focus-trapped,
   Escape closes, scrim click closes, `role=dialog` + labelled title, body scroll
   locked. Hand-rolled `fixed inset-0` overlay divs are banned.
3. **Opens at the top, every time.** Auto-focus is suppressed
   (`onOpenAutoFocus` prevented) and the body scroll position resets on open.
4. **Named sizes only** (no per-callsite widths):
   - `peek` — ~420px. Glance + ten-second edits (the spec 02 peek drawer; Atlas dock
     is its own docked panel, not a drawer, but shares the width family).
   - `reading` — ~720px document column. Read-only documents without a rail.
   - `focus` — ~70% of the viewport (88vw on md, 72vw on lg+, capped 1240px).
     The standard work surface: document/editor body + optional AI rail.
5. **Standard internal chassis** (the drawer edition of spec 02's workspace chassis):
   ```
   ┌───────────────────────────────────────────────┬──────────────────┐
   │ HEADER: eyebrow · title · subtitle    actions ✕│ RAIL HEADER      │
   ├───────────────────────────────────────────────┤ (AI identity)    │
   │ BODY (scrolls independently;                  ├──────────────────┤
   │  document content uses a max-w-3xl column)    │ RAIL BODY        │
   │                                               │ (chat/messages)  │
   ├───────────────────────────────────────────────┼──────────────────┤
   │ FOOTER (optional, fixed): Save bar etc.       │ RAIL FOOTER      │
   └───────────────────────────────────────────────┴──────────────────┘
   ```
   The AI rail is optional, right-anchored (~40%, min 320px), single-instance:
   on mobile the header gains a Body/Assistant toggle that shows one region at a
   time — the SAME DOM nodes, never a duplicated mobile layout.
6. **One chat per scope** (spec 02 rule) still governs: a drawer's AI rail must be
   the only conversation surface for that scope, and rails for scopes that belong to
   real agents (BMC sections) are interim until Phase 5 workspaces replace them.
7. Theme-aware (both modes), 8px radius system, semantic accents only, honest
   empty/loading/error states, zero horizontal overflow at 390px — per DESIGN_TASTE.

## 3. Component contract (`src/components/overlay/FocusDrawer.tsx`)

```ts
interface FocusDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: "peek" | "reading" | "focus";   // default "focus"
  eyebrow?: string;      // content-type label: "BUSINESS OVERVIEW", "KEY PARTNERS"
  title: string;         // also the dialog's accessible name
  subtitle?: string;
  headerActions?: ReactNode;   // buttons left of the ✕ (e.g. Edit toggle)
  footer?: ReactNode;          // fixed bar under the body
  rail?: {                     // optional AI rail (single instance)
    header: ReactNode;
    content: ReactNode;        // owns its own scroll
    footer?: ReactNode;        // composer/input
    mobileLabel?: string;      // toggle label, default "Assistant"
  };
  children: ReactNode;         // body
}
```

## 4. Migration table (status at 2026-07-04)

| Surface | Disposition |
|---|---|
| BusinessOverviewSheet + BusinessOverviewEditor (stacked pair) | **Replaced** by `CompanyProfileDrawer` on FocusDrawer: view mode ↔ edit mode + AI rail, one surface |
| BusinessOverview.tsx (dead code, imported nowhere) | **Deleted** |
| BMCSectionEditor (hand-rolled 66vw panel) | **Re-shelled** onto FocusDrawer (body = items editor, rail = Strategy Assistant); interim per spec 02 — Phase 5 demotes it to `peek` |
| StrategyDrawer (dead code) | **Deleted** |
| ChatDrawer (competitor chat; bmc mode unreachable) | Retirement already scheduled (spec 02 migration); until then untouched — do not build on it |
| ReportViewerDrawer | Patched (a11y title, width clamp); full FocusDrawer adoption when Phase 6 report/framework boards land |
| BusinessContextChat (Playbooks coach) | Adopt FocusDrawer when Playbooks page is next touched; do not extend meanwhile |
| Framework/report/dossier/brief viewers (specs 02/03/08) | Build on FocusDrawer from day one: `reading` for pure documents, `focus` when a rail or editor is needed |
| Settings sheets, confirms, evidence popovers | Unchanged (Dialog/Popover tiers) |

## 5. Why (audit summary, 2026-07-04)

Live smoke test surfaced: sheet content opening scrolled mid-document (Radix
auto-focus on the first tabbable element inside an `overflow-y-auto` panel), and
"Refine with AI" stacking a non-portaled hand-rolled editor UNDER a portaled modal
sheet (both z-50; the sheet's focus trap + `pointer-events:none` fought the editor).
Full audit found four hand-rolled overlay components sharing the same defects: no
portal/focus-trap/Escape/ARIA, inconsistent body-scroll locking, duplicated
always-mounted mobile+desktop layouts, chat auto-scroll writing to non-scrolling
nodes, and hardcoded widths (500px/66vw/720px/1100px) that overflow small viewports.
One component, one contract, fixes the class of bugs rather than the instances.
