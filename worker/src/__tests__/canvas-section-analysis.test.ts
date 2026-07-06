import { describe, expect, it } from "vitest";
import { CanvasSectionAnalysisHandler, chooseModelRoute } from "../jobs/canvas-section-analysis.js";
import { createJobDispatcher } from "../jobs/dispatch.js";
import type { AgentRunner } from "../agent/runner.js";
import type { AgentJob } from "../queue/types.js";

function makeJob(): AgentJob {
  return {
    id: "job-1",
    account_id: "account-1",
    kind: "canvas_section_analysis",
    payload: { section_key: "value_propositions" },
    status: "running",
    attempts: 1,
    max_attempts: 3,
    agent_run_id: "run-1",
    parent_run_id: null,
    cascade_run_id: null,
    claimed_by: "worker-a",
    locked_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    run_after: new Date().toISOString(),
    last_error: null,
    created_at: new Date().toISOString(),
  };
}

describe("CanvasSectionAnalysisHandler", () => {
  it("runs a section analysis job and writes the legacy output shape account-scoped", async () => {
    const client = new FakeSupabaseClient();
    const runner = new RecordingRunner();
    const handler = new CanvasSectionAnalysisHandler({
      client: client.asSupabase(),
      runner,
      taskLimits: {
        sectionAnalysis: { maxTurns: 12, taskBudgetTokens: 12345, maxBudgetUsd: 0.42 },
        workspaceChat: { maxTurns: 8, taskBudgetTokens: 6789 },
      },
    });

    await handler.handle(makeJob());

    expect(runner.lastRequest?.allowedTools).toEqual(["mcp__bmc__*"]);
    expect(Object.keys(runner.lastRequest?.mcpServers ?? {})).toEqual(["bmc"]);
    expect(runner.lastRequest?.prompt).toContain("Existing value");
    expect(runner.lastRequest?.maxTurns).toBe(12);
    expect(runner.lastRequest?.taskBudgetTokens).toBe(12345);
    expect(runner.lastRequest?.maxBudgetUsd).toBe(0.42);
    expect(runner.lastRequest?.hooks?.PreToolUse).toHaveLength(2);

    expect(client.updates).toHaveLength(2);
    expect(client.updates[0]).toMatchObject({
      table: "agent_runs",
      filters: [
        ["id", "run-1"],
        ["account_id", "account-1"],
      ],
      values: { status: "running", run_type: "canvas_section_analysis" },
    });
    expect(client.updates[1]).toMatchObject({
      table: "agent_runs",
      filters: [
        ["id", "run-1"],
        ["account_id", "account-1"],
      ],
      values: {
        status: "completed",
        output: {
          items: ["Sharper customer promise"],
          notes: "Focus the offer on measurable time savings.",
          confidence: 0.82,
          summary: "The value proposition is clear but should be more quantified.",
        },
        tokens_in: 100,
        tokens_out: 50,
      },
    });
  });

  it("marks the linked agent run failed when the handler throws", async () => {
    const client = new FakeSupabaseClient();
    const dispatcher = createJobDispatcher({
      client: client.asSupabase(),
      runner: {
        async run() {
          throw new Error("Claude Agent SDK run failed with subtype: error_max_budget_usd");
        },
      },
    });

    await expect(dispatcher(makeJob())).rejects.toThrow("error_max_budget_usd");

    expect(client.updates.at(-1)).toMatchObject({
      table: "agent_runs",
      filters: [
        ["id", "run-1"],
        ["account_id", "account-1"],
      ],
      values: {
        status: "failed",
        error: "Claude Agent SDK run failed with subtype: error_max_budget_usd",
      },
    });
  });

  it("prefers deterministic model routes over legacy tier ties", () => {
    const routes = [
      {
        account_id: null,
        route_key: "standard",
        task_class: null,
        provider: "xai",
        model_name: "grok-legacy-standard",
        cost_per_1k_in: null,
        cost_per_1k_out: null,
      },
      {
        account_id: null,
        route_key: "section_analysis",
        task_class: "section_analysis",
        provider: "anthropic",
        model_name: "global-sonnet",
        cost_per_1k_in: null,
        cost_per_1k_out: null,
      },
      {
        account_id: "account-1",
        route_key: "standard",
        task_class: null,
        provider: "openrouter",
        model_name: "account-standard",
        cost_per_1k_in: null,
        cost_per_1k_out: null,
      },
      {
        account_id: "account-1",
        route_key: "section_analysis",
        task_class: "section_analysis",
        provider: "anthropic",
        model_name: "account-section-analysis",
        cost_per_1k_in: null,
        cost_per_1k_out: null,
      },
    ];

    expect(chooseModelRoute(routes, "account-1", "standard")?.model_name).toBe("account-standard");
    expect(chooseModelRoute(routes.slice(0, 2), "account-1", "standard")?.model_name).toBe("grok-legacy-standard");
    expect(chooseModelRoute([routes[1]], "account-1", "missing")?.model_name).toBe("global-sonnet");
  });
});

