import { describe, expect, it } from "vitest";
import type { AgentRunRequest, AgentRunResult, AgentRunner } from "../agent/runner.js";
import { WorkspaceChatHandler, stripLeadingToolEcho } from "../jobs/workspace-chat.js";
import type { AgentJob } from "../queue/types.js";

class CapturingRunner implements AgentRunner {
  request: AgentRunRequest | null = null;

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    this.request = request;
    return {
      resultText: "Use annual contract context [S1].",
      sessionId: "session-1",
      costUsd: 0.01,
      tokensIn: 10,
      tokensOut: 8,
    };
  }
}

describe("WorkspaceChatHandler", () => {
  it("injects enabled context source notes into the system prompt only", async () => {
    const client = new WorkspaceChatFakeClient();
    const runner = new CapturingRunner();
    await new WorkspaceChatHandler({
      client: client.asSupabase(),
      runner,
    }).handle(makeJob());

    expect(runner.request?.systemPrompt).toContain("[S1] Sales motion note (note)");
    expect(runner.request?.systemPrompt).toContain("Annual contracts matter for enterprise buyers.");
    expect(runner.request?.systemPrompt).not.toContain("Disabled private thought");
    expect(client.inserts.some((entry) => entry.table === "workspace_messages")).toBe(true);
  });

  it("skips non-anthropic routes — a legacy grok profile default never reaches the Claude CLI (RF-LIVE-8)", async () => {
    const client = new WorkspaceChatFakeClient();
    const runner = new CapturingRunner();
    await new WorkspaceChatHandler({
      client: client.asSupabase(),
      runner,
    }).handle(makeJob());

    expect(runner.request?.model).toBe("claude-sonnet-5");
  });

  it("injects the section canvas and company brief so the agent starts grounded (RF-LIVE-19)", async () => {
    const client = new WorkspaceChatFakeClient();
    const runner = new CapturingRunner();
    await new WorkspaceChatHandler({
      client: client.asSupabase(),
      runner,
    }).handle(makeJob());

    expect(runner.request?.systemPrompt).toContain("Company: Acme Robotics");
    expect(runner.request?.systemPrompt).toContain("Enterprise SaaS subscriptions");
    expect(runner.request?.systemPrompt).toContain("Usage-based robotics API tier");
  });

  it("teaches the data-gap protocol — thin data means coaching, not guessing (owner directive)", async () => {
    const client = new WorkspaceChatFakeClient();
    const runner = new CapturingRunner();
    await new WorkspaceChatHandler({
      client: client.asSupabase(),
      runner,
    }).handle(makeJob());

    expect(runner.request?.systemPrompt).toContain("Data-gap protocol");
    expect(runner.request?.systemPrompt).toContain("what having it unlocks strategically");
  });

  it("budgets enough for a tool-using chat turn — the old ~$0.13 ceiling tripped error_max_budget_usd (RF-LIVE-19)", async () => {
    const client = new WorkspaceChatFakeClient();
    const runner = new CapturingRunner();
    await new WorkspaceChatHandler({
      client: client.asSupabase(),
      runner,
    }).handle(makeJob());

    expect(runner.request?.maxBudgetUsd).toBeGreaterThanOrEqual(0.75);
  });

  it("strips a leading tool-result JSON echo from replies but never swallows a whole message", () => {
    const prose = "Bottom line: the section is empty, so let's run the analysis first and go from there.";
    expect(stripLeadingToolEcho(`{"items": [], "confidence": "low"}\n\n${prose}`)).toBe(prose);
    expect(stripLeadingToolEcho("```json\n{\"items\": []}\n```\n" + prose)).toBe(prose);
    // Prose-only, JSON-only, and JSON-looking-but-invalid replies pass through untouched.
    expect(stripLeadingToolEcho(prose)).toBe(prose);
    expect(stripLeadingToolEcho('{"items": []}')).toBe('{"items": []}');
    expect(stripLeadingToolEcho(`{not json${prose}`)).toBe(`{not json${prose}`);
    // Slightly-invalid JSON echoes (trailing commas) are still JSON-shaped — stripped.
    expect(stripLeadingToolEcho(`{"items": [],}\n\n${prose}`)).toBe(prose);
  });
});

