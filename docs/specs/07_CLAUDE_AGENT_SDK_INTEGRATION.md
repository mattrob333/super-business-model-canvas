# Spec 07 — Claude Agent SDK Integration Guide (the worker's engine)

> How to actually use `@anthropic-ai/claude-agent-sdk` inside the Phase-2 worker service.
> API surface verified against the official SDK docs (TypeScript SDK ≥ 0.3.198, July 2026:
> code.claude.com/docs/en/agent-sdk/). **Build agents: do not guess SDK APIs — use the
> symbols in this doc; if you need something not covered here, fetch the official docs
> rather than inventing.** Architecture context: `AGENT_RUNTIME_DECISION.md`; work orders:
> `BUILD_PLAN.md` Phase 2.

## 0. Install & headless baseline

```bash
npm install @anthropic-ai/claude-agent-sdk zod
```

- Node ≥ 18. The Claude Code binary ships as a bundled optional dependency — nothing else
  to install in the Docker image.
- Auth: `ANTHROPIC_API_KEY` env var on the worker. Never a per-request key from the browser.
- Every `query()` spawns a subprocess — our job concurrency cap (BUILD_PLAN 2.2) is also the
  subprocess cap. Call `q.close()` in a `finally` block.
- Session files persist to `~/.claude/projects/<encoded-cwd>/` by default. The worker
  container must either make that writable or pass `persistSession: false` (our default —
  durable state lives in Postgres, not container disk; see §6).

## 1. The core loop, mapped to a job

Every job kind (BUILD_PLAN 2.3/2.5, 3.3, 4.2/4.3, 6.1) is one `query()` call shaped like:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

async function runAgentJob(job: AgentJob, profile: AgentProfile) {
  const abort = new AbortController();
  const q = query({
    prompt: buildPrompt(job),                      // task + injected context sources
    options: {
      systemPrompt: profile.system_instructions,   // from agent_profiles — plain string,
                                                   // NOT the claude_code preset
      model: resolveModelRoute(profile, job.task_class),  // full model ID from model_routes
      maxTurns: 40,
      maxBudgetUsd: budgetForJob(job),             // hard SDK-level cost stop
      permissionMode: "bypassPermissions",         // headless — our gating is hooks (§4)
      settingSources: [],                          // CRITICAL: ignore any filesystem
                                                   // .claude/settings — worker config only
      persistSession: false,                       // durable state is Postgres (§6)
      env: { ...process.env },                     // env does NOT inherit by default
      abortController: abort,
      mcpServers: { bmc: bmcServer },              // §3
      allowedTools: ["mcp__bmc__*"],               // section agents get ONLY our tools
      hooks: guardrailHooks(job),                  // §4
      agents: job.kind === "orchestrator" ? sectionSubagents(job) : undefined, // §5
    },
  });

  try {
    for await (const message of q) {
      if (message.type === "assistant") await recordTurn(job, message);   // workspace_messages
      if (message.type === "result") {
        // subtypes: success | error_max_turns | error_max_budget_usd |
        //           error_during_execution | interrupted
        await finalizeRun(job, {
          status: message.subtype === "success" ? "completed" : "failed",
          output: message.result,
          costUsd: message.total_cost_usd,
          usage: message.usage,          // input/output/cache_* token counts
          sessionId: message.session_id,
        });
      }
    }
  } finally {
    q.close();
  }
}
```

Key mappings to our schema: `result.total_cost_usd` → `agent_runs.estimated_cost` (real
numbers replace the hand-rolled cost table in the old edge function) · `result.usage.*` →
`tokens_in`/`tokens_out` · `result.session_id` → stored on the run for resume (§6).

`Query` also exposes `interrupt()` (wire to run cancellation), `setModel()`, and
`setPermissionMode()` mid-stream.

## 2. Section-agent isolation via tool allowlists

Section agents must not touch the filesystem or shell — their whole world is our MCP tools.
Enforce with `allowedTools` (never rely on prompt instructions):

```typescript
// Section agent (e.g. Yield): only our tools + nothing built-in
allowedTools: ["mcp__bmc__*", "mcp__research__*"]

