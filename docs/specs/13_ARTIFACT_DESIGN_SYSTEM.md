# Spec 13 — Artifact Exhibit Design System

> Extends spec 11 (Artifact & Report Presentation). Spec 11 established the
> paper; this spec establishes what sits ON the paper. Owner verdict on the
> current documents: "wall of text… forgettable." The mandate: every one of
> the 27 skill artifacts renders like a McKinsey/Miro-grade deliverable —
> charts, visual matrices, infographic layouts — not styled prose.
>
> Every visual in this spec is **derivable from the payload fields the worker
> already writes** (`artifact-payloads.ts`, `goal-payloads-*.ts`, and the two
> forge contracts in `worker/src/jobs/skill-run.ts`). No new worker data. Where
> a payload is too thin for a chart, this spec says so and prescribes the best
> non-chart layout instead — a fabricated bar is a product failure worse than
> prose.

## 0. Method (binding)

Charts follow the dataviz skill's procedure: **form first, color by job,
validate the palette with `validate_palette.js` (never by eye), thin marks,
direct labels, one axis, honest unknowns.** Palettes below were validated
against the paper surface `#ffffff` on 2026-07-08:

- Categorical 5-slot `#2a78d6, #1baf7a, #eda100, #4a3aa7, #e34948` — ALL PASS
  (worst adjacent CVD ΔE 47.2). Relief rule: `#1baf7a` (2.82:1) and `#eda100`
  (2.17:1) sit below 3:1 on white, so any mark in those hues ships with a
  visible direct label or an adjacent table — which every exhibit here has.
- Verdict trio `#008300 / #eda100 / #4a3aa7` — ALL PASS (ΔE 24.2).
- Never a dual axis. Never a rainbow. Sequential = one hue light→dark.
  Diverging = blue↔red with a neutral gray midpoint.

## 1. The paper surface

Everything renders inside `ArtifactDocument`'s always-light sheet
(`.artifact-paper`: white, `border-slate-200`, ~860px page proportion, print
CSS in `src/index.css` under `.artifact-print-root`). Charts are therefore
**light-mode only by design** — R3's always-light paper removes the dark-mode
variant obligation for exhibits (the app chrome around the paper still themes;
the paper does not).

### Layout grid

- **One column, measure-width.** The sheet's inner column is the grid. Section
  rhythm: `space-y-8` between exhibits (existing).
- **Hero + support split.** A skill's first exhibit is its *hero visual* (the
  one-glance read); tables and quote lists are *support exhibits* below it.
- **Two-up hero splits** use `grid sm:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]`
  (chart left, keyed list right) and stack on narrow screens.
- **Exhibit header block** (every exhibit): 10–11px uppercase tracked kicker in
  `text-slate-500` (existing `h2` style) + optional one-line reading note in
  `text-slate-400`. Exhibits are numbered implicitly by order, not literally.

### Typographic scale (unchanged system sans)

| Role | Class |
|---|---|
| Document title | `text-xl font-semibold tracking-tight text-slate-900` |
| Exhibit kicker (h2) | `text-sm font-semibold uppercase tracking-wide text-slate-500` |
| Hero figure / KPI value | `text-lg`–`text-2xl font-semibold text-slate-900`, proportional figures |
| Table/body | `text-sm text-slate-700` |
| Caption, axis, chip | `text-xs` / `text-[10px]`, `text-slate-500` |
| Tabular columns | add `tabular-nums` only where digits must align |

**Ink rule:** text always wears slate ink, never a series color. A colored
mark beside the text carries identity.

### Brand accent (`accounts.brand_color`)

The accent is **chrome, never data**: title rule (existing), section rule
ticks, the callout banner's left border, cover elements in Document Studio
outputs. It is an arbitrary owner-supplied hex that cannot be validated
against the chart palette, so it must never color a bar, dot, radar fill, or
any mark that encodes a value. Fallback stays `#f97316`.

### Chart palette (roles, validated on white)

