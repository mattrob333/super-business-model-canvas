# ATLAS WORKFLOW CARD — POSITIONING SPRINT
*Framework: April Dunford, "Obviously Awesome" (10-step positioning method, adapted to 6 runnable steps)*
*Status: FULLY BUILT · v1.0 · This card is the authoring template for all future workflows.*

---

## REGISTRY CARD

```yaml
id: positioning-sprint
name: Positioning Sprint
category: strategy-positioning
framework_source: "April Dunford — Obviously Awesome"
version: 1.0

inputs_required:            # canvas variables Atlas injects
  - customer_segments
  - value_proposition
  - key_features            # or product description
  - competitors             # even a partial list; step 1 expands it

inputs_optional:
  - proof_assets
  - artifact/competitor-dossier   # if Intel Sweep ran first, step 1 gets skipped-ahead
  - won_deal_notes                # best customers + why they chose us

missing_input_behavior: >
  If competitors empty → step 1 runs in full-research mode (web required).
  If won_deal_notes absent → step 3 flags confidence LOW and lists the
  3 customer questions that would raise it.

tools_allowed: [web_search, web_fetch]
tools_required_steps: [1, 5]

steps: [s1-alternatives, s2-attributes, s3-value, s4-segment, s5-category, s6-assembly]

produces_variables:         # written to business brain on completion
  - positioning.competitive_alternatives[]     # {name, type, why_chosen, our_edge}
  - positioning.unique_attributes[]            # {attribute, evidence, alternative_lacking}
  - positioning.value_themes[]                 # {theme, attributes[], customer_value, proof}
  - positioning.best_fit_segment               # {who, characteristics[], why_they_care_most}
  - positioning.category_frame                 # {approach: head_on|subcategory|new_game, category_name, rationale}
  - positioning.statement                      # canonical one-paragraph positioning
  - positioning.one_liner                      # ≤20 words
  - positioning.confidence                     # high|medium|low + why

consumed_by: [hormozi-brain-os, brandscript, pricing-lab, category-design, crossing-chasm]
output_artifact: positioning-sprint.md
output_page_hint: comparison-strip + value-theme-cards + statement-hero
est_context_per_step: 6-10k tokens
```

---

## SYSTEM PREAMBLE (injected before every step)

```
You are running the Positioning Sprint, step {N} of 6, following April Dunford's
positioning methodology. You are positioning THIS business:

<canvas_snapshot>
{compact canvas: segments, value prop, features, known competitors, stage}
</canvas_snapshot>

<prior_step_variables>
{JSON variables emitted by completed steps only — never full artifacts}
</prior_step_variables>

RULES (all steps):
- Positioning is context-setting, not slogan-writing. No taglines until step 6.
- Evidence over assertion: every claim about competitors or customers must cite
  a source (URL from research) or be tagged [ASSUMPTION].
- Reject vague outputs. "Better UX" is banned; "uploads photos of paper plans,
  which {competitor} rejects" is the standard.
- Every step ends with TWO blocks in this exact order:
  1. ARTIFACT SECTION — markdown, human-readable, will be concatenated into the report
  2. VARIABLES — fenced JSON matching this step's schema exactly. No prose inside.
- If research contradicts the canvas, say so explicitly — do not silently comply.
```

---

## STEP 1 — TRUE COMPETITIVE ALTERNATIVES

```
TASK: Establish what customers would ACTUALLY do if this product didn't exist.
Dunford's rule: your real competition is rarely who you think — it includes
"do nothing," spreadsheets, interns, and duct-tape processes.

1. From the canvas competitor list plus your own research, identify candidate
   alternatives in four classes:
   a) DIRECT competitors (same solution shape)
   b) INDIRECT (different shape, same job)
   c) STATUS QUO (manual process, spreadsheet, "eyeball it", do nothing)
   d) HIRE/DELEGATE (employee, contractor, agency does it instead)

2. RESEARCH (required): for the top 5-8 candidates, web_search + web_fetch their
   pricing page, positioning language, and 2-3 review-site complaints (G2,
   Capterra, Reddit, app stores). Capture: their stated category, price, who
   they say they're for, and what real users say they lack.

3. Rank alternatives by what the TARGET SEGMENT most commonly does today
   (not by who scares us most). Status quo usually ranks #1 — say so if true.

4. For each of the final 4-6 alternatives, one line: why a customer picks it,
   and the single sharpest thing we do that it cannot.

ARTIFACT SECTION: "Who We Actually Compete With" — table + 2-paragraph narrative
on what this reveals (especially if the real enemy is the status quo).

VARIABLES:
{ "competitive_alternatives": [ { "name": "", "type": "direct|indirect|status_quo|hire",
  "share_of_today": "primary|common|rare", "why_chosen": "", "our_edge": "",
  "price": "", "source_urls": [""] } ] }
```

