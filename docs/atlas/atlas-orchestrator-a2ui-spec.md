# ATLAS ORCHESTRATOR + GENERATIVE UI SPEC
*Super BMC · v0.1 · July 2026 · Companion to: Atlas Workflow Library, Positioning Sprint card (output contract)*

---

## 0 · THE ONE-SENTENCE ARCHITECTURE

Atlas is a **gap-driven orchestrator** over a typed **business brain**; workflows and single questions are just two sizes of gap-fill action; the chat renders **A2UI components bound directly to brain variables**, so the conversation is a live view of the brain — not a transcript.

---

## 1 · THE BUSINESS BRAIN (the variable store)

```
brain/
  canvas.*            # the 9 BMC blocks — intake ontology, standard frames
  positioning.*       # written by Positioning Sprint
  intel.*             # written by Competitive Intel Sweep
  pricing.*           # written by Pricing Lab
  risks.*             # written by Pre-Mortem
  ...
```

Every variable carries metadata:

```json
{
  "path": "positioning.best_fit_segment",
  "value": { ... },
  "confidence": "medium",
  "source": "workflow:positioning-sprint@v1.0#s4",   // or "user_stated" | "user_override" | "scraped"
  "source_artifact": "artifact/positioning-sprint-2026-07-11.md",
  "updated_at": "...",
  "staleness_policy": "review_90d"                    // some variables rot (competitor prices), some don't
}
```

Rules (inherited from the output contract, now global):
- `user_stated` and `user_override` outrank workflow-derived values; workflows may CONTRADICT them (surface it) but never overwrite them.
- Confidence is displayed everywhere a variable is rendered.
- Synthesis jobs (§4) may write `synergy.*` and `contradiction.*` records but never mutate source variables.

## 2 · THE COVERAGE MAP (what makes Atlas "lead")

A schema manifest declares every variable slot the brain *could* hold, grouped by BMC section, each slot annotated with:
- `value_weight` (how much downstream work depends on it — e.g., `customer_segments` feeds 20+ workflows, weight 10)
- `fill_actions` (ordered cheapest-first): `ask` (one GapPrompt), `scrape`, `mcp_pull` (Fireflies/Common Room/Stripe), `workflow:<id>`
- `freshness` requirement

Atlas's core loop each turn:
```
1. score all gaps: gap_score = value_weight × urgency(staleness) ÷ fill_cost
2. propose the top action IN CONTEXT of what the user is doing
   (never derail a user mid-task; queue gaps into the CoverageMap sidebar)
3. execute → write variables → re-score
```
This is the "leads the user through workflows logically" behavior: it's not a fixed sequence, it's greedy information-gain per user-minute. Early on it looks like an interview (cheap `ask` actions dominate). Once the canvas is dense, workflows dominate (each run fills many slots at once). The system naturally graduates from intake → analysis.

**The intake/analysis separation you described, formalized:**
- **INTAKE layer** = canvas.* slots + `ask`/`scrape`/`mcp_pull` actions. Agent-led, standard frames, BMC as the ontology.
- **ANALYSIS layer** = workflow runs that transform canvas.* into positioning.*, pricing.*, risks.* etc.
- **SYNTHESIS layer** = cross-domain jobs over the whole variable graph (§4).

## 3 · GENERATIVE UI VIA A2UI

### Why A2UI (decision record)
- Declarative JSON, not executable code; client-side **catalog** whitelists renderable components — same trust model as our workflow registry.
- Flat adjacency-list component model designed for LLM streaming; progressive render while the step runs.
- Framework-agnostic; React renderer via AG-UI/CopilotKit path; protocol at v0.9.1 stable, v1.0 RC adds `actionResponse` (client→agent RPC) — which is our write-back path.
- Native-first: components render with Super BMC's own design system (vs. MCP-Apps sandboxed iframe payloads).
- Transport: SSE fits the existing Next.js streaming chat; AG-UI middleware if/when we want bidirectional state sync.

### The core trick: variables JSON ≡ A2UI data model
Workflow steps already emit schema-validated VARIABLES blocks (output contract). The runner forwards each block twice:
1. → brain write (Supabase)
2. → `updateDataModel` message on the chat surface

Components never contain data; they **bind** to brain paths:

```jsonl
{"createSurface": {"surfaceId": "chat-inline-741", "catalogId": "superbmc/catalog@v1"}}
{"updateComponents": {"surfaceId": "chat-inline-741", "components": [
  {"id": "vt-card-1", "component": {"ValueThemeCard": {
     "theme":  {"path": "/positioning/value_themes/0/theme"},
     "value":  {"path": "/positioning/value_themes/0/customer_value"},
     "proof_status": {"path": "/positioning/value_themes/0/proof_status"},
     "editable": true }}}]}}
{"updateDataModel": {"surfaceId": "chat-inline-741", "contents": [ ...variables block... ]}}
```