| Role | Hex | Use |
|---|---|---|
| Series 1 (self / primary) | `#2a78d6` | radar fills, primary bars, "you" |
| Series 2 | `#1baf7a` | second series (direct-label relief required) |
| Series 3 | `#eda100` | third series / caution-adjacent categories (relief required) |
| Series 4 | `#4a3aa7` | fourth series |
| Series 5 | `#e34948` | fifth series |
| Status good | `#0ca30c` | grounded / known / confirmed (always icon+label) |
| Status warning | `#fab219` | estimated / gap flag (always icon+label) |
| Status serious | `#ec835a` | elevated risk (always icon+label) |
| Status critical | `#d03b3b` | severity 4–5 (always icon+label) |
| Gridline | `#e1e0d9` | hairlines only |
| Axis/baseline | `#c3c2b7` | |
| Muted ink | `#898781` | axis labels |
| Empty track | `#e2e8f0` (slate-200) | meter/gauge tracks, "unknown" |

Rules: categorical hues assigned in fixed slot order, never cycled; a 6th+
series folds into "Other" or small multiples; status colors are reserved for
state and never impersonate a series; diverging = `#2a78d6` ↔ `#e34948` with
neutral `#f0efec` midpoint.

## 2. Exhibit primitives (`src/components/skills/exhibit-charts.tsx`)

Eight reusable primitives, components only (no payload parsing — parsers stay
in the payload modules). Recharts (already a dependency) powers the plotted
forms; meters/gauges/strips are hand-rolled SVG/CSS for print fidelity.

| # | Primitive | Form | Contract |
|---|---|---|---|
| P1 | `KpiStatRow` / `KpiTile` | stat tiles | label, hero value, status chip, optional `ArcGauge`, footnote. The "not a chart" answer for single headline numbers. |
| P2 | `MeterBar` | horizontal comparison bar | 1–5 or 0–1 value on a slate-200 track, 4px rounded data end, direct `k/5` label; `tone` from the role table. THE workhorse for every `*_score` field. |
| P3 | `RadarProfile` | radar/spider (recharts) | 3–8 axes, single series, fixed max, vertex value labels, hollow "0 = nothing claimed" honesty note passed as caption. |
| P4 | `QuadrantMatrix` | 2×2 positioning (recharts scatter) | numbered dots keyed to a table, quadrant washes + corner labels, dashed midlines, axis direction captions in HTML (print-reliable). Collision-jittered deterministically. |
| P5 | `DistributionStrip` | proportion strip | ordered segments with 2px white gaps + count legend (never percentage-only); segments with zero count drop out of the strip but stay in the legend as "0". |
| P6 | `StageFlow` | funnel/stage flow | ordered stage chips with connector, per-stage flag badge (status warning) and per-stage count dots; the lifecycle/funnel hero. |
| P7 | `HeatMatrix` | presence/score grid | rows × columns, filled cell = evidence-backed presence (series hue) or score step (one-hue sequential); empty cell renders the track color with an explicit "—", never blank-ambiguous. |
| P8 | `VerdictBanner` | callout verdict | icon + one-sentence verdict + basis chip; left border in brand accent; the "insight as a banner, not a paragraph" move. |

Sub-primitive: `ArcGauge` (small semicircle status gauge used inside P1 —
encodes a discrete state ladder such as unknown/estimated/known, never a
fabricated magnitude).

Mark specs (all primitives): 2px surface gaps between adjacent fills, thin
marks, ≥8px dot targets, `title=` hover text on hand-rolled marks and a
minimal recharts `Tooltip` on plotted forms, selective direct labels (never a
number on every gridline), recessive hairline grid.

## 3. The 27-skill exhibit map

Every visual below names only fields that exist in the shipped payload
contract. **Bold** = hero. `→P#` names the primitive.

