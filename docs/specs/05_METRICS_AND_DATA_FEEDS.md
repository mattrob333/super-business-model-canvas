# Spec 05 — Metrics, Benchmarks & Data Feeds

> What the dashboard actually measures: true, defensible metrics derivable from public data
> about the market, competitors, and macro forces — plus the benchmark/KPI system to strategize
> against them, the data feeds that keep them honest, and the interpretation layer where Atlas
> reads the tea leaves *for* the human. Also specs the competitor BMC drill-down.

## Design position

Three rules keep this from becoming a vanity dashboard:

1. **Only metrics we can defend.** Every number carries a provenance tier (below) and links to
   its inputs. A metric we can't source is a metric we don't show.
2. **Comparative by default.** Absolute numbers from public data are weak; *deltas and ratios
   against competitors and against your own baseline* are strong. Almost everything below is
   displayed as you-vs-them or now-vs-baseline.
3. **Every metric has a reader.** A tile without an owner agent and an interpretation path is
   noise. Each metric maps to the section agent that owns it and feeds patterns Atlas knows
   how to read (§5).

## 1. Provenance tiers (shown on every tile)

| Tier | Meaning | Examples |
|---|---|---|
| **T1 — Direct** | Read straight from an authoritative source; reproducible | pricing pages, review counts/ratings, release notes, FRED series, SEC filings, GitHub stats, job postings |
| **T2 — Proxy** | Public signal that correlates with what we care about | traffic ranks, search interest, social engagement counts, hiring velocity as growth proxy |
| **T3 — Estimated** | Model-derived; useful directionally, never as a fact | sentiment scores, TAM estimates, revenue-mix guesses |

T3 metrics render with a distinct "estimated" treatment and never trigger autonomous agent
action on their own — they corroborate T1/T2 signals.

## 2. The metric catalog (v1)

Owner = section agent whose loops maintain it. Cadence = default refresh.

### A. Visibility & Share of Voice — *the flagship family (Matt's pick)*

