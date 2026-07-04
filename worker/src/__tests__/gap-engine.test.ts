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
    // Exact-value determinism (RF-4-12): novelty(1.0) x confidence(0.9) x 100 = 90.
    expect(gapRows[0].score).toBe(90);
    expect(gapRows[0].severity).toBe("critical");
    expect(gapRows[1].score).toBe(85);
    expect(gapRows[0].score_inputs).toMatchObject({
      formula_version: "competitor_gap_v1",
      best_overlap: 0,
    });

    // Idempotency (RF-4-5): prior open competitive gaps for analyzed competitors superseded.
    const supersede = client.updates.find((update) => update.table === "gaps");
    expect(supersede?.values).toMatchObject({ status: "superseded" });
    expect(supersede?.filters).toEqual(expect.arrayContaining([
      ["account_id", "account-1"],
      ["gap_type", "competitive"],
      ["in:competitor_id", ["competitor-1"]],
      ["in:status", ["open", "acknowledged"]],
    ]));

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
        // Exact formula pin (RF-4-12): 100 x max(0.1, 2/9) x 1.25 = 27.78.
        value: 27.78,
        inputs: expect.objectContaining({
          competitor_id: "competitor-1",
          formula_version: "threat_index_v1",
          momentum_source: "placeholder_baseline_v1",
          gap_count: 2,
        }),
      }),
    ]));
    const sectionDelta = metricRows.find((row) => row.metric_key === "competitor.section_delta" && row.section_key === "value_propositions");
    expect(sectionDelta?.value).toBe(90);
    expect(client.updates.at(-1)).toMatchObject({
      table: "agent_runs",
      values: {
        status: "completed",
        output: expect.objectContaining({ competitors_analyzed: 1, gaps_created: 2 }),
      },
    });
  });

  it("suppresses competitor items the own canvas already covers (overlap boundary)", async () => {
    const client = new GapEngineFakeClient();
    client.ownValueItemText = "Managed onboarding with implementation services";
    const handler = new GapEngineHandler(client.asSupabase());

    await handler.handle(makeGapJob());

    const gapRows = client.inserts.find((insert) => insert.table === "gaps")?.value as Array<Record<string, unknown>>;
    // Identical value-prop text -> overlap 1.0 >= 0.58 -> suppressed; only the revenue gap remains.
    expect(gapRows).toHaveLength(1);
    expect(gapRows[0].affected_sections).toEqual(["revenue_streams"]);
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
  public ownValueItemText = "Self-serve analytics dashboards";

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
          items: [{ text: this.ownValueItemText, confidence: 0.8, evidence_ids: ["evidence-own"] }],
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

  in(column: string, values: unknown[]): this {
    this.filters.push([`in:${column}`, values]);
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