| # | Skill key | Hero visual | Supporting exhibits | Honesty notes |
|---|---|---|---|---|
| 1 | `vault.moat_audit` | **Radar of durability by moat class** — 6 fixed axes (network, switching, data/tech, brand, scale/cost, distribution), vertex = max `durability` among that class's `rows` →P3 | Per-resource durability `MeterBar` list →P2; durability matrix table (existing) | Axis at 0 = "no resource claimed in this class" — the undefended-flank caption lists them. `moat_class:"none"` rows excluded from radar, kept in table. **SHIPPED (flagship)** |
| 2 | `tempo.build_vs_buy` | **2×2: strategic disposition × market availability** — y from `verdict` (keep\_in\_house high → strong\_buy low), x from count of `market_alternatives` (none / available, scaled by count), numbered dots →P4 | Verdict mix `DistributionStrip` →P5; numbered verdict table (existing) with matching dot colors | "Strategic value" is derived from the model's own verdict, stated in the caption. Unrecognized verdicts drop from the plot, stay in the table. **SHIPPED (flagship)** |
| 3 | `ledger.unit_economics_frame` | **KPI stat row** — six tiles (CAC, ACV/ARPA, margin, retention, payback, LTV): `value_or_range` hero + `ArcGauge` of `status` (known/estimated/unknown) →P1 | Grounding coverage `DistributionStrip` (k of 6 grounded) →P5; per-tile `basis`, `canvas_quote`, "Needs you" chip | Gauges encode grounding status, never invented magnitudes; `unknown` tile shows italic "not yet grounded" + empty gauge. **SHIPPED (flagship)** |
| 4 | `yield.pricing_teardown` | **Packaging heat matrix** — competitors × union of `packaging_axes`, filled = axis present →P7 | Pricing matrix table with `price_points` as typographic columns; scenario cards; `your_position` →P8 banner | `price_points` are free-text strings ("from $2k/yr") — no honest bar chart without a worker-side numeric parse. Say so; matrix + banner carry the read. |
| 5 | `compass.avatar_refinement` | **ICP profile cards** (no chart — payload is qualitative prose/quotes) | Quote-forward pain blocks; trigger/disqualifier/hook chip lists with per-card count chips | Too thin for a chart: no numeric fields. Prescription: designed card grid, pains as pull quotes, chips instead of bullet walls. |
| 6 | `compass.segment_expansion` | **Fit-score horizontal bars** — `fit_score` (1–5) per `segment`, sorted desc, direct labels →P2 | Shortlist table: competitor signal, `fit_rationale`, `recommended_probe` | Bars only from the real 1–5 score; rationale stays visible beside every bar. |
| 7 | `relay.channel_gap_scan` | **2×2: impact × effort** — both real 1–5 fields, numbered dots; "quick wins" = high-impact/low-effort quadrant →P4 | Strategy table keyed to dot numbers; per-row effort+impact `MeterBar` pair →P2 | Best-fit payload in the catalog for a quadrant — both axes are worker-scored numerics. |
| 8 | `relay.channel_economics` | **Posture-lane board** — channels grouped by `cac_posture` lane (paid-heavy / partner-led / organic-led / unknown), each card with a `confidence` `MeterBar` →P2 | Economics table (existing) with signal quotes | `cac_posture:"unknown — not published"` renders its own lane, italic, never a zero bar. Confidence is 0–1 real. |
| 9 | `forge.differentiator_audit` | **Differentiation ladder** — 3 tiers (unique / contested / table stakes), each `claim` as a chip in its `verdict` tier; tier counts as headline →P5+P6 hybrid | Matrix table: claim, verdict chip, named `competitor` + `competitor_evidence` quote, `basis` | Contested/table-stakes chips must show the naming competitor — the parser already drops unnamed non-unique verdicts. |
| 10 | `forge.proof_gap_scan` | **Gap-count KPI row** (total gaps, "assumption-labeled", "no linked evidence") →P1 + reason `DistributionStrip` →P5 | Evidence-building plan table: `claim`, reason chip, `suggested_source`, `how_to_get_it` | Two categories with counts is the whole numeric surface — a strip is honest; anything fancier is chartjunk. |
| 11 | `forge.positioning_brief` | **Statement block** (no chart — six-slot mad-lib is prose by design) with slots typographically emphasized on an accent-ruled panel | Pillar cards with `segment_language` pull quotes + `grounded_in` provenance line; tone notes | No numeric fields. The designed statement panel IS the deliverable. |
| 12 | `anchor.lifecycle_map` | **Stage flow with gap flags** — ordered `stages` as a connected flow, `gap:true` stages flagged (status warning), per-stage competitor-motion count dot →P6 | Existing stage cards (your motion vs competitor motions, `recommendation` rows) | "none recorded" / zero motions render italic-empty, never a filled stage. |
| 13 | `anchor.churn_signal_audit` | **Mirrored theme board** — own-side vs competitor-side columns from `observed_about`, with side counts as headline chips →P1 | Theme → `retention_play` table with `evidence_quote` per theme | No frequency data per theme — counts of themes per side are the only honest numbers. |
| 14 | `anchor.advocacy_engine_scan` | **Per-competitor mechanism board** — grouped cards with `source` chip (live search / competitor canvas) + coverage KPI row (mechanisms, competitors) →P1 | Playbook table: mechanism, `evidence_quote`, `equivalent_move` | `mechanism` is free text — a mechanism-type matrix would require invented clustering. Board + counts only. |
| 15 | `envoy.ecosystem_watch` | **Move → counter flow pairs** — "their move ⇒ your counter-partner" arrow cards per `moves` row (no chart; payload is narrative pairs) | Watch table: competitor, partner, `move_summary`, quote, `counter_rationale` | No numerics. The paired-arrow layout is the infographic. |
| 16 | `envoy.supply_chain_map` | **Chain diagram** — upstream → YOU → downstream three-column flow from the real `upstream[]`/`downstream[]` arrays →P6 | Candidate `fit_score` `MeterBar` list →P2; candidates table (existing) | Empty chain sides render "unknown — not surfaced by the evidence" in the diagram slot itself. |
| 17 | `envoy.partner_outreach` | **Draft letter cards** (no chart) with `status` approval banner →P8 | Per-draft rationale + `evidence_quote` footer | Payload is email drafts; the honest layout is a letter, not a graphic. Banner carries `drafts_awaiting_owner_approval`. |
| 18 | `tempo.operational_benchmark` | **Capability heat matrix** — activities × {hiring, shipping} from `signal_type`, filled cell names the `competitor` →P7 | Gap-read table with quotes; `no_public_signal` rows as em-dash cells + honest tag | Empty cell ≠ "they don't invest" — caption states "no public signal", cells render track-gray "—". |
| 19 | `tempo.velocity_watch` | **Shipping-observation bars** — count of grounded `observations` per competitor →P2; `velocity_insight` as →P8 banner with `insight_basis` chip | Observation quote list per competitor; `pace_read` column | `evidence_thin` competitors get a hatched/hollow row labeled "evidence thin — not scored", never a zero bar; `evidence_too_thin` basis renders the banner in neutral, not status color. |
| 20 | `vault.single_point_scan` | **Severity ladder** — risks grouped into severity bands (5→1), status-colored band headers, `risk_class` chips →P5+P2 | Risk register table: `exposure`, `mitigation_first_step`; severity ≥4 count KPI | Severity is a real 1–5 field; status colors carry icon+label per the reserved-status rule. |
| 21 | `vault.talent_radar` | **Competitor × function presence matrix** — dot where a hiring `signals[]` entry exists for that function →P7 | Signal quote table + `next_move` per competitor | `evidence_thin` competitors render a full hatched row "evidence thin", never empty-ambiguous. Functions are free text — columns = union of observed functions, capped with "Other". |
| 22 | `ledger.cost_benchmark` | **Benchmark ladder table** — per `category`: `archetype_norm` chip vs your `canvas_quote`, `gap` rows flagged "Cost input needed" | Grounded-coverage KPI row (k of n categories from canvas) →P1; archetype header chip | `archetype_norm` is free text ("10–20% of revenue") — no honest bars without a worker-side numeric contract. Ladder + flags instead. |
| 23 | `ledger.efficiency_scan` | **Ranked impact bars** — `impact_score` (1–5) per vendor, sorted, direct labels →P2 | Shortlist table: `cost_driver` (verbatim), `expected_impact`, `evidence_quote` | Bars from the real score only; the cost driver name stays attached to every bar. |
| 24 | `yield.monetization_gaps` | **Adoption-evidence bars** — count of citing `competitors[]` per `model`, competitor names as the direct label →P2 | Experiment cards: `adoption_rationale`, `first_experiment` | Parser already drops zero-citation gaps, so every bar is ≥1 by construction. |
| 25 | `yield.wtp_signals` | **Per-segment diverging band** — underpriced ← aligned → overpriced placement per `signal` on a blue↔red diverging scale with neutral center →P5 variant | Signals table: `rationale` + `evidence_quote` per segment | `unknown` segments sit off-scale in a hollow "unknown" slot — never plotted on the diverging axis. Categorical placement, not a fabricated magnitude. |
| 26 | `relay.watering_holes` | **Ranked ladder** — `rank` medallions + `segment` chips (no bars: rank is ordinal, a bar of "rank" is chartjunk) | Entry-strategy table with `evidence_quote` per hole | Honest non-chart: ordered list designed as a ladder. |
| 27 | `compass.message_market_fit` | **Before/after rewrite pairs** — `your_line` ⟶ `their_words` paired cards with status chip | Rewrite-coverage KPI (k rewritten / n unknown) →P1; `why_it_lands` footnote per pair | `unknown` rows show "no segment language found yet" in the after-slot — the absence is the finding. |

