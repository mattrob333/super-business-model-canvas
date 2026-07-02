# Agent Runtime Decision — Super BMC

> Written: July 2, 2026. This is the architecture decision record for the question:
> **"What should the logic in the background for the AI agents be — Hermes, Claude Agent SDK, OpenAI Agents SDK, or OpenRouter?"**

## TL;DR Recommendation

**Use the Claude Agent SDK (TypeScript) inside a dedicated "agent worker" service as the execution engine, with OpenRouter as the model-routing layer underneath it, and Supabase (Postgres) as the single source of truth for all agent state.** Keep Hermes as your *development* copilot (which is how it has already been used in this repo — the two-tier build loop in `.hermes/`), not as the production runtime. Keep the existing `AgentRuntime` interface boundary so the engine stays swappable.

The one-line reason: **Hermes is a personal, single-operator agent runtime; Super BMC is a multi-tenant SaaS.** The Hermes *concepts* (profiles, skills, crons, delegation) are exactly the right mental model — and your database schema already mirrors them one-for-one — but the production implementation of those concepts must live in infrastructure you control per-account, with durable state in Postgres, not in a SQLite file on one machine.

---

## The four options, honestly evaluated

### Option A — Hermes as the production runtime

Your own research notes (`docs/hermes-architecture-notes.md`) already flag the disqualifying constraints:

| Hermes property | Why it hurts in production |
|---|---|
| Session state in local SQLite (`~/.hermes/state.db`) | No multi-tenancy. Every customer's agents would share one operator identity, or you'd need one Hermes install per account. |
| Subagents are **not durable** — parent interrupted → child cancelled | Section agents doing 10-minute research runs need durability. |
| 3-minute hard interrupt on cron runs | Deep research (scrape → verify → synthesize) won't fit. |
| Programmatic invocation from Node/edge functions **unverified** | Your notes list this as an open assumption; it's the load-bearing one. |
| Secrets/config are machine-level | Per-account provider keys (already in your `provider_credentials` table) can't be isolated. |

**Verdict:** Hermes was the right tool to *build* this app (autonomous build loop, cron-driven inner/outer loops — it worked, the git history proves it). It is the wrong chassis to *be* the app. Steal its architecture; don't embed it.

### Option B — Claude Agent SDK (recommended engine)

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`, TypeScript) is the productized version of the loop that runs Claude Code: system prompt → tool calls → results → repeat, with first-class support for:

- **Subagents** — the orchestrator/section-agent hierarchy maps directly: one strategist orchestrator that can `delegate` to nine section agents, each with its own system prompt, tool allowlist, and model.
- **MCP servers as tools** — Firecrawl has an official MCP server; your `mcp_servers` / `mcp_server_tools` tables were clearly designed for exactly this. Custom in-process MCP tools (`createSdkMcpServer`) let you expose `read_canvas_section`, `write_gap`, `log_evidence`, `read_competitor_canvas` as typed tools backed by Supabase queries.
- **Hooks** — pre/post tool-use hooks give you the audit trail (`agent_runs` events), budget enforcement, and the "propose-before-execute" guardrail for external mutations (outreach emails, etc.).
- **Sessions/resume** — durable multi-turn state you can checkpoint into Postgres.
- **Model flexibility** — the SDK can point at Claude via Anthropic, Bedrock, or Vertex; for non-Claude models on specific tasks, route those calls through OpenRouter inside a custom tool or use the model per-subagent.

**Cost/ops:** requires a long-running Node service (Supabase Edge Functions cap out well below a deep research run). A single small worker on Fly.io/Railway/Render (~$5–20/mo to start) that polls a job queue in Postgres solves this and is the standard pattern.

### Option C — OpenAI Agents SDK

Capable (handoffs, guardrails, sessions, tracing), and provider-agnostic via LiteLLM. But: the handoff model is a weaker fit than orchestrator→subagent delegation for your hub-and-spoke design; MCP support is newer; and your highest-value work (long-horizon research, synthesis, strategy writing) is the kind of agentic work Claude models are strongest at. Choose this only if you want to standardize on the OpenAI ecosystem.

### Option D — "Just OpenRouter"

OpenRouter is not an agent runtime — it's a model gateway. There is no loop, no tools, no sessions; you'd be hand-rolling the agent loop yourself (which is what the current `agent-run` edge function does, and its limits are why you're asking this question). **However, OpenRouter is the right answer to a different question** — model routing. Your `model_routes` table (`fast` / `balanced` / `deep` tiers) should resolve to OpenRouter model slugs so each agent/task gets the right model at the right price without N provider integrations.

---

## Recommended production architecture

```
┌─────────────────────────────  Browser (React SPA)  ─────────────────────────────┐
│  Canvas UI · Section Agent rooms · Strategist chat · Dashboard · Playbooks      │
│  (reads/writes Postgres via RLS; subscribes to agent_runs via Realtime)         │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │
                    Supabase (SOURCE OF TRUTH — already built)
   Postgres: agent_profiles · agent_runs · scheduled_loops · model_routes ·
   mcp_servers · evidence_items · gaps · canvas_section_versions · …
   Edge Functions: thin API — enqueue job → agent_jobs; auth; streaming proxy
   pg_cron / Scheduled Functions: tick scheduled_loops → enqueue jobs
                                       │
                                       ▼   (job queue: Postgres table + LISTEN/NOTIFY or polling)
