# Super BMC — Product Vision

> Written: July 2, 2026. The "most useful version of this app" — the thing people pay real money for.

## One sentence

**A living Business Model Canvas: nine domain-expert AI agents that each own one section of a company's business model, continuously research it against reality and the competition, and a strategist agent that reads all nine to tell the CEO/board/investor exactly where the business is losing and what to do next.**

## Who pays, and why

| Buyer | Job to be done | What they pay for |
|---|---|---|
| **VC / PE platform teams** | Portfolio oversight across 20–100 early-stage companies | One canvas per portco, auto-refreshed; competitor gap deltas surfaced weekly; board-pack-ready strategy briefs. Priced per portfolio seat. |
| **Mid-market CEO / strategy lead** | "Are we falling behind, and where?" | Continuous competitive intelligence mapped to *their* business model, not generic news alerts. Priced per company workspace. |
| **Fractional CxOs / consultants** | Deliver strategy engagements faster | Client workspaces, white-labeled reports, playbook library. Priced per active client. |

The wedge is the same in all three: **strategy tools today are static documents; this one is a system that keeps itself true.** Nobody re-runs their SWOT quarterly. These agents do.

## The product in five layers

### 1. Ground truth (the research engine)
Enter a URL → deep research pipeline (Firecrawl scrape + Grok live X/web search + filings/news) builds the canvas **with citations**. Every item on the canvas links to `evidence_items` with source, date, and excerpt. Confidence scores are earned, not vibes: a claim without evidence is visibly marked speculative. A verifier agent adversarially checks extracted claims against sources before they're accepted. **This is the moat — competitors' AI strategy tools hallucinate; ours shows receipts.**

### 2. The mirror (competitor canvases)
Run the same pipeline on 3–5 competitors. Now every section of your canvas has a comparison set. The **gap engine** diffs your section against the outpacing competitor's section and writes `gaps` rows: "Competitor X monetizes through 3 revenue streams; you have 1. Severity: high. Evidence: [links]." The dashboard's deficiencies view is generated, scored (severity × impact × effort), and always current.

### 3. Nine resident experts (section agents)
Each BMC section is an agent's *office*, not a text box. Click into Revenue Streams and you're in that agent's room: its canvas of items with evidence and freshness, its KPIs and benchmarks, its run history, its proactive loop settings, and a chat with an expert whose entire world is your revenue model — armed with pricing-page scrapers, competitor monitors, and market data. Section agents have **standing orders** (via `scheduled_loops`): re-verify claims monthly, watch competitor pricing weekly, flag stale evidence, propose new items when the market moves. They post their findings to the activity feed and escalate material changes to the strategist.

### 4. The strategist (orchestrator)
One agent sees everything: all nine sections, all competitor canvases, all gaps, all agent activity. It:
- **Synthesizes** cross-section insight ("your channel costs are rising while your top competitor just went product-led — these are the same problem").
- **Runs playbooks** — SWOT, Porter's Five Forces, Blue Ocean, Ansoff, JTBD, unit-economics reviews — choosing the right framework for the company's current goal, populated from live canvas data instead of a blank template.
- **Maintains the agenda** — a ranked "what to do next" list for the user, each item traceable to gaps and evidence.
- **Writes the brief** — a weekly/monthly CEO- or board-level strategy memo generated from what the nine agents surfaced.

### 5. The operating cadence (proactivity)
The system runs without the user. Scheduled loops keep research fresh; the strategist reviews deltas on a cadence; the user gets a digest ("3 material changes this week; 1 new critical gap; recommended focus: pricing"). Later: propose-before-execute outreach (draft partner emails, customer-discovery surveys) that a human approves.

## What makes it defensible

1. **Evidence discipline** — citation-or-it-didn't-happen, enforced in the runtime, not the prompt.
2. **The BMC as agent topology** — nine well-scoped domains is the right decomposition for agent quality (narrow context = better output), and it's legible to every MBA on earth.
3. **Longitudinal data** — versioned canvases (`business_context_versions`, `canvas_section_versions`) mean the tool gets more valuable every month it runs: trend lines, "gap closed" receipts, strategy outcomes.
4. **Portfolio network effects** — a VC running 40 canvases has a private, structured market map no one else has.

## North-star demo (what "done" looks like)

A VC associate pastes a portco URL on Monday. By Tuesday standup: a cited canvas, three competitor canvases, a scored gap register, and a strategist brief recommending two moves — one referencing an X post from the competitor's CEO 4 days ago. The associate clicks into Customer Segments, asks the resident agent "how would we know if segment 2 is real?", and the agent proposes a discovery loop it will run weekly. Nothing in that flow was hand-assembled.

## Non-goals (for now)

- Executing external actions autonomously (email sends, ad buys) — propose-before-execute only.
- Private-data ingestion (CRM, financials) — start public-data-only; add integrations when design partners demand them.
- Real-time collaboration/multiplayer editing — single-operator workspaces first.