| Metric | Definition | Tier | Source | Owner / cadence |
|---|---|---|---|---|
| **Social Share of Voice** | your mentions ÷ (yours + competitors') on X, 7/30-day windows, per topic | T2 | Grok Live Search counts | Relay / daily |
| Posting cadence & engagement | posts/week and median public engagement per post, you vs each competitor | T2 | Grok + profile scrapes | Relay / weekly |
| Press share of voice | news-article mention share in category | T2 | GDELT (free) / NewsAPI | Relay / weekly |
| Search interest ratio | branded search interest, you vs competitors, indexed | T2 | Google Trends | Compass / weekly |
| Community gravity | GitHub stars/forks velocity, public community sizes (where applicable) | T1 | GitHub API, public pages | Relay / weekly |
| Review velocity & rating trend | new reviews/month + rating trajectory per platform, you vs competitors | T1 | G2/Capterra/Trustpilot/app stores via Firecrawl | Anchor / weekly |

### B. Competitor execution signals

| Metric | Definition | Tier | Source | Owner / cadence |
|---|---|---|---|---|
| **Pricing posture** | price points + packaging per competitor; delta events | T1 | pricing-page diffs (Firecrawl) | Yield / weekly→daily in war mode |
| Ship velocity | releases/changelog entries per month, you vs them | T1 | changelogs, release notes, launch posts | Tempo / weekly |
| Hiring velocity & mix | open roles count + functional mix (eng/sales/marketing) per competitor — *reveals strategy*: sales-heavy hiring = GTM push, ML-heavy = product bet | T1/T2 | careers pages, job boards | Vault / monthly |
| Feature coverage index | % of category-standard capabilities covered, you vs them | T2 | Forge's claim/feature matrix | Forge / monthly |
| Alliance activity | new partnerships/integrations announced per quarter | T1 | press releases, integration marketplaces | Envoy / weekly |
| Funding & corp events | raises, M&A, exec changes in the competitive set | T1 | press, SEC EDGAR (public cos), registries | Atlas triage / event-driven |

### C. Market & demand

| Metric | Definition | Tier | Source | Owner / cadence |
|---|---|---|---|---|
| Category demand index | search interest on *category* (not brand) terms | T2 | Google Trends | Compass / weekly |
| Demand-side hiring | count of job posts asking for skills in your category (someone budgeting for the problem) | T2 | job-board scrapes | Compass / monthly |
| Category news volume & tone | article volume + tone on the category | T2/T3 | GDELT + cheap-model scoring | Compass / weekly |

### D. Macro forces

| Metric | Definition | Tier | Source | Owner / cadence |
|---|---|---|---|---|
| Rates & credit | policy rate, relevant yield spreads | T1 | FRED (free API) | Ledger / monthly |
| Inflation & input costs | CPI + industry-relevant PPI series | T1 | FRED/BLS | Ledger / monthly |
| Sector employment & wages | employment + wage trend in the company's sector | T1 | BLS via FRED | Vault / quarterly |
| Business & consumer confidence | NFIB small-business optimism, UMich consumer sentiment | T1 | FRED | Atlas / monthly |
| FX (if international) | relevant currency pairs trend | T1 | free FX APIs | Ledger / monthly |

Macro series are selected per company at onboarding (industry → 4–6 relevant series), not a
fixed wall of economics.

### E. Sentiment (corroborating layer)

| Metric | Definition | Tier | Source | Owner / cadence |
|---|---|---|---|---|
| Net sentiment, you vs them | LLM-scored sentiment over mentions + reviews, trended | T3 | Grok/scrape corpus + cheap model | Anchor / weekly |
| Pain-theme tracker | top recurring complaint themes about *competitors* (= your opportunity list) | T3 | review mining | Compass+Forge / monthly |

## 3. Composite indices (what the dashboard leads with)

Raw series live one click down; the dashboard and War Room Map lead with four composites,
each 0–200 indexed to a baseline of 100 at onboarding, each fully decomposable (click →
component breakdown + history + evidence):

- **Visibility Index** — weighted SoV + search interest + press share + community gravity.
  *"Are we being seen?"*
- **Momentum Index (per competitor + self)** — hiring velocity + ship velocity + alliance
  activity + funding events. *"Who is accelerating?"*
- **Threat Index (per competitor)** — momentum × section-overlap (from the gap engine) ×
  pricing aggression. Ranks the competitive set; drives the War Room's `▼ vs Acme` badges.
- **Tailwind Index** — category demand + relevant macro composite. *"Is the tide with us?"*

Composite formulas are versioned and computed in the worker (`metric_snapshots.inputs` stores
components), never in the frontend — same rule as Spec 03's Map.

## 4. Benchmarks & KPIs (the "strategize against it" layer)

New `kpis` table: `{ id, account_id, metric_key, scope (self|vs:competitor_id|market),
baseline_value, baseline_at, target_value, target_date, direction (≥|≤), cadence,
owner_agent_key, status (on_track|at_risk|off_track|met), created_by (user|atlas) }`.

- **Baseline** auto-captured at onboarding (or KPI creation) — every metric is thereafter
  "vs day-0" as well as "vs competitor."
- **Set by human or proposed by Atlas.** Atlas proposals come with rationale + suggested
  review cadence and land in Approvals (Spec 04 rules). E.g. "Social SoV ≥ 25% by Oct 1 —
  you're at 14%, Acme dominates X but ignores LinkedIn; Relay has a plan."
- **Owner agent** carries the KPI: its loops refresh the metric, and misses/at-risk transitions
  post insights automatically.
- Dashboard gets a **KPI rail**: each KPI as target-vs-actual with trend sparkline and status;
  clicking opens the owning agent's workspace with the KPI in context.

## 5. The interpretation layer — Atlas reads the tea leaves

The explicit requirement: *the human shouldn't need to pattern-match; Atlas does it and
explains.* Three stages, cheapest first:

1. **Detection (code, not LLM).** After each snapshot write, the worker runs plain statistics:
   z-score vs trailing 12 windows, threshold crossings, KPI status changes, correlated moves.
   Anomalies emit candidate signals. Zero tokens.
2. **Pattern matching (declarative library + small model).** A versioned pattern library maps
   signal combinations to named plays, e.g.:
   - *Upmarket move*: competitor pricing ↑ + sales-hiring ↑ + enterprise features shipped →
     "they're abandoning your low end — harvest it or follow."
   - *Pre-launch buildup*: hiring ↑ + posting cadence ↑ + shipping ↓ → "something big is
     coming; expect a launch window."
   - *Retention leak*: their review velocity ↑ while rating ↓ → "their churn is your win-back
     window" (routes to Anchor + Envoy).
   - *Tailwind divergence*: category demand ↑ while your visibility flat → "market is growing
     without you — channel problem, not demand problem."
   A cheap model classifies candidate signals against the library; matches score confidence.
3. **Narrative (Atlas, premium model, only for matches).** Atlas writes an **Insight Card**
   in fixed shape — **What's happening** (with the numbers) · **Why it matters here** (tied to
   *your* canvas and gaps) · **What to do** (1–3 moves, each traceable) · **Confidence & watch
   items** — posted to the dashboard ("Atlas's Read" panel), the insight feed, and, when
   severity warrants, the agenda.

