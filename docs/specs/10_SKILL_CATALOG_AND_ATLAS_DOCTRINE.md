# Spec 10 — The Skill Catalog & Atlas's Decision Doctrine

> Written 2026-07-04 from the owner's design brief: each of the nine section agents gets
> a catalog of signature workflows ("skills") that produce valuable artifacts; Atlas
> combines sections for synergistic insight and decides strategy like a general.
> Extends spec 01 (roster), 04 (cascades/skills tables), 05 (feeds), 08 (knowledge).
> Build phasing at the bottom. Binding for Phase 5B (skill surfacing) and Phase 6 (Atlas).

## 1. What a skill is

A **skill** is a packaged, repeatable workflow an agent executes on demand, on a cadence,
or when Atlas delegates it — producing a **typed artifact** the owner can read, share,
and act on. Skills differ from dossiers (standing knowledge, spec 08) and loops
(watching): a skill is a *craft* that ends in a deliverable.

Every skill is defined by one contract:

```
skill_key:        yield.pricing_teardown
agent:            Yield (revenue_streams)
trigger:          manual | cadence:<cron> | event:<insight tag> | atlas
inputs:           canvas slots (sections read) · dossier summaries · feeds used
apis:             the named fetchers behind it (all through FeedRunner — no direct calls)
method:           numbered steps, incl. model task_class per step
verification:     what the adversarial verifier checks before the artifact ships
output:           artifact type + format (md body + typed json payload; see §4)
storage:          generated_reports row (kind=skill_artifact) + evidence links
guardrails:       cost class · outward actions via approvals only · section write scope
```

Skills are **seeded as `agent_skills` rows** (table exists since Phase 1;
`orchestrator_can_trigger` marks the ones Atlas may delegate). Execution is one worker
job kind, `skill_run`, dispatching on `skill_key` — one pipeline, many crafts.

## 2. The catalog (v1: three signature skills per agent)

APIs available today: Firecrawl scrape, Grok live search, Google Trends, FRED, GDELT,
GitHub stats. Marked ⊕ where a paid feed (SEMrush/Similarweb/Crunchbase, spec 05 §6)
upgrades the skill later — every skill must degrade honestly without it.

### Yield — Revenue Streams
| Skill | What it does | Output artifact |
|---|---|---|
| `pricing_teardown` | Crawls every competitor's pricing page, normalizes into models (per-seat, usage, tiers, freemium, services), price points, packaging axes; positions yours in the matrix; recommends a strategy with 2–3 scenarios | **Pricing matrix board** + recommendation memo |
| `monetization_gaps` | Revenue streams competitors run that you don't (services, marketplace rake, add-ons, certification) with adoption evidence | Ranked opportunity list |
| `wtp_signals` | Mines review language about price ("expensive", "worth every penny", "bill shock") per segment; flags under/over-pricing signals | WTP signal report per segment |

### Envoy — Key Partners
| Skill | What it does | Output artifact |
|---|---|---|
| `supply_chain_map` | Maps upstream suppliers / downstream distribution of the industry (Grok + Firecrawl on industry directories, competitor partner pages); scores partnership candidates by strategic fit + evidence | **Partner target map** (tiered list w/ rationale) |
| `partner_outreach` | Drafts personalized outreach for approved targets (their language, mutual value framing). **Outward action: drafts land in the approvals queue, never sent autonomously** | Outreach drafts (approvals) |
| `ecosystem_watch` | Event-driven: competitor announces a partnership → counter-partner or fast-follow suggestions | Insight + counter-move memo |

### Relay — Channels
| Skill | What it does | Output artifact |
|---|---|---|
| `channel_gap_scan` | Where competitors get distribution vs you: SEO posture, marketplaces/app stores, integration directories, social/community presence ⊕Similarweb | **Channel strategy board** (effort × impact ranked) |
| `watering_holes` | Where the ICP actually congregates — communities, newsletters, podcasts, events — with entry strategy per hole | Watering-holes report + engagement plan |
| `channel_economics` | Estimates CAC posture per channel from public signals (ad presence, content volume, partner programs); pairs with Ledger | Channel economics table |

