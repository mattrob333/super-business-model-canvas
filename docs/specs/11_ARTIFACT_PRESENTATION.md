# Spec 11 — Artifact & Report Presentation System

> The payoff surface. Everything an agent produces — skill artifacts, framework
> reports, briefs, the eventual Document Studio outputs — must land as a
> **finished document**: something an owner would proudly screen-share to a
> board or forward to an investor. Raw markdown, raw JSON, or wall-of-text is a
> product failure even when the content is right. (Owner directive 2026-07-06:
> "This is the big payoff of this app… it needs to be a wow moment.")

## Reference points

The bar is the document surfaces of best-in-class tools: Notion pages (typed
blocks, calm typography), Linear project updates (data + prose in one column),
Stripe Sigma / McKinsey-style PDF briefs (title block, exhibit numbering,
provenance footers), Carta reports (tables that look designed, not dumped).
Common structure across all of them:

1. **A title block** — what this is, whose company, when, from what inputs.
2. **Data renders as designed exhibits** — tables/charts with real visual
   hierarchy, never inline JSON or markdown pipes.
3. **Prose renders as typeset text** — real bold, real headings, generous
   leading, one measure-width column.
4. **A provenance footer** — where the facts came from, what was verified.
5. **Paper metaphor** — always-light sheet, page proportions, printable.

## The rules (binding for every artifact surface)

- **R1 — Never raw.** No surface may show markdown source, JSON, or crawl text.
  Everything passes through a renderer. (Enforced progressively; violations are
  review findings.)
- **R2 — Typed renderer first, markdown fallback second.** Every skill's
  `output_kind` (spec 10 contract) gets a purpose-built layout as it ships;
  until then `ArtifactDocument`'s markdown fallback carries it — rendered, on
  the paper sheet, with header + provenance.
- **R3 — Always-light paper.** Artifacts and reports render on a white sheet
  regardless of app theme (established by the report drawer; now the standard).
  Page-proportioned (~860px), print-isolated CSS so Print / Save PDF yields a
  clean document.
- **R4 — Provenance is part of the design.** Evidence count, verifier
  spot-check results, generation date, and "unknowns are marked, never
  invented" language appear ON the document, not in chrome around it. This is
  the product's core differentiator made visible.
- **R5 — Share-ready by construction.** Layouts must survive being screenshot,
  printed, or (Phase 6.10) shared by link — no app-dependent affordances inside
  the sheet.

## Renderer inventory (output_kind → layout)

| output_kind | Layout | Status |
|---|---|---|
| `report` w/ pricing payload | Matrix table + position callout + scenario cards + memo | **SHIPPED** (`ArtifactDocument`, 2026-07-06) |
| framework reports (Porter, SWOT, Ansoff, BCG) | Native visual boards per spec 08 §7 (forces diagram, quadrant, matrix, grid) | Phase 6 (6.8b) — Porter currently renders via template/salvage on the paper sheet |
| `memo` / `insight` | Title block + typeset memo + provenance | Markdown fallback covers; typed pass with pull-quotes later |
| `ranked_list` / `gap_analysis` | Numbered exhibit table w/ score bars | With the owning skill's implementation |
| `matrix_board` / `target_map` | 2-axis board (CSS grid, no chart lib yet) | With the owning skill's implementation |
| `risk_register` | Severity-tinted table + mitigation column | With the owning skill's implementation |
| `approvals_draft` | Letter layout + approval state banner | Phase 6 approvals queue |
| Document Studio (plans, decks, prospectus) | Branded multi-page compose | Phase 6.11 (spec 10 §3b) |

**Charts:** introduce a chart primitive only when a shipped renderer needs one
(pricing trend, share-of-voice). Prefer CSS/SVG exhibits over a charting
dependency until then; when needed, one library chosen once, styled to the
sheet.

## Where artifacts live

- Today: artifact shelf (Dashboard + room actions panel) → FocusDrawer with the
  document sheet.
- Next (with rooms maturity): a dedicated `/artifacts/:id` full-page route —
  the drawer is a preview; the page is the shareable, printable canonical view
  and the future anchor for share links (6.10) and PDF export (reuse
  `exportReportToPdf`).

## Education (paired owner directive)

Every novel concept gets taught **where it lives, in plain language**: metric
tiles carry ⓘ explanations; the Gap Register opens with "What is a gap?";
artifacts carry their own provenance language. New surfaces must ship with
their explanation — a reviewer checklist item from now on.
