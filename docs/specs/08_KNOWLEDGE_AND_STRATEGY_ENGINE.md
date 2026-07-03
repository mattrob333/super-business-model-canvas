# Spec 08 — Agent Knowledge & Strategy Engine

> How agents *know things* and how Atlas *thinks*. This spec defines the per-agent
> knowledge stack (watched sources → dossiers → Atlas summaries), the accuracy-first
> onboarding pipeline, the grounding pass that turns a generic canvas into a searchable
> one, and Atlas's strategy engine: playbook contracts, the Theory of Constraints
> operating loop, and board-ready framework visualization.
>
> Required pre-reading for Phases 5 and 6. Builds on specs 01 (roster), 02 (workspaces),
> 03 (War Room), 04 (orchestration), 05 (feeds), 06 (routing).

## 0. Principles (binding)

1. **Outside-in is researched; inside-out is elicited.** Public facts (competitor
   pricing, hiring, news) are researched with citations. Internal facts (our cost
   lines, churn numbers, real partner deals) are asked of the owner via structured
   `owner_questions` — never guessed. Every dossier section is typed
   `researched | owner_provided`.
2. **Evidence discipline extends to dossiers.** Dossier claims cite `evidence_items`
   exactly like canvas items. Unverifiable claims are flagged or dropped. Owner
   answers become user-attested facts (confidence 0.95, `source_type: manual`) and
   are never overwritten by research without an approval-gated proposal.
3. **Generic → grounded is a ladder the product climbs visibly.** Sections carry a
   groundedness score; the UI shows where the system is still guessing.
4. **Cadences are budgeted.** Every loop reads through the FeedRunner cache (spec 05,
   built in Phase 3); dossier refreshes are incremental (what changed since last
   version), not full rewrites. Atlas's Subordinate step (§6.4) may retune cadences.

## 1. The knowledge stack

```
WATCHED SOURCES ──feeds──► DOSSIERS ──distill──► ATLAS SUMMARY
(where I look)            (what I know)          (what the board needs)
```

### 1.1 Watched sources — `watched_sources`

Per-agent registry of named monitoring targets.

| column | notes |
|---|---|
| id, account_id, agent_profile_id | account-scoped, agent-owned |
| kind | `url` \| `social_handle` \| `search_query` \| `feed_config` |
| target | the URL / handle / query string |
| label | human name ("Acme pricing page") |
| cadence | `daily` \| `weekly` \| `biweekly` \| `monthly` |
| last_checked_at, health, last_error | mirrors data_feeds health model |
| added_by | `agent` \| `user` — agents may add read-only watches without approval; outward actions still require approvals |
| entity | optional link to the grounded entity that spawned it |

RLS: account members read; writes via worker (service role, account-scoped in code)
and authenticated users for their account. Rendered in the workspace left rail under
Context (spec 02 §1c) with health dots; add/remove/pause inline.

### 1.2 Dossiers — `agent_documents`

Agent-authored living documents. One row per current version; `agent_document_revisions`
keeps history (same pattern as `agent_profile_revisions`).

| column | notes |
|---|---|
| id, account_id, agent_profile_id | |
| doc_key | stable key, e.g. `pricing_book` (unique per agent per account) |
| title, body_md | rendered markdown; sections annotated `researched`/`owner_provided` |
| version | increments on refresh |
| refresh_cadence | per-doc (see §4 tables) |
| last_refreshed_at, freshness_status | staleness sweep (Phase 3) extends to dossiers |
| evidence_ids | uuid[] — all citations used in current version |
| material_change | bool — did the last refresh change conclusions (not just data points)? |

**Refresh job** (`dossier_refresh`, scheduled via `scheduled_loops.action_key =
dossier_refresh:<agent_key>:<doc_key>`): pull fresh feed/cache data for the doc's
watched sources → agent rewrites *changed sections only* → verifier spot-checks new
claims (task class `research_verify`, never downgraded) → version++ → if
`material_change`, also refresh the Atlas summary (§1.3) and post an insight.

**Viewer UX** (Phase 5): workspace left rail gains a **Dossiers** group above context
sources — doc rows with freshness dot + cadence chip; click → drawer viewer with
rendered markdown, citation chips (→ evidence popover), version picker with diff,
"discuss" action that quotes a section into the composer. Read-only in v1; changes
are requested through chat (agent proposes, evidence-gated).

### 1.3 Atlas summaries