// Atlas additionally gets the subagent invoker
allowedTools: ["mcp__bmc__*", "mcp__research__*", "mcp__orchestration__*", "Agent"]
```

`disallowedTools` is belt-and-suspenders for the dangerous built-ins:
`["Bash", "Write", "Edit"]` on every profile.

## 3. Our tools: in-process MCP servers backed by Supabase

`tool()` + `createSdkMcpServer()` is how BUILD_PLAN 2.4's core tools are built. Exact shape:

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const readCanvas = tool(
  "read_canvas",
  "Read current items for a BMC section (own section or read-only view of others). " +
    "Call before proposing any change.",
  { section_key: z.enum(SECTION_KEYS), include_evidence: z.boolean().default(false) },
  async (args, extra) => {
    // ACCOUNT SCOPING IS HERE, IN CODE — the worker uses the service role,
    // so RLS does not protect us. ctx carries the job's account_id; never
    // accept an account_id from the model.
    const rows = await db.canvasSections(ctx.accountId, args.section_key);
    return {
      content: [{ type: "text", text: renderSections(rows) }],
      structuredContent: { items: rows },          // machine-readable for chaining
    };
  },
  { annotations: { readOnlyHint: true } }           // lets the SDK parallelize reads
);

const writeSectionItems = tool(
  "write_section_items",
  "Propose replacement items for YOUR OWN section. Items with confidence >= 0.7 MUST " +
    "include evidence_ids. Writes land as proposals unless the run is pre-authorized.",
  {
    section_key: z.enum(SECTION_KEYS),
    items: z.array(z.object({
      text: z.string(),
      confidence: z.number().min(0).max(1),
      evidence_ids: z.array(z.string().uuid()).default([]),
    })),
    notes: z.string(),
  },
  async (args) => {
    if (args.section_key !== ctx.ownSectionKey) {
      return { content: [{ type: "text", text: "DENIED: not your section." }], isError: true };
    }
    // evidence discipline enforced again here (hooks are the first gate, §4)
    ...
  },
  { annotations: { destructiveHint: true } }
);

export const bmcServer = createSdkMcpServer({
  name: "bmc",                                      // → tool names mcp__bmc__read_canvas etc.
  version: "1.0.0",
  tools: [readCanvas, writeSectionItems, logEvidence, openGap, postInsight,
          readCompetitorCanvas],
});
```

Notes the build team must not miss:
- Tool handlers return `{ content: [...], isError?: boolean }`. Return `isError: true` for
  domain denials (wrong section, missing evidence) — the agent sees the message and adapts;
  don't throw.
- **The service-role key bypasses RLS. Every handler filters by the job's `account_id` from
  worker context — this is the #1 reviewer check in Phase 2.**
- Firecrawl: prefer their official MCP server as an **external stdio server** in the same
  `mcpServers` map (`{ command: "npx", args: ["-y", "firecrawl-mcp"], env: { FIRECRAWL_API_KEY } }`),
  wrapped behind our feed cache (spec 05 §6) via a thin in-process proxy tool when caching
  matters. Grok live search stays an in-process tool calling `api.x.ai` directly.
- On startup, check the `system`/`init` message's `mcp_servers` list for `status !== "connected"`
  and fail the job loudly — a silently absent toolset produces confident hallucination.

## 4. Guardrails as hooks (BUILD_PLAN 2.8 — this is where policy is code)

```typescript
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

const evidenceGate: HookCallback = async (input) => {
  if (input.hook_event_name !== "PreToolUse") return {};
  if (input.tool_name !== "mcp__bmc__write_section_items") return {};
  const items = (input.tool_input as any)?.items ?? [];
  const violation = items.find((i: any) => i.confidence >= 0.7 && !(i.evidence_ids?.length));
  if (violation) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "Evidence-or-low-confidence rule: items at confidence >= 0.7 require evidence_ids. " +
          "Lower the confidence or attach evidence.",
      },
    };
  }
  return {};
};

const auditLog: HookCallback = async (input, toolUseID) => {
  await db.appendRunEvent(ctx.runId, input.hook_event_name, input, toolUseID);
  return {};
};

const guardrailHooks = (job: AgentJob) => ({
  PreToolUse: [
    { matcher: "mcp__bmc__write_section_items", hooks: [evidenceGate] },
    { hooks: [auditLog] },                          // no matcher = every tool
  ],
  PostToolUse: [{ hooks: [auditLog] }],
  PostToolUseFailure: [{ hooks: [auditLog] }],
  SubagentStart: [{ hooks: [delegationTracker] }],  // delegation cards, spec 03
  SubagentStop: [{ hooks: [delegationTracker] }],
});
```

The permission evaluation order is: hooks → deny rules → permission mode → allow rules →
`canUseTool`. We put policy in **hooks** (deterministic, first in line) and use
`bypassPermissions` mode so nothing ever waits for an interactive prompt. Outward actions
(outreach) aren't even hook-gated — they're tools that only write `approvals` rows (spec 04
§1d); the guardrail is that no "send" tool exists in the worker at all.

## 5. Atlas's subagents: the orchestrator topology (BUILD_PLAN 6.1)

The `agents` option gives us depth-1 delegation natively — and its shape maps 1:1 onto our
`agent_profiles` rows:

