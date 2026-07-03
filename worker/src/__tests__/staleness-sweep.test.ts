import { describe, expect, it } from "vitest";
import { StalenessSweepHandler } from "../jobs/staleness-sweep.js";
import type { AgentJob } from "../queue/types.js";

describe("StalenessSweepHandler", () => {
  it("downgrades old canvas sections account-scoped, including never-verified rows", async () => {
    const client = new FakeClient();
    const handler = new StalenessSweepHandler({ client: client.asSupabase() });

    await handler.handle(makeJob());

    expect(client.updates).toHaveLength(2);
    expect(client.updates[0]).toMatchObject({
      table: "canvas_section_versions",
      values: { freshness_status: "outdated" },
      filters: [["account_id", "account-1"], ["freshness_status", "stale"]],
    });
    expect(client.updates[1]).toMatchObject({
      table: "canvas_section_versions",
      values: { freshness_status: "stale" },
      filters: [["account_id", "account-1"]],
      inFilters: [["freshness_status", ["fresh", "unverified"]]],
    });

    // Null last_verified_at rows must be aged by created_at, not skipped.
    for (const update of client.updates) {
      expect(update.orFilter).toContain("last_verified_at.lt.");
      expect(update.orFilter).toContain("last_verified_at.is.null,created_at.lt.");
    }
  });

  it("marks the durable agent run completed when the job carries one", async () => {
    const client = new FakeClient();
    const handler = new StalenessSweepHandler({ client: client.asSupabase() });

    await handler.handle({ ...makeJob(), agent_run_id: "run-9" });

    const runUpdate = client.updates.find((update) => update.table === "agent_runs");
    expect(runUpdate).toMatchObject({
      values: { status: "completed" },
      filters: [["id", "run-9"], ["account_id", "account-1"]],
    });
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
    table: string;
    values: Record<string, unknown>;
    filters: Array<[string, unknown]>;
    inFilters: Array<[string, unknown[]]>;
    orFilter: string | null;
  }> = [];

  asSupabase(): never {
    return this as never;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }
}

class FakeQuery implements PromiseLike<{ error: null }> {
  private values: Record<string, unknown> = {};
  private readonly filters: Array<[string, unknown]> = [];
  private readonly inFilters: Array<[string, unknown[]]> = [];
  private orFilter: string | null = null;

  constructor(private readonly client: FakeClient, private readonly table: string) {}

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

  or(filter: string): this {
    this.orFilter = filter;
    return this;
  }

  then<TResult1 = { error: null }, TResult2 = never>(
    onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    this.client.updates.push({
      table: this.table,
      values: this.values,
      filters: this.filters,
      inFilters: this.inFilters,
      orFilter: this.orFilter,
    });
    return Promise.resolve({ error: null as null }).then(onfulfilled);
  }
}
