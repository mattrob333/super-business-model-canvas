# ATLAS WORKFLOW LIBRARY — Super BMC Framework Runtime
*Catalog of multi-step framework workflows Atlas can run against canvas context · July 2026*

---

## 1 · THE CORE PATTERN

Every workflow is a **registry card**, not a prompt blob. Atlas loads the card, checks inputs against the canvas, runs steps, writes artifacts.

```yaml
# workflow card schema (extends your ai-skill-index skill.template.yaml)
id: hormozi-brain-os
name: Hormozi Brain OS
category: marketing-offers
inputs_required:      # mapped to BMC blocks
  - customer_segments
  - value_proposition
  - revenue_streams
  - channels
inputs_optional:
  - proof_assets
  - competitors
inputs_missing_prompt: "Ask user for: current price, proof assets, capacity constraints"
tools_allowed: [web_search, web_fetch, fireflies_mcp, common_room_mcp, supabase]
steps:                # each step = one LLM call w/ compact context
  - id: 00-market-fit
    reads: [canvas_snapshot]
    writes: artifact/market-fit.md
  - id: 01-value-equation
    reads: [canvas_snapshot, artifact/market-fit.md#verdict]
    writes: artifact/offers.md
  # ...
output_artifact: full-marketing-os.md
est_context_per_step: ~8k tokens
```

**Context management (your "as context fills up" problem):** each step reads only (a) a compact canvas snapshot (~1–2k tokens, regenerated from Supabase, never the raw scrape) and (b) the *summary block* of the prior step's artifact — not the full artifact. Artifacts persist to Supabase/Blob; the conversation window stays flat no matter how long the workflow chain gets. Summarize-and-forget is the rule; the canvas is the only permanent context.

---

## 2 · TIER 1 — RUNNABLE TODAY (canvas context is sufficient, tools fill the rest)

| # | Workflow | Framework source | Steps (sketch) | Tools used | Output artifact |
|---|---|---|---|---|---|
| 1 | **Hormozi Brain OS** ✅ built | $100M Offers/Leads | 00–06 as shipped | web_search | Full marketing OS |
| 2 | **Positioning Sprint** | April Dunford, *Obviously Awesome* | isolate true competitive alternatives → unique attributes → value themes → best-fit segment → market category frame → (optional) trend layer | web_search for alternatives/category language | Positioning canvas + boilerplate messaging |
| 3 | **BrandScript Generator** | Donald Miller, StoryBrand SB7 | character → problem (ext/int/philosophical) → guide (empathy+authority) → plan → CTA → stakes → success/identity transformation | none required; web for voice benchmarks | One-liner, brand script, website wireframe copy |
| 4 | **Five Forces War Room** | Porter | force-by-force analysis, each force researched live: rivals, substitutes, new entrants, supplier power, buyer power → threat ranking → strategic posture | web_search + web_fetch (competitor sites, pricing pages, G2, job posts) | Industry structure memo + moat implications |
| 5 | **Blue Ocean ERRC** | Kim & Mauborgne | map industry's competing factors (researched) → score us vs. rivals → Eliminate/Reduce/Raise/Create grid → new value curve → tagline test | web_search | Strategy canvas + ERRC grid |
| 6 | **7 Powers Moat Audit** | Hamilton Helmer | test each power (scale economies, network, counter-positioning, switching costs, brand, cornered resource, process power) against the business → which is *attainable* at current stage → the one move | web_search for comps | Moat thesis + power roadmap |
| 7 | **Riskiest Assumption Sprint** | Lean Startup / Ash Maurya | extract every assumption embedded in the canvas → rank by (impact × uncertainty) → design cheapest falsifying test per top-5 → 2-week test calendar | none | Assumption backlog + test cards |
| 8 | **SWOT→TOWS Action Engine** | classic, done right | research-grounded SWOT (not vibes: cite evidence per cell) → TOWS cross-matrix → SO/WO/ST/WT moves → top-5 actions | web_search | Action matrix, not a poster |
| 9 | **Working Backwards PR/FAQ** | Amazon | future press release → customer FAQ → internal FAQ (hard questions) → tenets → what-we're-NOT-building | none | PR/FAQ doc — brutal product clarifier |
| 10 | **Pre-Mortem Tribunal** | Klein (you already have the skill!) | "it's 18 months later and this failed" → independent failure narratives (market, execution, cash, founder) → converge on top kill-risks → tripwires + mitigations | none | Kill-risk register w/ tripwire metrics |
| 11 | **Crossing the Chasm GTM** | Geoffrey Moore | beachhead segment selection scorecard → whole-product gap map → positioning formula → bowling-pin expansion sequence | web_search | Beachhead GTM plan |
| 12 | **Category Design Sprint** | *Play Bigger* | problem POV → category name candidates → category blueprint → lightning-strike plan | web_search (existing category language) | Category POV + strike plan |
| 13 | **Competitive Intel Sweep** | (tool-native, no book needed) | scrape competitor sites/pricing → G2/review mining → LinkedIn job-posting signal read → ad library check → synthesis: their strategy inferred from artifacts | web_fetch heavy; browser MCP | Living competitor dossier |
| 14 | **ICP & Persona Forge** | JTBD-lite + firmographic | derive ICP hypothesis from canvas → enrich with Common Room / web signals → 3 personas w/ watering holes, trigger events, disqualifiers | Common Room MCP, web_search | ICP one-pager + targeting spec |
| 15 | **Ansoff × Three Horizons Growth Map** | Ansoff / McKinsey | classify current revenue into H1/H2/H3 → generate moves per Ansoff quadrant → risk-weight → sequencing | web_search | Growth options portfolio |

