import { describe, expect, it } from "vitest";
import { StalenessSweepHandler } from "../jobs/staleness-sweep.js";
import type { AgentJob } from "../queue/types.js";

describe("StalenessSweepHandler", () => {
  it("downgrades old canvas sections account-scoped", async () => {
    const client = new FakeClient();
    const handler = new StalenessSweepHandler({ client: client.asSupabase() });

    await handler.handle(makeJob());

    expect(client.updates).toHaveLength(2);
    expect(client.updates[0]).toMatchObject({
      values: { freshness_status: "outdated" },
      filters: [["account_id", "account-1"], ["freshness_status", "stale"]],
    });
    expect(client.updates[0]?.lessThan?.[0]).toBe("last_verified_at");
    expect(client.updates[1]).toMatchObject({
      values: { freshness_status: "stale" },
      filters: [["account_id", "account-1"]],
      inFilters: [["freshness_status", ["fresh", "unverified"]]],
    });
    expect(client.updates[1]?.lessThan?.[0]).toBe("last_verified_at");
  });
});

function makeJob(): AgentJob {
  return {
    id: "job-1",
    account_id: "account-1",
    kind: "staleness_sweep",
    payload: { stale_days: 30, outdated_days: 90 },
    status: "running",
    attempts: 1,
    max_attempts: 3,
    agent_run_id: null,
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

class FakeClient {
  public updates: Array<{
    values: Record<string, unknown>;
    filters: Array<[string, unknown]>;
    inFilters: Array<[string, unknown[]]>;
    lessThan: [string, unknown] | null;
  }> = [];

  asSupabase(): never {
    return this as never;
  }

  from(): FakeQuery {
    return new FakeQuery(this);
  }
}

class FakeQuery {
  private values: Record<string, unknown> = {};
  private readonly filters: Array<[string, unknown]> = [];
  private readonly inFilters: Array<[string, unknown[]]> = [];
  private lessThan: [string, unknown] | null = null;

  constructor(private readonly client: FakeClient) {}

  update(values: Record<string, unknown>): this {
    this.values = values;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.inFilters.push([column, values]);
    return this;
  }

  lt(column: string, value: unknown): Promise<{ error: null }> {
    this.lessThan = [column, value];
    this.client.updates.push({
      values: this.values,
      filters: this.filters,
      inFilters: this.inFilters,
      lessThan: this.lessThan,
    });
    return Promise.resolve({ error: null });
  }
}