┌────────────────────────  Agent Worker Service (Node, new)  ──────────────────────┐
│                     Claude Agent SDK — the execution engine                      │
│                                                                                  │
│  Orchestrator / Strategist agent (per account)                                   │
│    ├── loads agent_profiles.system_instructions as system prompt                 │
│    ├── subagents: 9 section agents (own prompts, own tool allowlists)            │
│    ├── skills: strategy playbooks (SWOT, Porter, Blue Ocean, …) as SDK skills    │
│    └── hooks: budget caps, audit log → agent_runs, propose-before-execute        │
│                                                                                  │
│  Tools (MCP + custom):                                                           │
│    · Firecrawl MCP (scrape/crawl/search)      · xAI Grok Live Search (X posts)   │
│    · Supabase tools (read/write canvas, gaps, evidence — RLS-scoped per account) │
│    · Web search / fetch                        · Competitor canvas reader        │
│                                                                                  │
│  Models: Anthropic direct for agent loop; OpenRouter for routed one-shot calls   │
│          per model_routes (fast/balanced/deep)                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Why this wins

1. **You already built 80% of the hard part.** The schema (`agent_profiles`, `agent_runs`, `scheduled_loops`, `mcp_servers`, `model_routes`, `evidence_items`, `gaps`) *is* the Hermes concept model, multi-tenant and RLS-protected. The only missing piece is a real execution engine behind the `AgentRuntime` interface — which was explicitly designed to be swappable.
2. **Durability and long-horizon runs.** Deep research on a company + 3 competitors is a 5–30 minute job. A worker service has no 3-minute interrupt, can checkpoint to `agent_runs`, and survives browser closes.
3. **Proactive agents become trivial.** `scheduled_loops` rows → pg_cron tick → enqueue job → worker runs the section agent with its profile's instructions ("re-verify customer segments weekly; refresh competitor pricing; flag stale evidence"). Results land in Postgres; the dashboard and activity feed read them. No user needs to be online.
4. **Anti-hallucination is enforceable in the runtime.** Hooks + custom tools let you *require* that every canvas item written carries `evidence_ids`, and a verifier subagent can adversarially check claims against scraped sources before anything is marked `confidence > 0.7`. This is your "true and correct data" requirement, implemented as code rather than prompt hope.
5. **The interface boundary survives.** `HermesAgentRuntime` (frontend) already just POSTs to an endpoint and polls `agent_runs`. Rename it `LiveAgentRuntime`, point it at the enqueue function, and nothing else in the UI changes. If the Claude Agent SDK is ever the wrong choice, the worker is the only thing you replace.

### Where each vendor/tool fits

| Concern | Choice |
|---|---|
| Agent loop, subagents, skills, hooks | **Claude Agent SDK** (TypeScript, in worker) |
| Orchestrator + strategist reasoning | Claude Sonnet (balanced) / Opus-class (deep strategy synthesis) |
| Cheap bulk extraction/classification | OpenRouter-routed small models (via `model_routes`) |
| Web scraping | **Firecrawl** (MCP server; also has a direct API for the ingest pipeline) |
| Real-time X/social + live web signal | **xAI Grok Live Search API** (already integrated in `_shared/grok-client.ts`) |
| Scheduling | **pg_cron in Supabase** ticking `scheduled_loops` (replaces the stubbed `scheduled-loop-tick`) |
| Job queue | Postgres table (`agent_jobs`) + worker polling/LISTEN — no new infra |
| Streaming to UI | Supabase Realtime on `agent_runs` (status/summary) + SSE proxy for chat |
| Secrets | Supabase secrets + worker env; per-account keys from `provider_credentials` (already encrypted) |

### What happens to the existing edge functions

- `agent-run` — becomes a thin **enqueue** function (auth → insert `agent_jobs` → return runId). The LLM call moves to the worker.
- `analyze-company`, `research-competitors` — migrate into worker jobs (they're long-running research; the 150s edge limit is already a ceiling on quality). Short-term they can stay as-is.
- Chat functions (`bmc-chat` etc.) — collapse into **one** `agent-chat` function that resolves the section's `agent_profile` and streams; later, proxy to the worker for tool-using chat.
- `scheduled-loop-tick` — replaced by pg_cron + enqueue.

### Migration path (compressed)

1. **Phase A:** Stand up the worker (Claude Agent SDK, one `canvas_section_analysis` job type). Point `agent-run` at the queue. Ship — everything else keeps working.
2. **Phase B:** Move research (company + competitor) into worker jobs with Firecrawl + Grok tools and an evidence-writing pipeline.
3. **Phase C:** Turn on `scheduled_loops` via pg_cron. Section agents get proactive instructions.
4. **Phase D:** Strategist orchestrator with playbook skills + cross-section synthesis + competitor gap engine.

See `docs/ROADMAP.md` for the full phased plan.

---

## Decision log

- **2026-07-02** — Recommended: Claude Agent SDK worker + OpenRouter routing + Supabase as truth + pg_cron scheduling. Hermes retained as dev copilot only. Rationale: multi-tenancy, durability, hook-enforced evidence discipline, and the existing schema/interface boundary make this the shortest path that doesn't cap the product's ceiling.