```typescript
function sectionSubagents(job: AgentJob): Record<string, AgentDefinition> {
  return Object.fromEntries(profiles.map((p) => [
    p.agent_key,                                    // "agent_revenue_streams" etc.
    {
      description: p.description,                   // Atlas uses this to pick delegates
      prompt: p.system_instructions,                // the section agent's own persona
      tools: ["mcp__bmc__*", "mcp__research__*"],   // never the Agent tool → depth-1 enforced
      model: resolveModelRoute(p, "section_analysis"),
      maxTurns: 20,
      background: true,                             // non-blocking — Atlas keeps working
    },
  ]));
}
```

- Atlas needs `"Agent"` in its `allowedTools` to invoke them; **section subagents never get
  `"Agent"`**, which enforces the depth-1 rule structurally, not by prompt.
- Subagent activity is observable: messages carry `parent_tool_use_id`, and
  `SubagentStart`/`SubagentStop` hooks give us the delegation lifecycle for the War Room's
  delegation cards and `agent_runs` child records.
- `background: true` gives the async fan-out the cascade executor wants for parallel
  `order_group`s. The DAG executor (spec 04 §3) can either drive subagents inside one Atlas
  query (small cascades) or enqueue separate `agent_jobs` per step (large ones — preferred:
  it keeps per-step durability). Default to per-step jobs; reserve in-query subagents for
  Atlas's ad-hoc delegations from chat.

## 6. Sessions ↔ our threads

- **Workspace chat** (spec 02): store `result.session_id` on `workspace_threads.sdk_session_id`.
  Next human turn: `resume: thread.sdk_session_id` → full agent context without replaying
  history through the prompt. Use `forkSession: true` for "what-if" branches.
- Because we run `persistSession: false` + Postgres-as-truth, a lost SDK session is
  recoverable: rebuild context by feeding recent `workspace_messages` into the prompt.
  Session resume is an optimization, not the source of truth. (If we later want durable SDK
  sessions, the worker must pin jobs for a thread to the same container/volume — noted as a
  Phase 5 decision, default no.)
- Loop/cascade runs are one-shot: no resume, fresh `query()` per run, self-contained prompt
  (same principle as the old Hermes cron constraint — scheduled runs read the DB, not memory).

## 7. Structured output

The SDK has no JSON-schema output option on `query()`. Our contract:

1. Prefer **tool-mediated output**: the run's "final answer" is a call to a tool
   (`write_section_items`, `post_insight`, `compose_brief`) with a zod-validated schema —
   validation is free and the write is the output. This is the default for all loop/cascade
   jobs.
2. For chat, the assistant text is the product; no parsing needed.
3. Where a job truly needs a JSON blob back (verifier verdicts), instruct the shape in the
   system prompt, parse `result.result` with a fence-stripping `safeParseJson()` (we learned
   this lesson in the edge functions), and retry once on parse failure via `resume`.

## 8. Model selection

`model` accepts full IDs — resolve from `model_routes` by task_class (spec 06 §1), never
hardcode. The worker's route resolver returns e.g. Sonnet-class for `section_analysis`,
frontier for Atlas `strategy_synthesis`, and budget models are *not* run through the Agent
SDK at all — `extract`/`classify` calls go straight to OpenRouter's chat-completions API
(cheaper, no agent loop needed). The SDK is for agentic work; don't pay its loop overhead
for one-shot extraction.

## 9. Worker checklist (condensed for Phase 2 acceptance)

- [ ] `settingSources: []` on every query (no filesystem settings leakage)
- [ ] `permissionMode: "bypassPermissions"` + hooks as the only gate; no path can prompt
- [ ] `allowedTools` allowlist per profile; `Bash`/`Write`/`Edit` disallowed everywhere
- [ ] Every tool handler scopes by `ctx.accountId` (service role bypasses RLS)
- [ ] `maxBudgetUsd` + `maxTurns` on every query; `error_max_budget_usd` → run `failed`
      with a budget note, loop failure-count incremented
- [ ] `q.close()` in `finally`; abort controller wired to job cancellation
- [ ] init-message MCP connection check; hard-fail on unconnected server
- [ ] `total_cost_usd`/`usage` recorded on every `agent_runs` row
- [ ] Subagents never receive the `Agent` tool (depth-1 structural enforcement)

## Appendix: alternative considered — Anthropic Managed Agents

Anthropic also offers **Managed Agents** (beta): server-managed sessions where Anthropic
hosts the agent loop *and* the tool-execution container, with cron-scheduled deployments
built in. We evaluated it while writing this spec. Staying with the self-hosted Agent SDK
worker because: our tools are thin Supabase queries (no container/filesystem needed), the
evidence/approval guardrails must run in *our* code path, per-account budget accounting
lives in our tables, and multi-tenant isolation is our own account-scoping logic. Managed
Agents is worth revisiting at Phase 7+ if worker ops become a burden — the concepts map
cleanly (agents ≈ agent_profiles, deployments ≈ scheduled_loops) — but it would relocate
the guardrail layer, so it's a deliberate future decision, not a default.
