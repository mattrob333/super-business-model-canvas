# HORMOZI BRAIN OS
### A meta-prompt system that runs Alex Hormozi's $100M frameworks on any product or service

**How to use:** Fill out the INTAKE block once. Then run Prompts 00–06 in sequence in a single Claude conversation (each prompt builds on the last's output). Or run any module standalone by pasting INTAKE + that module.

---

## INTAKE BLOCK (fill this out once, paste at the top of every session)

```
<business_intake>
PRODUCT/SERVICE: [what you sell, in one plain sentence]
WHO BUYS IT: [avatar — role, industry, situation. Be specific: "commercial GC estimators at $10–50M firms" not "construction companies"]
CORE RESULT DELIVERED: [the measurable outcome a customer gets]
CURRENT PRICE & MODEL: [price, billing model]
PROOF ASSETS ON HAND: [case studies, testimonials, stats, credentials, pilot results — list everything, even thin stuff]
COMPETITORS / ALTERNATIVES: [who they'd use instead, including "do nothing" and "do it manually"]
PRIMARY CHANNEL(S): [where you reach buyers — LinkedIn, X, email, referrals, etc.]
CONSTRAINTS: [capacity limits, delivery limits, compliance issues, anything that caps scale]
STAGE: [pre-revenue / first customers / scaling]
</business_intake>
```

---

## PROMPT 00 — MARKET FIT CHECK (Starving Crowd Filter)

*Hormozi's hierarchy: Market > Offer > Persuasion. A grand slam offer to the wrong market still dies. Run this first — it can kill or redirect everything downstream.*

```
You are operating as Alex Hormozi evaluating whether this business is aimed at a market worth dominating.

Using the <business_intake> above, score the target market 1–10 on each of Hormozi's four market criteria, with a one-paragraph justification each:

1. MASSIVE PAIN — Does the avatar desperately need this solved, or is it a nice-to-have? What's the cost of their status quo in dollars, time, or risk?
2. PURCHASING POWER — Can this avatar actually pay premium prices? Who controls the budget?
3. EASY TO TARGET — Are they findable in concentrated channels (associations, communities, job titles, platforms)? Name the 3 most concentrated watering holes.
4. GROWING — Is this market expanding, flat, or shrinking? What macro trend helps or hurts?

Then:
- Give a composite verdict: GREEN (proceed), YELLOW (proceed but reposition — say how), RED (wrong avatar — propose 2 adjacent avatars that score higher).
- If YELLOW or RED, rewrite the avatar line of the intake block and use the revised version for all following prompts.

Be brutal. Hormozi's rule: a mediocre offer to a starving crowd beats a great offer to an indifferent one.
```

---

## PROMPT 01 — VALUE EQUATION OFFER BUILDER

*Value = (Dream Outcome × Perceived Likelihood) ÷ (Time Delay × Effort & Sacrifice). Maximize the top, crush the bottom.*

```
You are building a Grand Slam Offer using Hormozi's Value Equation.

STEP 1 — PAIN EXTRACTION
List the top 10 burning pains this avatar has related to the problem we solve. For each, write the pain the way the avatar would say it out loud (first person, their vocabulary, their frustration). Source from realistic buyer psychology — what they'd post in a forum, say to a peer, or complain about to their boss.

STEP 2 — DREAM OUTCOME FLIP
Flip each pain into a vivid dream outcome. Not features — transformations. Specific numbers, timeframes, and status changes. "Sell Hawaii, not the plane ride." Format: [Specific result] in [timeframe] so that [emotional/status payoff].

STEP 3 — OBSTACLE → SOLUTION MAP
List every obstacle the avatar believes will stop them from getting the dream outcome (including "this won't work for my situation," "I don't have time," "my team won't adopt it"). For EACH obstacle, name the solution component we include to destroy it. Hormozi's rule: solve EVERY obstacle, not most.

STEP 4 — BUILD 10 OFFER VARIANTS
Construct 10 distinct offers by combining dream outcomes + solution components + delivery mechanisms + pricing structures. Vary: scope, speed, done-for-you vs. done-with-you, risk structure, and payment model.

STEP 5 — SCORE & RANK
Score each offer 1–10 on all four Value Equation variables:
- Dream Outcome (how big/desirable)
- Perceived Likelihood (how believable given our current proof assets)
- Time Delay (how fast they see the FIRST result — score fast = high)
- Effort & Sacrifice (how little the customer must do — score easy = high)
Compute Value Score = (DO × PL) ÷ ((11−TD speed score) × (11−ease score)). Rank all 10.

STEP 6 — REWRITE TOP 3
Rewrite the top 3 offers to be irresistible. For each, identify its WEAKEST value equation variable and add one mechanism that fixes it (a proof element, a speed-to-first-value milestone, a done-for-you onboarding, etc.). Reject vague outputs — every claim needs a number.
```

---

## PROMPT 02 — GRAND SLAM ENHANCEMENT STACK

*Take the winning offer and wrap it in the five enhancers: bonuses, guarantees, scarcity, urgency, naming. This is what makes it a category of one.*

```
Take Offer #1 from the previous step and apply Hormozi's five offer enhancers:

1. BONUS STACK — Create 5 bonuses that each solve an ADJACENT problem the avatar will hit (before, during, or after using the core product). For each: name it (named bonuses sell), assign an honest defensible dollar value, and state the delivery format. Prefer high-perceived-value, low-delivery-cost assets: templates, swipe files, audits, checklists, tools, access. Never discount the core offer — add bonuses instead.

2. GUARANTEE — Draft 3 guarantee options using the conditional structure "If you don't get X result in Y time, we will Z":
   a) A conditional performance guarantee
   b) A stacked guarantee (satisfaction layer + outcome layer)
   c) An anti-guarantee (all sales final + why that signals confidence) — only if it fits
   Recommend one, and flag any that we couldn't actually honor given the CONSTRAINTS in intake.

3. SCARCITY — Propose ONE honest scarcity mechanism (client cap, cohort cap, growth-rate cap) that is actually true given our delivery constraints. If nothing is honestly scarce, say so and skip it. Every claim must be 100% true.

4. URGENCY — Propose ONE honest urgency mechanism (cohort start dates, bonus deadline, seasonal tie-in). Same rule: real or nothing.

5. MAGIC NAME — Generate 5 offer names using the M-A-G-I-C formula (Magnetic reason why + Avatar + Goal + Interval + Container). Use at least 3 of the 5 elements per name. Rank and recommend one.

6. THE MATH — Assemble the final one-page offer: core offer + named bonuses with values + guarantee + scarcity/urgency + name. Show total stated value vs. price. The gap should make the price feel like a rounding error — but every dollar value must be defensible.
```

---

## PROMPT 03 — HOOK GENERATOR

```
You are generating scroll-stopping hooks for the offer above, in the avatar's language.

STEP 1 — Extract 4 hook formula banks, 10 formulas each:
- PAIN hooks (agitate the burning pains from Prompt 01)
- DESIRE hooks (dream outcomes with specific numbers)
- PROOF hooks (built from our actual proof assets — never invent results)
- CURIOSITY hooks (open loops, contrarian claims, "the real reason X fails")

STEP 2 — Generate niche-specific hooks: 5 hooks per top-3 pain per style. 10–15 words each. That's 60+ hooks minimum.

STEP 3 — Rank the top 25 on clarity, curiosity, and pull-through (does it force the next line?). Then rewrite the top 10 in 3 formats each:
- X/Twitter opening line
- LinkedIn first-two-lines (before the "see more" fold)
- Short-form video verbal hook (first 3 seconds, spoken)

Hard rules: no fabricated stats, no hype adjectives doing the work a number should do, match the operator voice — declarative, contrarian, zero fluff.
```

---

## PROMPT 04 — PROOF & AUTHORITY BUILDER

```
You are converting our raw proof into persuasion assets.

STEP 1 — Inventory and categorize every proof asset from intake into:
- QUANTITATIVE (numbers, before/after metrics, time saved, dollars generated)
- QUALITATIVE (quotes, reactions, emotional testimonials)
- TRANSFORMATION (full before→after customer stories)
- AUTHORITY (credentials, logos, years of experience, adjacent expertise)
Flag gaps: which category is weakest, and name the single fastest action to generate proof there (e.g., a structured pilot, a testimonial ask script, a public build log).

STEP 2 — Rewrite each proof asset in 3 lengths:
- SHORT (one line, usable inside a hook or ad)
- MID (2–3 sentences, usable in a post or email)
- LONG (full mini case study, usable on a landing page)

STEP 3 — Fuse proof with story: write 10 "sticky proof-stories" that pair one proof point with a narrative arc (situation → struggle → intervention → number → meaning). Logic makes them think; emotion makes them act. Each under 150 words.

If proof is thin (pre-revenue), pivot to borrowed proof: demonstration proof (show the thing working), process proof (show the method), and founder-credibility proof. Never manufacture results.
```

---

## PROMPT 05 — CONTENT BATCHING MACHINE

```
You are turning this offer into a 30-day content engine.

STEP 1 — Extract 5–7 core content pillars from the offer, pains, and proof (e.g., problem education, contrarian takes, build-in-public, proof stories, methodology teardowns). List 10 subtopics per pillar.

STEP 2 — Take the single strongest long-form idea and repurpose it into 20 short-form pieces: hooks, one-liners, mini-stories, hot takes, and list posts.

STEP 3 — Format for platform: for each of the top 15 pieces, specify the native format — X thread, X one-liner, LinkedIn post, LinkedIn carousel outline, or short-video script beat sheet.

STEP 4 — PROOF-LOOP INJECTION: ensure ≥50% of all posts contain a proof element (stat, case study, screenshot-worthy result, client quote). Tag each piece [PROOF] or [NO-PROOF] and rebalance if under 50%.

STEP 5 — Batch into a 30-day calendar: day-by-day grid across pillars and platforms, with a weekly rhythm (e.g., Mon contrarian, Wed proof-story, Fri methodology). Include 4 direct-offer posts (1/week) — give more than you ask, but ASK.
```

---

## PROMPT 06 — FUNNEL & LEAD MAGNET AUDIT

```
You are auditing the path from stranger → lead → customer.

STEP 1 — AWARENESS AUDIT: stress-test our hooks, messaging, and proof placement. Where does attention leak? Check: is the dream outcome in the first line? Is proof visible before the ask? Is the avatar named explicitly? Flag every leak and give 10 concrete fixes ranked by impact.

STEP 2 — LEAD MAGNET AUDIT: score each existing (or proposed) lead magnet on the Value Equation — does it deliver a complete solution to a NARROW problem, fast, with near-zero effort? Hormozi's rule: the lead magnet should solve one problem fully and reveal the next problem (which the core offer solves). Kill friction: every form field, click, and step is a leak. Rewrite the weakest magnet into one that gives away something painfully good.

STEP 3 — OFFER CONGRUENCE CHECK: does the funnel promise match the offer's dream outcome exactly? Any bait-and-switch between hook → magnet → offer kills perceived likelihood. Flag mismatches.

STEP 4 — Output a prioritized punch list: top 10 changes, each with effort estimate (S/M/L) and expected leverage (which value equation variable it moves).
```

---

## RUN-IN-SEQUENCE CHEAT SHEET

| # | Module | Output |
|---|--------|--------|
| 00 | Market Fit Check | Go/no-go + corrected avatar |
| 01 | Value Equation Offer Builder | Top 3 scored offers |
| 02 | Grand Slam Enhancement Stack | Final named offer + bonus/guarantee/price math |
| 03 | Hook Generator | 10 hooks × 3 formats |
| 04 | Proof & Authority Builder | Proof library in 3 lengths + 10 proof-stories |
| 05 | Content Batching Machine | 30-day calendar |
| 06 | Funnel & Lead Magnet Audit | Ranked punch list |

**Standing rules for every module (paste once at session start):**
- Reject vague outputs. "Increase revenue" is banned; "close 2 more deals/month = $3,600" is the standard.
- Every scarcity, urgency, and proof claim must be literally true.
- All copy in the avatar's spoken vocabulary, operator voice: declarative, contrarian, no hype adjectives.
- When a framework conflicts with a constraint in intake, flag it — don't silently comply.
