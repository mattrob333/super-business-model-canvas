import { describe, expect, it } from "vitest";
import { CanvasSectionAnalysisHandler } from "../jobs/canvas-section-analysis.js";
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
    const handler = new CanvasSectionAnalysisHandler({ client: client.asSupabase(), runner });

    await handler.handle(makeJob());

    expect(runner.lastRequest?.allowedTools).toEqual(["mcp__bmc__*"]);
    expect(Object.keys(runner.lastRequest?.mcpServers ?? {})).toEqual(["bmc"]);
    expect(runner.lastRequest?.prompt).toContain("Existing value");

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

  then(resolve: (value: { error: null }) => void) {
    if (this.updateValues) {
      this.client.updates.push({
        table: this.table,
        values: this.updateValues,
        filters: [...this.filters],
      });
    }
    resolve({ error: null });
  }
}