## 3 · TIER 2 — RUNNABLE WITH ONE MISSING INPUT (list = what to collect + which connector supplies it)

| # | Workflow | Framework | Missing input | How Atlas gets it |
|---|---|---|---|---|
| 16 | **Pricing Lab** | Madhavan Ramanujam *Monetizing Innovation* + Hormozi pricing + price-metric design | willingness-to-pay signal | Phase 1 runs today (price metric selection, packaging G/B/B, competitor price scrape via web). Phase 2 (WTP) needs 5–10 customer conversations → **Fireflies MCP mines existing sales-call transcripts for price reactions** before you ever run a survey. Van Westendorp survey = optional phase 3, needs a form tool. |
| 17 | **JTBD Switch Interview Engine** | Bob Moesta / Clay Christensen | customer interview transcripts | **Fireflies MCP** — you're already sitting on transcripts. Workflow: mine transcripts for push/pull/anxiety/habit forces → jobs map → opportunity scoring. If no transcripts: generates the interview guide + recruits list instead. |
| 18 | **Unit Economics Engine** | LTV:CAC, payback, contribution margin | actuals: CAC, churn, ARPU | **Stripe (via Supabase mirror or Stripe MCP)** + ad-spend numbers. Without actuals it runs in "model mode" with stated assumptions and sensitivity tables — still useful pre-revenue. |
| 19 | **Kano/RICE Roadmap Prioritizer** | Kano + RICE | feature list + user feedback corpus | Feature list from Linear MCP; feedback from support inbox / reviews scrape. Without feedback, Kano runs as hypothesis-mode. |
| 20 | **NPS/Churn Autopsy** | Sean Ellis PMF survey + churn cohort analysis | usage + cancellation data | Product analytics or Supabase events table. Pure post-revenue workflow — park until TakeoffSpeed has cohorts. |
| 21 | **EOS/Traction V/TO Builder** | Gino Wickman | founder answers (core values, 10-yr target, quarterly rocks) | Not scrapeable by design — needs a 15-min guided interview mode. This is where the repo's **Process Interviewer** pattern plugs in (see §4). |
| 22 | **MEDDIC Deal Qualifier** | MEDDIC/MEDDPICC | live pipeline data | CRM connector (or Common Room). Runs per-deal: metrics, economic buyer, decision criteria/process, pain, champion → gap flags + next actions. |
| 23 | **Naming & Message Test Lab** | classic copy testing | audience to test against | Generates name/tagline candidates today (MAGIC, alliteration banks, linguistics checks + trademark/domain scan via web). Real testing needs an ad budget or audience — output includes the $50 Meta test spec. |