User edits the card → `actionResponse` → Atlas writes `user_override` to the brain → every other surface bound to that path updates. **Render once, stay live.**

### SuperBMC Catalog v1 (the whitelist — start with ~10, resist growth)
| Component | Binds to | Used for |
|---|---|---|
| `VariableCard` | any scalar/object variable + confidence | universal display/edit |
| `GapPrompt` | one empty slot | tappable question: chips, short text, or "run workflow instead" |
| `ChoiceChips` | enum slots | one-tap answers during intake interview |
| `ScoreTable` | array w/ numeric fields | offer scoring, segment scoring, RICE |
| `ComparisonStrip` | `intel.competitive_alternatives[]` etc. | competitor/alternative cards |
| `ValueThemeCard` | `positioning.value_themes[]` | theme + proof-status pill |
| `ConfidenceBadge` | any variable's confidence | inline everywhere |
| `CoverageMap` | the gap map itself | "your brain is 62% filled — biggest gap: pricing" |
| `WorkflowRunCard` | a run's step list + status | live progress while a workflow executes |
| `ContradictionAlert` | `contradiction.*` records | "research says $49, canvas says $99 — which?" |

Rule: a workflow's `output_page_hint` may ONLY reference catalog components. New component = catalog PR, not ad-hoc generation. (This is also why output pages become cheap: a "page" is just a saved A2UI surface definition over the same variables.)

### Streaming UX per workflow step
```
step starts  → WorkflowRunCard shows step spinner
step streams → ARTIFACT SECTION streams as markdown (normal chat)
step ends    → VARIABLES validate → brain write → components materialize
               inline under the prose (progressive render)
gap detected → GapPrompt renders inline; answer writes user_stated variable
               and the step re-parameterizes without restarting
```

## 4 · SYNTHESIS LAYER (Atlas "finds synergies")

Runs as background jobs over the variable graph after any write burst:
- **Contradiction sweep**: same-fact variables from different sources disagree → `ContradictionAlert`.
- **Synergy detection**: rule-pack + LLM pass over cross-domain variable pairs, e.g. `intel.competitor_gaps[] × canvas.key_resources` → "your Revit calibration data closes the exact gap G2 reviewers complain about in {competitor}" → written as `synergy.*` record with backlinks, surfaced as a card.
- **Cascade invalidation**: when an upstream variable changes (user overrides the segment), every artifact whose frontmatter `consumed` includes it gets flagged STALE → CoverageMap suggests re-runs.

This layer is where the graph-RAG upgrade eventually lives — the records and backlinks are already graph edges; deferring the RAG costs nothing.

## 5 · BUILD SEQUENCE (Codex-ready milestones)

| # | Milestone | Proves |
|---|---|---|
| 1 | Brain schema + variable table + coverage manifest (canvas.* + positioning.* only) | the data layer |
| 2 | Workflow runner: load card → inject snapshot → run steps → validate JSON → write variables | workflows execute headless |
| 3 | A2UI surface in chat: catalog v1 (VariableCard, GapPrompt, ChoiceChips, WorkflowRunCard only), SSE transport, JSONL parser + dispatcher | streaming components render |
| 4 | Bind runner → surface (`updateDataModel` on step completion) | live materializing results |
| 5 | `actionResponse` write-back (`user_override` path) | editable UI = brain view |
| 6 | Gap engine v1 (score, propose, GapPrompt loop) | Atlas "leads" |
| 7 | Synthesis jobs (contradictions first, synergies second) | the brain thinks |

Milestones 1–2 have zero UI risk and can start immediately; 3 is the protocol spike — timebox it, and if the A2UI React renderer path fights the Next.js 15 setup, the fallback is the same JSONL message format rendered by a hand-rolled dispatcher mapping to our 10 components (the protocol's value is the message discipline and catalog model; a 10-component dispatcher is a weekend, full protocol compliance can come later).

## 6 · WHAT WE ARE NOT BUILDING (scope fence)
- No arbitrary/generated JSX or HTML from the model — catalog only, ever.
- No graph RAG yet — frontmatter edges + Supabase queries until artifact count demands it.
- No custom per-workflow pages yet — pages are saved surface definitions; they come nearly free after milestone 4.
- No multi-agent A2A mesh — Atlas is one orchestrator; the protocol leaves the door open.