class RecordingRunner implements AgentRunner {
  public lastRequest: Parameters<AgentRunner["run"]>[0] | null = null;

  async run(request: Parameters<AgentRunner["run"]>[0]) {
    this.lastRequest = request;
    return {
      resultText: JSON.stringify({
        items: ["Sharper customer promise"],
        notes: "Focus the offer on measurable time savings.",
        confidence: 0.82,
        summary: "The value proposition is clear but should be more quantified.",
      }),
      sessionId: "session-1",
      costUsd: 0.0123,
      tokensIn: 100,
      tokensOut: 50,
    };
  }
}

class FakeSupabaseClient {
  public updates: Array<{ table: string; values: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];

  asSupabase() {
    return this as never;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  selectOne(table: string): Record<string, unknown> | null {
    if (table === "agent_profiles") {
      return {
        id: "profile-1",
        agent_key: "agent_value_propositions",
        system_instructions: null,
        model_route_key: "section_analysis",
      };
    }
    if (table === "model_routes") {
      return {
        provider: "anthropic",
        model_name: "claude-sonnet-4-5",
        cost_per_1k_in: 0.003,
        cost_per_1k_out: 0.015,
      };
    }
    if (table === "business_context_versions") {
      return { company_name: "Acme", industry: "B2B SaaS" };
    }
    if (table === "canvas_section_versions") {
      return { items: [{ text: "Existing value" }] };
    }
    return null;
  }

  selectMany(table: string): Array<Record<string, unknown>> {
    if (table === "business_context_versions") {
      return [{ id: "ctx-1", company_name: "Acme", website: null, created_at: "2026-07-01T00:00:00Z" }];
    }
    if (table === "model_routes") {
      return [
        {
          account_id: null,
          route_key: "standard",
          task_class: null,
          provider: "xai",
          model_name: "grok-legacy-standard",
          cost_per_1k_in: 0.002,
          cost_per_1k_out: 0.01,
        },
        {
          account_id: null,
          route_key: "section_analysis",
          task_class: "section_analysis",
          provider: "anthropic",
          model_name: "claude-sonnet-4-5",
          cost_per_1k_in: 0.003,
          cost_per_1k_out: 0.015,
        },
      ];
    }
    return [];
  }
}

class FakeQuery {
  private readonly filters: Array<[string, unknown]> = [];
  private updateValues: Record<string, unknown> | null = null;

  constructor(
    private readonly client: FakeSupabaseClient,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.updateValues = values;
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push([`in:${column}`, values]);
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  or(): this {
    return this;
  }

  order(): this {
    return this;
  }

  limit(): this {
    return this;
  }

  async maybeSingle() {
    return { data: this.client.selectOne(this.table), error: null };
  }

  then(resolve: (value: { data?: Array<Record<string, unknown>>; error: null }) => void) {
    if (this.updateValues) {
      this.client.updates.push({
        table: this.table,
        values: this.updateValues,
        filters: [...this.filters],
      });
      resolve({ error: null });
      return;
    }

    resolve({ data: this.client.selectMany(this.table), error: null });
  }
}