function makeJob(): AgentJob {
  return {
    id: "job-1",
    account_id: "account-1",
    agent_run_id: "run-1",
    parent_run_id: null,
    cascade_run_id: null,
    kind: "workspace_chat",
    status: "queued",
    payload: { thread_id: "thread-1" },
    attempts: 0,
    max_attempts: 3,
    run_after: new Date().toISOString(),
    locked_at: null,
    heartbeat_at: null,
    claimed_by: null,
    last_error: null,
    created_at: new Date().toISOString(),
  };
}

class WorkspaceChatFakeClient {
  inserts: Array<{ table: string; values: unknown }> = [];
  updates: Array<{ table: string; values: unknown }> = [];

  readonly tables: Record<string, unknown[]> = {
    workspace_threads: [{
      id: "thread-1",
      account_id: "account-1",
      agent_profile_id: "profile-1",
      title: "Chat",
    }],
    agent_profiles: [{
      id: "profile-1",
      account_id: "account-1",
      agent_key: "agent_customer_segments",
      display_name: "Segment",
      system_instructions: "You are Segment.",
      // The live RF-LIVE-8 shape: profiles seeded with the legacy grok route.
      model_route_key: "standard",
    }],
    model_routes: [{
      account_id: null,
      route_key: "standard",
      task_class: null,
      provider: "xai",
      model_name: "grok-4.3",
      cost_per_1k_in: 0.00125,
      cost_per_1k_out: 0.0025,
    }, {
      account_id: null,
      route_key: "workspace_chat",
      task_class: "workspace_chat",
      provider: "anthropic",
      model_name: "claude-sonnet-5",
      cost_per_1k_in: 0.002,
      cost_per_1k_out: 0.01,
    }],
    workspace_messages: [{
      role: "user",
      kind: "text",
      content: { text: "What should I consider?" },
      created_at: "2026-07-06T00:00:00Z",
    }],
    context_sources: [{
      id: "source-enabled",
      account_id: "account-1",
      agent_profile_id: "profile-1",
      type: "note",
      name: "Sales motion note",
      uri: null,
      config: { text: "Annual contracts matter for enterprise buyers." },
      enabled: true,
      created_at: "2026-07-06T00:00:00Z",
    }, {
      id: "source-disabled",
      account_id: "account-1",
      agent_profile_id: "profile-1",
      type: "note",
      name: "Disabled note",
      uri: null,
      config: { text: "Disabled private thought" },
      enabled: false,
      created_at: "2026-07-06T00:01:00Z",
    }],
    agent_runs: [{ id: "run-1", account_id: "account-1" }],
    canvas_section_versions: [{
      account_id: "account-1",
      section_key: "customer_segments",
      competitor_id: null,
      items: [
        { text: "Enterprise SaaS subscriptions", confidence: 0.8 },
        "Usage-based robotics API tier",
      ],
      notes: "Grow enterprise mix to 60% by Q4.",
      created_at: "2026-07-06T00:00:00Z",
    }],
    business_context_versions: [{
      account_id: "account-1",
      company_name: "Acme Robotics",
      industry: "Industrial automation",
      summary: "Sells robotic arms to mid-market manufacturers.",
      created_at: "2026-07-06T00:00:00Z",
    }],
  };

  asSupabase() {
    return {
      from: (table: string) => new WorkspaceChatFakeQuery(this, table),
    } as never;
  }
}

class WorkspaceChatFakeQuery {
  private filters: Array<{ column: string; value: unknown }> = [];
  private limitCount: number | null = null;
  private pendingInsert: unknown | null = null;
  private pendingUpdate: unknown | null = null;

  constructor(private readonly client: WorkspaceChatFakeClient, private readonly table: string) {}

  select(): this { return this; }
  order(): this { return this; }
  limit(count: number): this { this.limitCount = count; return this; }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }

  or(): this { return this; }

  insert(values: unknown): Promise<{ error: null }> {
    this.client.inserts.push({ table: this.table, values });
    this.pendingInsert = values;
    return Promise.resolve({ error: null });
  }

  update(values: unknown): this {
    this.client.updates.push({ table: this.table, values });
    this.pendingUpdate = values;
    return this;
  }

  async maybeSingle(): Promise<{ data: unknown | null; error: null }> {
    return { data: this.rows()[0] ?? null, error: null };
  }

  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    if (this.pendingUpdate) {
      return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
    }
    if (this.pendingInsert) {
      return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
    }
    return Promise.resolve({ data: this.rows(), error: null }).then(onfulfilled, onrejected);
  }

  private rows(): unknown[] {
    let rows = [...(this.client.tables[this.table] ?? [])] as Record<string, unknown>[];
    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    return rows;
  }
}
