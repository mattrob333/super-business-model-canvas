# Spec 06 — Model Routing Economics

> Use the best model for each job and never burn premium tokens on commodity work. This spec
> defines the task taxonomy, the routing matrix, the escalation ladder, the OpenRouter
> model-scout (Matt's idea: use the OpenRouter MCP server to find the right model for the job),
> and the cost-control surfaces. Builds on the existing `model_routes` table and the worker
> architecture in `AGENT_RUNTIME_DECISION.md`.

## The principle

Token spend should follow **decision value**, not activity volume. 90%+ of this system's LLM
calls are commodity work (extract, classify, score, diff) where a frontier model adds nothing
but cost; the 10% that is strategy synthesis is exactly where skimping shows. Route by task
class, verify cheaply, escalate rarely, and measure everything.

## 1. Task taxonomy → routing matrix

`model_routes` gains a `task_class` dimension (route per class, overridable per agent profile).
Classes and their v1 assignments:

| Task class | What it is | Volume | Model tier | v1 route |
|---|---|---|---|---|
| `extract` | pull structured data from scraped pages (pricing, features, reviews, job posts) | very high | budget | Gemini Flash-class / Haiku-class via OpenRouter |
| `classify` | tag/score items: sentiment, severity, pattern-candidate matching (Spec 05 §5.2) | very high | budget | same, or small open models (Qwen/Llama-class) |
| `summarize` | compress a scrape corpus or run history into working context | high | budget–mid | Haiku-class |
| `embed` | dedup, similarity, evidence clustering | high | embedding models | cheap embeddings via OpenRouter |
| `section_analysis` | a section agent reasoning over its domain (workspace chat, loop runs) | medium | mid | Sonnet-class |
| `research_verify` | adversarial claim-vs-source verification (the anti-hallucination gate) | medium | mid | Sonnet-class — *do not* budget-tier the verifier; false "verified" stamps are the worst failure mode |
| `draft_document` | briefs, one-pagers, outreach drafts from structured inputs | medium | mid | Sonnet-class |
| `strategy_synthesis` | Atlas: cascade synthesis, conflict arbitration, Insight-Card narratives, board memos | low | premium | Opus/frontier-class |
| `live_search` | real-time X/web intelligence | medium | fixed | Grok (only game in town for X) |

Two hard rules: **the verifier never gets downgraded**, and **Atlas's narrative/arbitration
work never gets upgraded in volume** — it's protected by the staging in Spec 05 §5 (statistics
and cheap classification filter what ever reaches Atlas).

## 2. The escalation ladder (cheap first, escalate on doubt)

For `extract`/`classify`/`summarize`:

1. Run on the budget route.
2. Self-check: schema validation + a confidence field in the output contract.
3. If validation fails or confidence < threshold → retry once on the mid route.
4. Still failing → mark the item `low_confidence`, log a feed-health note; never silently
   accept garbage.

Measured properly, the ladder beats "always mid-tier" on cost by ~5–10× while catching the
hard cases. Escalation rate per feed is itself a tracked metric — a rising rate means a source
changed its page structure (feed problem), not a model problem.

## 3. The OpenRouter model-scout

OpenRouter's catalog (with per-model pricing, context windows, throughput, and capabilities)
is queryable — including via their MCP server. We use it two ways:

- **Worker-side (automated).** A monthly **Model Market Sweep** loop: fetch the catalog, join
  against our per-task-class eval set (below), and produce a "route review" report — *"Haiku-4.5
  handles `extract` at 99.1% schema-pass for 40% less than current route; Gemini Flash price
  dropped 25%; new Qwen release tops `classify` evals."* Route changes are **proposed via the
  Approvals queue** (Spec 04 rules — model changes are behavior changes), applied by updating
  `model_routes` rows. No deploy needed.
- **Atlas-side (on demand).** Atlas gets a `scout_models(task_description)` tool backed by the
  same catalog: when a new task type appears ("we need OCR on competitor PDFs"), Atlas can
  recommend a route with cost projection instead of defaulting to the expensive house model.

**Eval harness (small but real):** per task class, keep 10–30 golden examples
(`model_evals` table: task_class, input, expected, per-model scores, cost, latency). The sweep
runs candidates against these. No route change ships on price alone — it must pass the evals.

## 4. Cost controls (layered, mostly already scaffolded)

| Layer | Mechanism | Status |
|---|---|---|
| Per-loop budget | `scheduled_loops.monthly_budget`, enforced in tick | ✅ exists |
| Per-cascade budget | `cascade_runs.total_cost` cap; abort → `partial` with synthesis note | Spec 04 |
| Per-account budget | `accounts.runtime_config` monthly ceiling; soft-warn at 80%, hard-stop non-critical loops at 100% | new |
| Per-task-class ceilings | max tokens in/out per class (extract jobs never need 8k output) | new |
| Prompt caching | stable system prompts + context-source prefixes structured for provider prompt-caching | worker design |
| Scrape/search cache | per-feed TTL cache (Spec 05 §6) — the cheapest token is the call you don't make | Spec 05 |
| Batch processing | batch extract/classify jobs where providers offer batch pricing (50% off for non-urgent loop work) | new |
| **Cost observability** | `agent_runs.estimated_cost` rolls up into a Settings cost panel: spend by agent × task class × model, plus **cost-per-insight** and **cost-per-brief** — the numbers that actually matter for pricing the product | new |

The meta-move: **AI spend is itself a dashboard metric** (Ledger owns it). If Super BMC's
margins are part of the business model, the tool should eat its own cooking.

## 5. Implementation notes

- `model_routes` migration: add `task_class`, `max_tokens_in/out`, `cost_per_1k_in/out`
  (cached from catalog), `eval_score`, `updated_by` (human|sweep).
- Worker resolves route as: agent profile override → account route for task class → global
  default. All existing hardcoded models in edge functions migrate into this (kills the
  Grok/Gemini hardcodes flagged in DEVLOG known-issues).
- OpenRouter is the default *gateway* for budget/mid tiers (one key, every model); Anthropic
  direct for the agent loop + prompt caching; Grok direct for live search. This matches the
  split already recommended in `AGENT_RUNTIME_DECISION.md`.
- Build order: task_class routing + ceilings land with the worker (ROADMAP Phase 2) ·
  escalation ladder + eval harness with the research engine (Phase 3) · model-scout sweep +
  cost panel with Phase 5–6.

## 6. Future / nice-to-have (parking lot, from Matt's notes)

- **Rich document editor** — briefs and board memos eventually deserve in-app editing before
  export/send. Recommendation when we get there: **Plate** (shadcn-native, fits our stack)
  over Tiptap; both are viable, neither is needed until humans routinely co-edit agent drafts
  (post-Phase 6). Tracked in ROADMAP Phase 8.
- Hosted forms for Compass/Anchor surveys (currently drafts-only).
- Per-account fine-tuned extraction models if scrape volume ever justifies it.