## 4. Print / PDF rules

1. The existing `@media print` isolation (`.artifact-print-root` visibility
   flip) stays authoritative; exhibits add nothing outside the paper.
2. `.artifact-paper` carries `print-color-adjust: exact` (and the `-webkit-`
   prefix) so chips, meter fills, and quadrant washes survive Print/Save-PDF
   and `html2pdf.js`.
3. Charts are **SVG at fixed heights** inside full-width containers — no
   canvas, no lazy/measured render that can compute 0×0 in the print clone.
4. Axis captions and legends render as HTML text (not only SVG `<text>`)
   where feasible — HTML reflows and prints more reliably.
5. Interactive layers (tooltips, hovers) are additive; nothing meaningful
   lives only in hover. Every plotted value is also in a table or direct label.
6. Avoid page-break carnage: exhibits set `break-inside: avoid` on figure
   blocks ≤ one page tall; tables may break between rows.

## 5. Empty / unknown-state rules (binding)

- **Unknown is a rendered state, not a zero.** An unknown never becomes a bar
  of length 0 pretending to be a measurement: it renders as an empty track,
  hollow dot, hatched row, or an italic "unknown — not published" string —
  visibly different from a true low value.
- **Absence with meaning gets a caption.** A radar axis at 0 or an empty heat
  cell states what the emptiness means ("no resource claimed", "no public
  signal") in the figure caption, once, not per-cell noise.
- **Parsers stay the gate.** A payload that fails its contract parses to null
  and the exhibit renders nothing — the markdown body carries the content
  (existing behavior, unchanged). No exhibit invents rows to look full.
- **Spot-check provenance stays on the document** (header line + footer), and
  `evidence_thin` / `unknown` enums from the worker are surfaced verbatim as
  labeled chips, never silently dropped.
- **Never fabricate an axis.** If a value the chart wants doesn't exist in
  the payload (price magnitudes, cost percentages, mechanism taxonomies), the
  skill gets the best non-chart layout (§3 notes) until the worker contract
  grows the field — a spec change, not a renderer improvisation.