## 4 · TRANSFORMS FROM ai-skill-index (your repo → Atlas workflows)

The repo is mostly *delivery systems* (n8n/agent builds). The ones that convert cleanly into Atlas-native workflows:

| Repo asset | Becomes | Notes |
|---|---|---|
| **Context Files & Questionnaire** | **Atlas Intake Engine** — the questionnaire IS how the BMC gets populated for a business Atlas hasn't scraped | Highest-leverage transform in the repo |
| **Process Interviewer** | **Guided Interview Mode** — the interaction pattern for workflows needing founder answers (EOS #21, Pricing WTP #16) | One mode, reused by many workflows |
| **De-slop Skill** | **Universal output post-processor** — every workflow's copy artifacts pass through it before save | Cheap, applies everywhere, matches your operator voice rule |
| **Competitor Ad Spying + Price Tracker + LinkedIn Jobs Intel** (3 assets) | Merged into **Competitive Intel Sweep (#13)** as tool sub-routines | Their n8n logic becomes Atlas tool-call sequences |
| **LinkedIn Content System in a Box** | **Content OS workflow** — pairs with Hormozi module 05; canvas → 30-day calendar → (optionally) your existing Telegram-approval remix pipeline | Bridges Super BMC to your real posting stack |
| **Meeting to Proposal Agent** | **Proposal Forge** — Fireflies transcript + canvas → SOW draft | Direct Tier 4 client-delivery value |
| **Landing Page Prompts** | Final step bolted onto Hormozi #06 — punch-list item 1 automated | Offer → page copy → wireframe |
| **AI Agency Sales & Pricing Framework** | Source material folded into Pricing Lab (#16) | Don't ship as separate workflow |

Skipped as Atlas workflows (stay delivery assets): the n8n courses, ecommerce templates, SEO automations — wrong runtime, right catalog.

## 5 · BUILD ORDER (first five)

1. **Positioning Sprint (#2)** — most complementary to Hormozi (Hormozi = offer, Dunford = frame), zero missing inputs, and every Tier 4 client needs it.
2. **Competitive Intel Sweep (#13)** — pure tool leverage; makes every other workflow smarter because its dossier becomes a shared artifact others read.
3. **Pre-Mortem Tribunal (#10)** — you already own the skill; porting it validates the registry-card format with near-zero authoring cost.
4. **Pricing Lab phase 1 (#16)** — you named pricing explicitly, and TakeoffSpeed needs it *this quarter* (the $79 founding price is currently my assumption, not analysis).
5. **Riskiest Assumption Sprint (#7)** — turns any canvas into a test plan; the natural "what now?" after any other workflow finishes.

Sequencing logic: 1–3 prove the architecture on three different shapes (research-light, tool-heavy, ported-skill). 4–5 are the ones your own businesses will consume immediately — dogfood before catalog-building.

## 6 · ARTIFACT GRAPH (why this compounds)

Workflows read each other's outputs: Intel Sweep dossier → feeds Five Forces, Positioning, Pricing. Positioning statement → feeds BrandScript, Hormozi hooks, Category Design. Assumption Sprint results → update the canvas itself, which re-parameterizes everything downstream. The library isn't a menu — it's a DAG. Store artifacts with typed IDs so cards can declare `reads: [artifact/competitor-dossier]` and Atlas auto-suggests "run Intel Sweep first?"