One special document per agent: `doc_key = 'atlas_summary'`. Strict contract:

```markdown
# <Agent> — Section Brief          (updated: <ts>, confidence: high|med|low)
## Current state        (max 3 bullets, each cited)
## Risks & opportunities (max 3, each: what → so-what → suggested owner)
## Watch items          (named entities/dates worth Atlas's attention)
## Last material change (one line + date)
```

Hard cap ~500 tokens. Rewritten only on `material_change` or weekly, whichever first.
Atlas holds all nine in standing context; full dossiers are fetched on demand via a
read-only `read_agent_document` MCP tool (no delegation needed for reads).

### 1.4 Owner questions — `owner_questions`

| column | notes |
|---|---|
| id, account_id, agent_profile_id | |
| question, why_needed | "What are your 3 largest monthly cost lines?" + which analysis is blocked |
| doc_key | dossier the answer feeds |
| status | `open` \| `answered` \| `dismissed` |
| answer, answered_at | answer becomes user-attested facts in the dossier |

Max **3 open per agent** (enforced in code). Surfaced: workspace banner, Atlas dock
pulse, weekly digest. Answering routes the fact into the dossier's `owner_provided`
section and clears the question.

## 2. Onboarding: accuracy-first deep research

Onboarding runs once per company — route it for accuracy, not cost.

| stage | what | notes |
|---|---|---|
| 0 | URL intake | normalize domain, resolve company name |
| 1 | Breadth gather | Firecrawl multi-page (home, about, pricing, product, customers, careers, blog index, press) + Grok live search (what they do, funding, competitors, recent news) + GDELT presence — all through FeedRunner |
| 2 | Extraction | **task class `onboarding_extract` on the mid tier** (not budget `extract`) → per-section claims + named-entity extraction (partners, competitors, customers, tech, people) |
| 3 | Verification | existing adversarial verifier, never downgraded |
| 4 | Competitor discovery | "X alternatives / X vs" searches + review-site categories → 3–7 candidates proposed to the user for confirmation |
| 5 | Seeding | cited canvas items; per-agent dossier skeletons; initial `watched_sources` from every named entity; Company Brief v1 |
| 6 | Grounding pass | §3 |

Implemented as a cascade (`onboarding_deep_research`) composing the existing
`company_research` machinery; new task class rows in `model_routes`
(§8). The current single-shot analyze flow remains as the fast path; deep onboarding
is the default for signed-in accounts.

## 3. The grounding pass (generic → named)

Post-onboarding the canvas says "cloud infrastructure providers"; agents need "AWS".

- **Structured wizard, not a comment box.** Per section: (a) agent-proposed candidates
  *with evidence* ("Careers page mentions AWS and Snowflake — key resources? [confirm]
  [edit] [no]"), (b) owner-only blanks (real partner names, top customers, payment
  processor, sales motion). ~10 minutes total, skippable, resumable. Atlas can host the
  same pass conversationally in the dock as an alternative.
- Each confirmation: upgrades the canvas item generic→named (`grounded: true`,
  user-attested provenance) → spawns `watched_sources` suggestions → unlocks loops that
  need real names.
- **Groundedness score** per section = share of items that are named+attested or
  named+verified. Shown on section cards and workspace instruments; feeds the War Room
  Map health tint (spec 03). The product visibly tells the user where it's guessing.