## STEP 2 — UNIQUE ATTRIBUTES

```
TASK: List what we have that the alternatives from step 1 lack. Attributes are
FACTS about the product/company — features, capabilities, delivery model,
business model, team credentials — not benefits yet.

1. Generate 10-15 candidate attributes from the canvas + product description.
2. Kill every attribute that ANY step-1 alternative also credibly has. Be harsh:
   "AI-powered" dies if a competitor claims it; "reads photos of paper plans"
   survives only if research shows alternatives reject them.
3. For each survivor, name WHICH alternative(s) lack it and the evidence
   (from step-1 research or [ASSUMPTION]).
4. Include non-product attributes if genuinely unique (founder domain
   credibility, data advantage, delivery model, geographic focus).

Target: 5-8 defensible unique attributes. If fewer than 3 survive, STOP and
flag: "positioning problem is actually a differentiation problem" — recommend
running Blue Ocean ERRC or product work before continuing.

ARTIFACT SECTION: "What Only We Have" — attribute table w/ evidence column.

VARIABLES:
{ "unique_attributes": [ { "attribute": "", "evidence": "", "evidence_type":
  "researched|assumption", "alternatives_lacking": [""] } ] }
```

## STEP 3 — VALUE THEMES

```
TASK: Translate attributes into value. Attribute → benefit → VALUE (the
customer-goal language). Cluster into 2-4 themes max — more than 4 means
we're not positioning, we're listing.

1. For each unique attribute: what does it ENABLE (benefit), and what customer
   GOAL does that serve (value)? Value must be stated in customer outcome
   language with a number wherever defensible.
2. Cluster attributes under 2-4 value themes. Name each theme in plain words
   a customer would say, not marketing language.
3. Attach proof: map available proof assets to each theme. Themes with zero
   proof get flagged [UNPROVEN] — they can be claimed but not led with.
4. Confidence check: if won_deal_notes were provided, verify themes against
   why real customers actually bought. If absent, set confidence to LOW and
   output the 3 questions to ask the next 5 customers/prospects that would
   confirm or kill each theme.

ARTIFACT SECTION: "Why It Matters" — theme cards: theme → attributes → value
→ proof status.

VARIABLES:
{ "value_themes": [ { "theme": "", "attributes": [""], "customer_value": "",
  "proof": "", "proof_status": "proven|partial|unproven" } ],
  "confidence": "high|medium|low", "confidence_gaps": [""] }
```

## STEP 4 — BEST-FIT SEGMENT

```
TASK: Identify who cares MOST about these value themes — the customers who
feel the value so strongly they buy fast, pay more, and refer.

1. From the canvas segments, generate 3-5 candidate sub-segments (narrower
   than the canvas states — add firmographic/behavioral qualifiers).
2. Score each sub-segment 1-10 against: (a) intensity of need for our #1 value
   theme, (b) ease of identifying/reaching them, (c) willingness to pay,
   (d) speed of decision. Show the scoring table.
3. Pick the winner. Define it with OBSERVABLE characteristics — things you
   could filter a list by (role, size, behavior, trigger event), not attitudes.
4. Name the trigger event that makes this segment buy NOW if one exists.
5. Explicitly name who we are NOT for — the anti-segment — and why that's
   a feature of the positioning, not a bug.

ARTIFACT SECTION: "Who Cares Most" — scoring table + winner profile +
anti-segment statement.

VARIABLES:
{ "best_fit_segment": { "who": "", "observable_characteristics": [""],
  "trigger_event": "", "why_they_care_most": "", "anti_segment": "" } }
```

## STEP 5 — MARKET CATEGORY FRAME

