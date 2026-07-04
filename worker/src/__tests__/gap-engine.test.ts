import { describe, expect, it } from "vitest";
import { GapEngineHandler } from "../jobs/gap-engine.js";
import { createJobDispatcher } from "../jobs/dispatch.js";
import type { AgentJob } from "../queue/types.js";

describe("GapEngineHandler", () => {
  it("creates scored competitor gaps and threat metrics from latest canvas fixtures", async () => {
    const client = new GapEngineFakeClient();
    const handler = new GapEngineHandler(client.asSupabase());

    await handler.handle(makeGapJob());

    const companiesSelect = client.selects.find((select) => select.table === "companies");
    expect(companiesSelect?.filters).toEqual(expect.arrayContaining([
      ["account_id", "account-1"],
      ["is_competitor", true],
    ]));

    const gapRows = client.inserts.find((insert) => insert.table === "gaps")?.value as Array<Record<string, unknown>>;
    expect(gapRows).toHaveLength(2);
    expect(gapRows[0]).toMatchObject({
      account_id: "account-1",
      competitor_id: "competitor-1",
      gap_type: "competitive",
      affected_sections: ["value_propositions"],
      formula_version: "competitor_gap_v1",
    });
    expect(gapRows[0].score).toBeGreaterThan(40);
    expect(gapRows[0].score_inputs).toMatchObject({
      formula_version: "competitor_gap_v1",
      best_overlap: 0,
    });

    const metricRows = client.inserts.find((insert) => insert.table === "metric_snapshots")?.value as Array<Record<string, unknown>>;
    expect(metricRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metric_key: "competitor.section_delta",
        section_key: "value_propositions",
        label: "RivalCo",
      }),
      expect.objectContaining({
        metric_key: "competitor.threat_index",
        label: "RivalCo",
        inputs: expect.objectContaining({
          competitor_id: "competitor-1",
          formula_version: "threat_index_v1",
          gap_count: 2,
        }),
      }),
    ]));
    expect(client.updates.at(-1)).toMatchObject({
      table: "agent_runs",
      values: {
        status: "completed",
        output: expect.objectContaining({ competitors_analyzed: 1, gaps_created: 2 }),
      },
    });
  });

  it("dispatcher supports gap_engine jobs", async () => {
    const client = new GapEngineFakeClient();
    const dispatcher = createJobDispatcher({ client: client.asSupabase() });

    await dispatcher(makeGapJob());

    expect(client.inserts.some((insert) => insert.table === "gaps")).toBe(true);
    expect(client.updates.at(-1)).toMatchObject({ table: "agent_runs", values: { status: "completed" } });
  });
});

function makeGapJob(): AgentJob {
  return {
    id: "gap-job-1",
    account_id: "account-1",
    kind: "gap_engine",
    payload: {},
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

class GapEngineFakeClient {
  public inserts: Array<{ table: string; value: Record<string, unknown> | Array<Record<string, unknown>> }> = [];
  public updates: Array<{ table: string; values: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
  public selects: Array<{ table: string; filters: Array<[string, unknown]> }> = [];

  asSupabase(): never {
    return this as never;
  }

  from(table: string): GapEngineFakeQuery {
    return new GapEngineFakeQuery(this, table);
  }

  selectMany(table: string): Array<Record<string, unknown>> {
    if (table === "companies") {
      return [{ id: "competitor-1", name: "RivalCo", website_url: "https://rival.example" }];
    }
    if (table === "canvas_section_versions") {
      return [
        {
          id: "own-value",
          competitor_id: null,
          section_key: "value_propositions",
          confidence: 0.8,
          created_at: "2026-07-03T10:00:00Z",
          items: [{ text: "Self-serve analytics dashboards", confidence: 0.8, evidence_ids: ["evidence-own"] }],
        },
        {
          id: "rival-value",
          competitor_id: "competitor-1",
          section_key: "value_propositions",
          confidence: 0.9,
          created_at: "2026-07-03T11:00:00Z",
          items: [{ text: "Managed onboarding with implementation services", confidence: 0.9, evidence_ids: ["evidence-rival"] }],
        },
        {
          id: "rival-revenue",
          competitor_id: "competitor-1",
          section_key: "revenue_streams",
          confidence: 0.85,
          created_at: "2026-07-03T11:00:00Z",
          items: [{ text: "Annual enterprise contracts with onboarding fees", confidence: 0.85, evidence_ids: ["evidence-pricing"] }],
        },
      ];
    }
    return [];
  }
}

class GapEngineFakeQuery {
  private readonly filters: Array<[string, unknown]> = [];
  private insertValue: Record<string, unknown> | Array<Record<string, unknown>> | null = null;
  private updateValue: Record<string, unknown> | null = null;

  constructor(
    private readonly client: GapEngineFakeClient,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }

  insert(value: Record<string, unknown> | Array<Record<string, unknown>>): this {
    this.insertValue = value;
    this.client.inserts.push({ table: this.table, value });
    return this;
  }

  update(value: Record<string, unknown>): this {
    this.updateValue = value;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  order(): this {
    return this;
  }

  then(resolve: (value: { data?: Array<Record<string, unknown>>; error: null }) => void): void {
    if (this.updateValue) {
      this.client.updates.push({ table: this.table, values: this.updateValue, filters: [...this.filters] });
      resolve({ error: null });
      return;
    }
    this.client.selects.push({ table: this.table, filters: [...this.filters] });
    resolve({ data: this.client.selectMany(this.table), error: null });
  }
}