- Re-grounding: agents may propose upgrades later ("I believe your payment processor
  is Stripe — confirm?") as normal proposals.

## 4. Per-agent knowledge specs

Common shape: mission · dossiers (cadence) · source registry examples · proactive
loops · Atlas-summary emphasis · example owner questions. All loops are
`scheduled_loops` rows; all fetches go through FeedRunner; event triggers come from
feed deltas (insight bus, spec 04).

### 4.1 Compass — Customer Segments (teal)
- **Dossiers:** Segment Profiles — per-segment ICP cards: firmographics, needs, WTP
  signals (monthly) · Market Sizing — TAM/SAM/SOM, sourced (quarterly) · Voice of
  Customer — clustered quotes from reviews/communities (weekly) · Segment Shift Log
  (event-driven).
- **Sources:** review platforms (G2/Capterra/Trustpilot/app stores), buyer communities
  (Reddit/forums), Google Trends per segment term, industry press, competitor
  "customers" pages.
- **Loops:** weekly review-mining pass · weekly Trends pull · monthly profile refresh ·
  event: competitor targets a new vertical → drift check.
- **Atlas summary:** segments ranked by fit/value; fastest-growing signal; underserved
  candidate; drift warnings.
- **Owner questions:** "Which segment drives most revenue today?" "Any segment you
  refuse to serve?"

### 4.2 Forge — Value Propositions (orange)
- **Dossiers:** Differentiation Matrix — us vs each competitor by capability (weekly) ·
  Proof & Evidence Bank — claims we can support publicly (monthly) · Positioning
  Narrative + alternatives (monthly) · Feature/Claim Watch (event-driven).
- **Sources:** competitor homepages/changelogs/release notes, ProductHunt/HN launches,
  review pros/cons, "X vs Y" comparison pages.
- **Loops:** weekly changelog scrape · weekly review pros/cons delta · monthly matrix
  rebuild · event: competitor launch → gap assessment vs our VP.
- **Atlas summary:** sharpest differentiators (cited); eroding ones; biggest "why we
  lose" theme.
- **Owner questions:** "What do customers say when they pick you over X?"

### 4.3 Relay — Channels (sky)
- **Dossiers:** Channel Map & Mix (monthly) · Share-of-Voice Report — us vs competitors
  across news/social/search (weekly) · Content & SEO Landscape (biweekly) · Channel
  Experiments Log (owner-assisted).
- **Sources:** GDELT news volume, competitor blogs + social handles (X via Grok,
  public LinkedIn/YouTube), podcast/newsletter appearances, SERP/Trends on money
  keywords.
- **Loops:** weekly SoV computation → `metric_snapshots` · weekly competitor content
  cadence scan · monthly channel map refresh · event: SoV drop > threshold → warning
  insight.
- **Atlas summary:** SoV trend + biggest mover; channel where competitors outpace us;
  one channel opportunity.
- **Owner questions:** "Which channel actually closes deals for you today?"

### 4.4 Anchor — Customer Relationships (emerald)
- **Dossiers:** Relationship Model — acquire/onboard/retain flow (quarterly) ·
  Sentiment & Churn Signals (weekly) · Community Presence (biweekly) · Competitor CX
  Teardown — their onboarding/support promises (monthly).
- **Sources:** review streams over time, competitor support/SLA pages, forums/Discord/
  Reddit, social mentions of brand+support terms, status pages.
- **Loops:** weekly sentiment pull + theme clustering · monthly CX teardown · event:
  negative theme spike → response play proposal.
- **Atlas summary:** sentiment trend; top loyalty driver + top churn threat; competitor
  CX advantage/weakness.
- **Owner questions:** "Roughly what % of customers renew/repeat?" (typed as estimate)

### 4.5 Yield — Revenue Streams (gold)
- **Dossiers:** Pricing Book — our pricing + dated competitor pricing matrix (weekly) ·
  Monetization Models — how everyone charges (monthly) · Deal & Discount Intel
  (event) · Unit Economics Estimates (monthly, owner-assisted, assumption-tagged).
- **Sources:** competitor /pricing pages (Firecrawl targets seeded in Phase 3),
  marketplaces (cloud marketplaces list real prices), public case studies, investor
  materials when public.
- **Loops:** weekly pricing-page diff sweep (flagship; feeds `pricing_war_response`
  cascade) · monthly monetization review · event: detected price change → pricing
  delta insight + cascade proposal.
- **Atlas summary:** our price position vs field; latest competitor moves; monetization
  gap; margin pressure signals.
- **Owner questions:** "What's your ARPU / average deal size?" "Any pricing floors?"

### 4.6 Vault — Key Resources (slate)
- **Dossiers:** Resource Inventory — team, IP, data, infra, brand (quarterly) · Talent
  Signal Report — our + competitor hiring decoded into bets (weekly) · Tech Stack &
  Dependencies (monthly) · Resource Risk Register — SPOFs (quarterly).
- **Sources:** careers pages (seeded target), public LinkedIn headcount trends, stack
  signals, GitHub org activity (feed exists), patents/trademarks, funding news.
- **Loops:** weekly careers scrape (ours + competitors) · monthly stack scan · event:
  competitor raise/exec hire → capability-shift insight.
- **Atlas summary:** capability advantages/deficits; what competitor hiring says
  they're building; top resource risk.
- **Owner questions:** "Team size and key roles?" "Any dependency you couldn't replace
  in 90 days?"

### 4.7 Tempo — Key Activities (violet)
- **Dossiers:** Operating Cadence — what must execute weekly/monthly (quarterly) ·
  Competitor Velocity Report — ship rate from changelogs/repos/releases (weekly) ·
  Process Bottleneck Log (monthly, owner-assisted) · Launch Readiness Playbook.
- **Sources:** changelogs/release notes, GitHub repo stats (feed exists), status/
  incident pages, app-store update frequency.
- **Loops:** weekly velocity comparison · monthly activity-coverage audit (are we
  doing the activities our value props require? cross-checks Forge) · event:
  competitor ships in our core area → alert Forge + Atlas.
- **Atlas summary:** our velocity vs field; the activity most behind; execution risk.
- **Owner questions:** "What's the slowest step between idea and shipped?"

### 4.8 Envoy — Key Partners (rose)
- **Dossiers:** Partner Ledger — current partners + health (monthly) · Partnership Map
  of the Market — who partners with whom, integration directories (monthly) · Prospect
  Pipeline — ranked candidates + why + warm paths (biweekly) · Alliance Threat Log
  (event).
- **Sources:** integration marketplaces/directories, partner pages, GDELT partnership
  queries, conference sponsor lists.
- **Loops:** weekly partnership-news sweep · biweekly prospect refresh · event:
  competitor lands marquee partner → threat assessment.
- **Atlas summary:** partner gaps vs competitors; top 3 outreach-ready prospects
  (outreach itself is approvals-gated); partnership threats.
- **Owner questions:** "Which partnerships actually produce revenue today?"

### 4.9 Ledger — Cost Structure (zinc)
- **Dossiers:** Cost Model — major lines, fixed/variable, drivers (monthly,
  owner-assisted) · Macro Cost Environment — rates/inflation/labor/cloud trends
  (monthly, FRED feed seeded) · Competitor Cost Posture — funding runway, layoffs,
  pricing-power signals (monthly) · Cost-Down Opportunity List (monthly, ranked).
- **Sources:** FRED series, cloud pricing pages, layoff/funding news via search,
  industry cost indices.
- **Loops:** monthly FRED refresh · monthly cost-down refresh · event: macro shift →
  cost-impact note.
- **Atlas summary:** cost position estimate; macro pressure direction; top cost-down
  move; competitor cost advantages.
- **Owner questions:** "Top 3 monthly cost lines?" "Which costs scale with revenue?"

## 5. Atlas's standing context

1. Company Brief (spec 02) · 2. the nine Atlas summaries · 3. competitor canvases +
gap register (Phase 4) · 4. metrics digest (`metric_snapshots` rollup) · 5. macro
snapshot (Ledger) · 6. **Goals & Guardrails** — user-authored doc, elicited by Atlas
on first War Room visit and editable: objectives with target metrics + horizon, risk
appetite, hard guardrails ("never compete on price"), context (runway, team size).
**Guardrails are enforced in the open:** a recommendation that violates one is flagged
as such with the tradeoff explained — never silently suppressed, never silently acted on.

## 6. Atlas's strategy engine

### 6.1 Playbook contracts

Every framework is a definition record (seeded table `frameworks` gains these fields):
`input_contract` (slots → which summaries/dossiers/data fill them), synthesis prompt,
`output_schema` (typed JSON), `renderer_key`, recommended cadence, trigger conditions.
Running one (`framework_run` job, premium tier): slot data assembled **by code** (not
by the model), model fills the schema with citations, verifier pass on factual claims,
stored as a `framework_outputs` row + rendered board (§7).

Core contracts:

| Framework | Slot ← source |
|---|---|
| **SWOT** | S ← Forge differentiation + Vault advantages · W ← gap register + Anchor churn themes + Tempo lag · O ← Compass segments + Envoy prospects + Relay channel gaps + macro tailwinds · T ← competitor moves + macro headwinds + Vault risks |
| **Porter 5F** | Rivalry ← competitor canvases + Relay SoV · Buyer power ← Compass concentration + Yield price pressure · Supplier power ← Vault dependencies + Ledger drivers · Substitutes ← Forge watch · New entrants ← funding news + entry-barrier signals |
| **Value Chain** | Primary ← Tempo + Relay + Anchor · Support ← Vault + Ledger · Margin ← Yield + Ledger |
| **Ansoff** | Products ← Forge VP variants · Markets ← Compass segments |
| **Blue Ocean ERRC** | Factor axes ← Forge differentiation matrix · Industry standard ← competitor canvases |
| **Positioning map** | Axes chosen by Atlas ← Pricing Book + Differentiation Matrix |
| **Evaporating cloud (TOC)** | ← conflict cards (spec 03) — two agents' opposing positions are literally the cloud's two branches |

### 6.2 Theory of Constraints — the operating loop

Atlas's doctrine, run weekly + on material events. State lives in `strategy_state`
(one row per account): `current_constraint`, `constraint_class`, `since`,
`evidence_ids`, `exploitation_moves`, plus a constraint history log.

1. **Identify.** Score six candidate constraint classes against the user's goal:
   *Visibility* (Relay SoV/reach) · *Demand* (Compass interest/pipeline signals) ·
   *Conversion/Offer* (Forge win-loss + Yield price position) · *Delivery capacity*
   (Tempo velocity + Vault resources) · *Retention* (Anchor) · *Cash/Margin*
   (Ledger + Yield). Pick **one**, with cited evidence. Naming it is mandatory —
   "everything needs work" is not an answer.
2. **Exploit.** Moves that maximize constraint throughput without new spend —
   delegated to the owning agent(s) as tasks.
3. **Subordinate.** Atlas proposes re-ranking every agent's agenda and retuning loop
   cadences around the constraint (approval-gated schedule changes; spec 03 right
   rail already shows these).
4. **Elevate.** Bigger moves (invest/hire/partner/reprice) enter Next Moves.
5. **Repeat.** When constraint metrics clear their threshold, re-identify; log the
   transition.

UI: persistent **Current Constraint banner** in the War Room (Map footer strip);
every Next Move tagged `[constraint]` / `[non-constraint]`; agenda ranking weights
constraint relevance above generic impact/effort.

### 6.3 Competitor triangulation rule

Formalized recommendation filter: **attack where we're strong, they're weak, and
buyers care** — Forge differentiation × Phase-4 gap engine (win/lose/tie per section)
× Compass segment-need weights. Defensive twin: shore up where they're strong, we're
weak, and buyers care.

### 6.4 Consultant voice

Pyramid principle, always: the answer first → three supports with citation chips →
"what I'd do this week" (concrete, owner-sized) → how we'll measure it. Framework
outputs get a one-paragraph "So what" on top of the board. No hedging walls; explicit
confidence labels where evidence is thin.

## 7. Framework visualization — board-ready outputs

- **Native renderers first.** Each `output_schema` maps to a React board component:
  SWOT 2×2 (colored quadrants), Five Forces radial, value chain arrows, ERRC grid,
  positioning scatter, constraint chain, evaporating cloud, BMC side-by-side compare
  (us vs competitor, heat-tinted). 16:9 board canvas, design-system styling (light
  grid background, agent accents), export PNG/PDF (html2pdf already in the app).
- **Stored & diffable.** `framework_outputs` (account_id, framework_key, input_digest,
  output_json, evidence_ids, created_by_run) — boards reopen from data, and two runs
  of the same framework can be diffed ("what changed since last quarter's SWOT").
- **Miro MCP as a later export integration** ("Send to Miro" action on any board) —
  distribution, not the product. The demo path never depends on third-party auth.

## 8. Model routing additions (spec 06 amendment)

| task class | tier | notes |
|---|---|---|
| `onboarding_extract` | mid (anthropic) | accuracy-first, one-time cost |
| `dossier_refresh` | mid | incremental rewrites, cited |
| `summary_update` | budget→mid escalation | small, frequent |
| `framework_run` | premium | board outputs, Atlas voice |
| `grounding_suggest` | budget | candidate generation only; user confirms |
| `research_verify` | mid, **never downgraded** | unchanged |

## 9. Phasing map

| Piece | Lands in |
|---|---|
| Competitor canvases + gap engine (Atlas inputs) | Phase 4 (unchanged) |
| `agent_documents` + revisions, `watched_sources`, `owner_questions`, dossier viewer, dossier_refresh/summary_update jobs, groundedness score, grounding wizard | **Phase 5** (with the workspaces they live in) |
| Atlas summaries consumption, Goals & Guardrails, playbook contracts + `framework_outputs` + native renderers, TOC loop + `strategy_state` + constraint banner, onboarding_deep_research cascade | **Phase 6** |
| SoV/velocity/etc. metric formalization, benchmarks | Phase 7 (as planned) |

Schema changes follow the standing rules: migrations + schema.sql mirror + types +
verify-schema assertions + RLS on every new table.