```
TASK: Choose the market frame — the category context that makes our value
obvious to the best-fit segment. Dunford's three plays:

  A) HEAD-ON: existing category, claim we're the best in it
  B) SUBCATEGORY: existing category, dominate a niche of it ("X for Y")
  C) NEW GAME: create a category (expensive; only with resources + patience)

1. RESEARCH (required): what category language does the best-fit segment
   already use when looking for solutions? web_search the phrases they'd
   type; check what categories review sites/directories place alternatives in.
2. Evaluate all three plays for this business honestly:
   - Head-on: can we win against entrenched leaders? (usually no for a startup)
   - Subcategory: which existing category + which qualifier? List 3 candidates.
   - New game: do we have the war chest and 3-year patience? (usually no —
     say so plainly if so.)
3. Recommend ONE with rationale. For subcategory (most common winner), give
   the exact frame: "{known category} for {best-fit segment}" and test that it
   instantly transmits our #1 value theme.
4. State what the frame makes customers ASSUME about us (pricing, features,
   competitors) — inherited assumptions we must either satisfy or explicitly break.

ARTIFACT SECTION: "The Frame" — three-play evaluation + recommendation +
inherited-assumptions list.

VARIABLES:
{ "category_frame": { "approach": "head_on|subcategory|new_game",
  "category_name": "", "rationale": "", "inherited_assumptions": [""],
  "assumptions_to_break": [""] } }
```

## STEP 6 — ASSEMBLY & CANONICAL OUTPUTS

```
TASK: Assemble the positioning into canonical, reusable statements. Now — and
only now — language gets polished.

1. POSITIONING STATEMENT (one paragraph, internal canon):
   For {best-fit segment} who {trigger/need}, {product} is a {category frame}
   that {#1 value theme with number}. Unlike {primary alternative},
   {sharpest unique attribute}.
2. ONE-LINER: ≤20 words, customer language, no adjectives doing a number's job.
3. ELEVATOR VERSION: 3 sentences for a human to say out loud.
4. MESSAGING HIERARCHY: value themes ranked, each with its lead proof point —
   this is what Hormozi hooks, BrandScript, and the landing page consume.
5. SANITY GAUNTLET — answer honestly:
   - Would the anti-segment correctly self-select OUT reading the one-liner?
   - Does the statement survive with competitor names swapped in? (If a rival
     could say it verbatim, return to step 2.)
   - Does it lead with our MOST DEFENSIBLE claim, not our most exciting one?
6. CONFIDENCE + NEXT TESTS: overall confidence with the top 3 real-world tests
   (customer conversations, page A/B, win-loss reviews) that would raise it.

ARTIFACT SECTION: "Positioning Canon" — all statements + hierarchy + gauntlet
results + test plan.

VARIABLES:
{ "statement": "", "one_liner": "", "elevator": "",
  "messaging_hierarchy": [ { "theme": "", "lead_proof": "" } ],
  "confidence": "high|medium|low", "next_tests": [""] }
```

---

## OUTPUT CONTRACT (applies to every Atlas workflow authored from this template)

1. **Dual output per step**: ARTIFACT SECTION (markdown) + VARIABLES (strict JSON). The JSON is schema-validated on save; a step that emits invalid JSON is re-run with the validation error appended.
2. **Variables are canonical, artifacts are provenance.** The brain stores variables with `source_artifact` + `source_step` backlinks. Downstream workflows and output pages read variables; humans read artifacts.
3. **Frontmatter on the final artifact**:
```yaml
---
workflow: positioning-sprint
version: 1.0
business: {canvas_id}
run_date: {date}
produces: [positioning.statement, positioning.category_frame, ...]
consumed: [canvas.customer_segments, intel.competitor_dossier?]
confidence: medium
---
```
   This is the Obsidian-compatible layer — every artifact is a linkable note with typed edges today, and a graph-RAG-ingestible node later with zero rework.
4. **Contradiction protocol**: if a step's research contradicts an existing brain variable (e.g., canvas says the competitor charges $99, research finds $49), the step outputs a `contradictions[]` block; Atlas surfaces it to the user rather than silently overwriting.
5. **Confidence is a first-class variable.** Every workflow ends with confidence + the real-world tests that would raise it. Downstream workflows inherit and display upstream confidence ("this pricing analysis rests on MEDIUM-confidence positioning").

## OUTPUT PAGE SPEC (for later, but schema-ready now)

- **Hero**: `positioning.statement` + `one_liner` + confidence badge
- **Comparison strip**: `competitive_alternatives[]` rendered as cards (name, type icon, why-chosen, our-edge)
- **Value theme cards**: `value_themes[]` with proof-status pills (proven/partial/unproven)
- **Segment panel**: best-fit profile + anti-segment callout
- **Frame diagram**: three-play evaluation with the chosen play highlighted
- **Footer**: next_tests[] as a checklist, contradictions[] as alerts, backlinks to consuming workflows ("used by: Hormozi Brain OS, BrandScript")