### Compass — Customer Segments
| Skill | What it does | Output artifact |
|---|---|---|
| `avatar_refinement` | Mines reviews/communities for the segment's own words: pains, jobs, buying triggers, objections → updates ICP cards (spec 08 dossier) + messaging hooks | **ICP one-pagers** (per segment) |
| `segment_expansion` | Adjacent segments competitors serve (their case-study/customers pages) scored by fit with your capabilities (reads Vault's moat audit) | Expansion shortlist |
| `message_market_fit` | Compares your site's language to the segment's language from reviews; rewrite suggestions in *their* words (pairs with Forge) | Before/after messaging table |

### Forge — Value Propositions
| Skill | What it does | Output artifact |
|---|---|---|
| `differentiator_audit` | For each VP claim: which competitors claim the identical thing → uniqueness score per claim; flags parity claims dressed as differentiators | **Differentiation matrix** |
| `proof_gap_scan` | Claims lacking public proof (case studies, numbers, third-party validation) vs competitors' proof density | Proof gap list + evidence-building plan |
| `positioning_brief` | Synthesizes differentiation + segment language into a one-page positioning statement (alternatives considered, trade-offs stated) | Positioning brief (shareable) |

### Anchor — Customer Relationships
| Skill | What it does | Output artifact |
|---|---|---|
| `churn_signal_audit` | Clusters complaint themes from your + competitor reviews; maps each to a retention play | Churn risk report |
| `lifecycle_map` | Onboarding→adoption→renewal touchpoints; compares competitor motions (self-serve vs CSM vs community) and marks your gaps | **Lifecycle map board** |
| `advocacy_engine_scan` | How competitors manufacture advocates (review programs, communities, champions); actionable equivalents for your scale | Advocacy playbook |

### Tempo — Key Activities
| Skill | What it does | Output artifact |
|---|---|---|
| `operational_benchmark` | Careers pages (hiring mix as activity-investment proxy) + changelogs (ship velocity) across competitors → capability gap analysis | Capability gap analysis |
| `build_vs_buy` | Activities you run in-house that the market sells as a service; switching cost/benefit sketch per candidate | Build-vs-buy shortlist |
| `velocity_watch` | Event-driven ship-velocity deltas (GitHub stats, changelog cadence) → "they're outshipping you in X" insights | Velocity delta insight |

### Vault — Key Resources
| Skill | What it does | Output artifact |
|---|---|---|
| `moat_audit` | Classifies your resources by defensibility (data, network, brand, IP, switching costs) with evidence; scores durability | **Moat audit board** |
| `single_point_scan` | Concentration risks: key-person, single supplier, platform dependency (built on X's API? one cloud?) | Risk register additions |
| `talent_radar` | Competitor hiring by function over time → where they're investing ahead of announcements | Talent movement report |

### Ledger — Cost Structure
| Skill | What it does | Output artifact |
|---|---|---|
| `cost_benchmark` | Typical cost structure for your business-model archetype (sourced benchmarks, FRED macro where relevant) vs your stated structure; asks owner questions for the private numbers it can't research | Cost benchmark memo |
| `unit_economics_frame` | Builds the CAC/LTV/payback frame from what's known; owner questions fill the gaps (never invented — spec 08 rule) | Unit economics one-pager |
| `efficiency_scan` | Vendors/tooling that attack your named top cost drivers, with adoption evidence from similar companies | Efficiency shortlist |

## 3. Atlas: synergy plays (cross-section skills only Atlas can run)

Atlas's edge is vantage: he is the only entity that reads all nine summaries, all
competitor canvases, the gap register, and the owner's attested private truths. Synergy
plays are **cascades** (spec 04) composing section skills, ending in an Atlas synthesis:

| Play | Combines | The insight class it catches |
|---|---|---|
| `pricing_power` | Yield.pricing_teardown × Forge.differentiator_audit × Compass.wtp_signals | "You are underpriced for segment X given capability Y no competitor has" |
| `partner_flywheel` | Envoy.supply_chain_map × Relay.channel_gap_scan | Partners who ARE distribution (integration marketplaces, resellers) — one move, two sections |
| `segment_collision` | Compass.segment_expansion × Ledger.unit_economics_frame × Anchor.churn_signal_audit | The fast-growing segment that quietly loses money or churns |
| `moat_message` | Vault.moat_audit × Forge.positioning_brief | The durable advantage your marketing never mentions |
| `capacity_check` | Tempo.operational_benchmark × any expansion play | "This strategy assumes a capability you don't have yet" — the veto play |
| `bill_shock` | Yield.pricing_teardown × Anchor.churn_signal_audit | Usage pricing + billing complaints = churn time-bomb |

Each play's output is an **Atlas brief** (spec 03): the finding, the evidence chain,
the recommended move, and what he'd watch to know if it's working.

## 3b. The Document Studio (Atlas workflow — owner brief 2026-07-04)

The system already holds everything a startup's paperwork is made of: verified canvas,
dossiers, competitor matrices, gap register, pricing analysis, owner-attested truths,
and the company's captured branding (logo pipeline, 5.11). The Document Studio is the
Atlas workflow that assembles it into the documents a company actually needs:

| Document | Assembled from |
|---|---|
| **Business plan** | canvas (all nine) + dossiers + market sizing + unit economics frame |
| **Pitch deck** (outline + speaker notes; slide-ready markdown v1, native slides later) | positioning brief + segments + pricing + moat audit + traction/owner inputs |
| **Investor prospectus / one-pager** | Atlas summary + differentiators + gap-informed risks (honest risk section is a FEATURE — evidence-cited risks build trust) |
| **Data-room starter pack** | competitor landscape, market analysis, pricing teardown, risk register — each an existing artifact, bundled |

Rules: each document is a **composition of existing verified artifacts** — the studio
never generates fresh unverified claims; where a required input is missing it inserts
an honest gap ("needs owner input: churn rate") and files an owner question. Branding:
letterhead/cover from `companies.logo_url` + brand_assets (owner-editable). Outputs are
`skill_artifacts` (kind per document) → exportable PDF + revocable share link (6.10
machinery). Provenance appendix optional: every claim's source, one click away — the
signature move no template tool can copy.

Phasing: **Phase 6** work order 6.11 (after Atlas summaries + share links exist, which
the studio depends on). Not before — a document studio built on ungrounded data would
be a very pretty way to embarrass a founder in front of an investor.

## 4. Artifact contract (all skills)

Every artifact is a `generated_reports` row: `kind='skill_artifact'`, `skill_key`,
markdown body (the readable document), `payload` (typed JSON per skill for boards/
matrices to render natively — spec 08 §7 renderers), `evidence_ids` (every claim
traceable), `inputs` (canvas/dossier versions read — reproducibility), account-scoped
RLS. Artifacts are shareable via the Phase 6 share-link machinery (BUILD_PLAN 6.10).
Honest-empty rule: a skill with insufficient evidence returns "what I'd need" — never
a padded report.

## 5. Atlas's decision doctrine (how the general chooses)

The owner's question: how does Atlas pick attack vectors, battle strategies, genius
moves? Doctrine, in order:

1. **One constraint at a time (the attack vector).** Strategy fails by dilution. Atlas
   maintains `strategy_state` (spec 08 §6): given the owner's goal (Goals & Guardrails),
   score every section as the *binding constraint* — health, gap severity, competitor
   delta, groundedness, momentum. The constraint is the attack vector; everything else
   is maintenance. The War Room banner names it and why.
2. **Generate options from opposing postures.** For the constraint, Atlas runs the
   relevant skills/synergy plays, then drafts three candidate moves from deliberately
   different postures — **attack** (take ground: new segment/channel/pricing),
   **fortify** (defend: retention, moat, proof), **reposition** (change the game:
   messaging, packaging, partnerships). Judge-panel style: diversity beats iteration.
3. **Score by expected leverage.** `impact-on-goal × evidence-confidence × speed ÷
   (cost + risk)`, versioned formula, inputs stored. Guardrail violations are vetoes,
   not penalties. Low-groundedness inputs cap confidence — Atlas visibly says "I'm
   guessing here" instead of bluffing.
4. **Prefer reversible probes; escalate commitment on evidence.** Real-options logic:
   between two moves of similar leverage, the reversible one wins. Irreversible or
   outward-facing moves demand a higher evidence bar AND owner approval (approvals
   queue — always). Genius generals don't bet the army on a hunch; they scout, then
   strike.
5. **Hunt asymmetries — the genius-move generator.** The moves that look brilliant in
   hindsight are combinations nobody else could see. Atlas systematically crosses:
   *owner-attested private truths* (which competitors can't read) × *public competitor
   deltas* × *timing signals* (their pricing change, their key-person exit, a macro
   turn). Concretely: a weekly `asymmetry_sweep` play that asks one question — "what do
   we know that the market doesn't, and where does it intersect a competitor's exposed
   flank this month?"
6. **After-action review.** Every agenda item carries its predicted effect; accepted
   items get outcome checks on a cadence; dismissed items record why. The doctrine's
   scoring weights are periodically re-examined against this record — the general
   studies his own battles. (Data model: `agenda_items` outcome fields, Phase 6/7.)

Anti-doctrine (vetoes): never more than one strategic push at a time · no move built on
unverified claims presented as verified · no outward action without approval · when two
agents' findings conflict, arbitration (conflict cards, spec 03) precedes any move
built on either.

## 6. Build phasing

- **Phase 5B**: seed the catalog into `agent_skills` (all §2 rows, `skill_key` in
  `action_kind`); rooms surface them in the ActionsPanel (spec 02 — already designed);
  `skill_run` worker job executes the 3–4 highest-value skills first
  (`pricing_teardown`, `supply_chain_map`, `channel_gap_scan`, `avatar_refinement`);
  artifacts render as documents (native boards come with spec 08 §7 in Phase 6).
- **Phase 6**: Atlas doctrine loop (§5) on `strategy_state`; synergy plays as seeded
  cascades; artifact share links; native board renderers for matrix/map artifacts.
- **Phase 7**: outcome tracking (§5.6) joins the metrics layer; paid-feed upgrades (⊕).
- Skills not yet implemented are **not shown as runnable** — the catalog ships in the
  UI only as fast as the worker can execute it (no fake completeness).
