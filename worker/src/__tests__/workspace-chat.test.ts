import { describe, expect, it } from "vitest";
import type { AgentRunRequest, AgentRunResult, AgentRunner } from "../agent/runner.js";
import { WorkspaceChatHandler } from "../jobs/workspace-chat.js";
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
      agent_key: "customers",
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