This staging is also the cost model: statistics are free, the pattern pass is pennies, and the
expensive strategist tokens are spent only on confirmed, material patterns (see Spec 06).

## 6. Data feeds — the supply chain

New `data_feeds` registry: `{ id, feed_key, name, kind (api|scrape|search), tier, config,
cadence, last_run_at, health (ok|degraded|failing), cost_class }`. Worker fetchers normalize
everything into `evidence_items` (raw, cited) + `metric_snapshots` (derived). Feed health shows
in Settings; a failing feed marks its dependent metrics stale rather than silently flatlining.

**Phase 1 (free/already-integrated):** Grok Live Search (X + web) · Firecrawl (pricing,
reviews, changelogs, careers, press) · FRED · Google Trends · GDELT · GitHub API · SEC EDGAR ·
RSS/press feeds · Tranco rank.

**Phase 2 (paid, when revenue justifies):** Similarweb (real traffic), SEMrush/Ahrefs (SEO),
NewsAPI, Crunchbase (funding), a social-listening API (full-fidelity SoV). The registry design
means an upgrade swaps a fetcher, not the schema — metrics silently improve in tier.

**Caching discipline:** every scrape/search result is cached with a per-feed TTL; agents read
the cache first. Two agents wanting Acme's pricing page in the same week cost one fetch.

## 7. Competitor BMC drill-down (Matt's click-through idea)

Competitor canvases (ROADMAP Phase 4) get a first-class UX:

- **Route** `/competitors/:competitorId/canvas` — clicking a competitor anywhere (landscape
  page, Threat Index tile, War Room delta badge) opens their **full BMC breakdown**: same
  9-block layout, read-only, evidence-linked items, freshness stamps, and their metric strip
  (momentum, pricing posture, SoV) across the top.
- **Compare mode** — toggle overlays your canvas vs theirs section-by-section: side-by-side
  items, where they're stronger (gap-engine scores), where you win. This is the "dissect them"
  view.
- **Borrow idea** — hover any competitor canvas item → "Explore for us": sends it to *your*
  relevant section agent as a chat prompt + draft proposal ("Acme bundles onboarding as a paid
  tier — should we?"). Ideas flow through the normal proposal/approval loop, so borrowing is
  studied, not copy-pasted.
- **Ask Atlas about this company** — persistent button; opens War Room chat pre-loaded with
  that competitor's context.
- Refresh: competitor canvases refresh via the Competitor Delta Sweep cascade; each section
  shows its last-verified stamp so staleness is visible.

## 8. Dashboard composition (revised)

Top row: **4 composite indices** with sparklines + Atlas's Read badge when a narrative is
attached. Second row: **KPI rail** (target vs actual). Third: **Competitor strip** — one card
per competitor (Threat Index, momentum arrow, last delta event, click → their BMC). Fourth:
existing operational panels (agent activity, loops, reports). The current gaps/evidence/health
tiles fold into the composites' drill-downs.

## 9. Build sequencing

1. With ROADMAP Phase 3 (research engine): `data_feeds` registry + T1 fetchers (pricing,
   reviews, changelogs, FRED, Trends) + `metric_snapshots` writes.
2. With Phase 4 (gap engine): competitor metric families, Threat Index, competitor BMC
   drill-down + compare mode.
3. With Phase 5: KPI table + rail + owner-agent loops; SoV family via Grok.
4. With Phase 6 (War Room): detection→pattern→narrative pipeline, Atlas's Read panel,
   composite indices as the Map footer's data source.
