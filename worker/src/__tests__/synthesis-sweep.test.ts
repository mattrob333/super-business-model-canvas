import { describe, expect, it } from "vitest";
import type { AgentRunRequest, AgentRunResult, AgentRunner } from "../agent/runner.js";
import type { AgentJob } from "../queue/types.js";
import { SynthesisSweepHandler, parseSweepResult } from "../jobs/synthesis-sweep.js";

function job(payload: Record<string, unknown> = {}): AgentJob {
  return {
    id: "job-sweep-1",
    account_id: "account-1",
    agent_run_id: "run-sweep-1",
    kind: "synthesis_sweep",
    payload,
    status: "running",
    attempts: 1,
    max_attempts: 2,
    parent_run_id: null,
    cascade_run_id: null,
    claimed_by: "worker-a",
    locked_at: null,
    heartbeat_at: null,
    run_after: "2026-07-13T00:00:00Z",
    last_error: null,
    created_at: "2026-07-13T00:00:00Z",
  };
}

function variable(path: string, value: unknown, source = "scraped"): Record<string, unknown> {
  return {
    id: `var-${path}`,
    account_id: "account-1",
    path,
    value,
    confidence: "medium",
    source,
    source_artifact: null,
    staleness_policy: null,
    created_at: "2026-07-13T00:00:00Z",
    updated_at: "2026-07-13T00:00:00Z",
  };
}

class ScriptedRunner implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];
  constructor(private readonly reply: string) {}
  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    this.requests.push(request);
    return { resultText: this.reply, sessionId: "s", costUsd: 0.01, tokensIn: 10, tokensOut: 10 };
  }
}

class SweepFakeClient {
  readonly tables: Record<string, Record<string, unknown>[]> = {
    brain_variables: [],
    workspace_messages: [],
    agent_runs: [{ id: "run-sweep-1", account_id: "account-1" }],
    model_routes: [{
      account_id: null,
      route_key: "workflow_run",
      task_class: "workflow_run",
      provider: "anthropic",
      model_name: "scripted-model",
      cost_per_1k_in: 0.002,
      cost_per_1k_out: 0.01,
    }],
  };
  readonly rpcWrites: Array<Record<string, unknown>> = [];
  private ids = 0;

  from(table: string) {
    return new SweepFakeQuery(this, table);
  }

  async rpc(name: string, params: Record<string, unknown>) {
    if (name !== "write_brain_variables") throw new Error(`Unexpected RPC ${name}`);
    for (const write of params.p_writes as Array<Record<string, unknown>>) {
      this.rpcWrites.push({ ...write, source: params.p_source });
    }
    return { data: { variables: [], contradictions: [], history: [] }, error: null };
  }

  nextId(table: string): string {
    this.ids += 1;
    return `${table}-${this.ids}`;
  }

  asSupabase(): never { return this as never; }
}

class SweepFakeQuery {
  private filters: Array<{ column: string; value: unknown }> = [];
  private inserted: Record<string, unknown> | null = null;
  private updated: Record<string, unknown> | null = null;

  constructor(private client: SweepFakeClient, private table: string) {}
  select(): this { return this; }
  order(): this { return this; }
  or(): this { return this; }
  limit(): this { return this; }
  like(): this { return this; }
  in(): this { return this; }
  eq(column: string, value: unknown): this { this.filters.push({ column, value }); return this; }
  insert(values: Record<string, unknown>): this { this.inserted = values; return this; }
  update(values: Record<string, unknown>): this { this.updated = values; return this; }

  async single() { return { data: this.apply()[0] ?? null, error: null }; }
  async maybeSingle() { return { data: this.apply()[0] ?? null, error: null }; }

  then<T1, T2 = never>(
    onfulfilled?: ((value: { data: Record<string, unknown>[]; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({ data: this.apply(), error: null }).then(onfulfilled, onrejected);
  }

  private apply(): Record<string, unknown>[] {
    if (this.inserted) {
      const row = { id: this.client.nextId(this.table), ...this.inserted };
      (this.client.tables[this.table] ??= []).push(row);
      this.inserted = null;
      return [row];
    }
    if (this.updated) {
      const rows = this.rows();
      for (const row of rows) Object.assign(row, this.updated);
      this.updated = null;
      return rows;
    }
    return this.rows();
  }

  private rows(): Record<string, unknown>[] {
    let rows = [...(this.client.tables[this.table] ?? [])];
    for (const filter of this.filters) rows = rows.filter((row) => row[filter.column] === filter.value);
    return rows;
  }
}

const FOUR_VARIABLES = [
  variable("canvas.key_resources", [{ text: "Calibrated Revit data set", confidence: 0.8 }]),
  variable("canvas.revenue_streams", [{ text: "$99/mo subscription", confidence: 0.7 }]),
  variable("positioning.statement", "For estimators who need speed…", "workflow:positioning-sprint@v1.0#s6"),
  variable("intel.competitor_gaps", [{ text: "Rivals reject photographed plans" }]),
];

const VERDICT = JSON.stringify({
  contradictions: [
    { paths: ["canvas.revenue_streams", "positioning.statement"], summary: "Pricing says $99 but positioning implies free." },
  ],
  synergies: [
    { paths: ["canvas.key_resources", "intel.competitor_gaps"], insight: "The Revit data set closes the exact gap rivals leave." },
  ],
});

describe("SynthesisSweepHandler", () => {
  it("writes contradiction.sweep.* and synergy.* records keyed on the sorted pair and emits findings", async () => {
    const client = new SweepFakeClient();
    client.tables.brain_variables = [...FOUR_VARIABLES];
    const handler = new SynthesisSweepHandler({ client: client.asSupabase(), runner: new ScriptedRunner(VERDICT) });

    await handler.handle(job({ thread_id: "thread-9" }));

    const paths = client.rpcWrites.map((write) => write.path);
    expect(paths).toContain("contradiction.sweep.canvas.revenue_streams+positioning.statement");
    expect(paths).toContain("synergy.canvas.key_resources+intel.competitor_gaps");
    expect(client.rpcWrites.every((write) => write.source === "workflow:synthesis-sweep@v1.0#s1")).toBe(true);

    const messages = client.tables.workspace_messages;
    expect(messages).toHaveLength(1);
    const content = messages[0].content as { messages: Array<Record<string, unknown>> };
    const rendered = JSON.stringify(content.messages);
    expect(rendered).toContain("ContradictionAlert");
    expect(rendered).toContain("VariableCard");

    expect(client.tables.agent_runs[0]).toMatchObject({ status: "completed" });
  });

  it("skips the model entirely on a thin brain and completes honestly", async () => {
    const client = new SweepFakeClient();
    client.tables.brain_variables = FOUR_VARIABLES.slice(0, 2);
    const runner = new ScriptedRunner(VERDICT);
    await new SynthesisSweepHandler({ client: client.asSupabase(), runner }).handle(job());

    expect(runner.requests).toHaveLength(0);
    expect(client.rpcWrites).toHaveLength(0);
    expect(client.tables.agent_runs[0]).toMatchObject({ status: "completed", summary: "Brain too thin to synthesize yet." });
  });

  it("never sweeps its own outputs and fails visibly on an invalid verdict", async () => {
    const client = new SweepFakeClient();
    client.tables.brain_variables = [
      ...FOUR_VARIABLES.slice(0, 3),
      variable("synergy.a+b", { insight: "old" }),
      variable("contradiction.sweep.x+y", { summary: "old" }),
    ];
    // 3 source variables < 4 minimum: prior sweep records must not count.
    const runner = new ScriptedRunner("not json at all");
    await new SynthesisSweepHandler({ client: client.asSupabase(), runner }).handle(job());
    expect(runner.requests).toHaveLength(0);

    client.tables.brain_variables = [...FOUR_VARIABLES];
    await expect(
      new SynthesisSweepHandler({ client: client.asSupabase(), runner: new ScriptedRunner("not json at all") }).handle(job()),
    ).rejects.toThrow("no valid JSON verdict");
  });
});

describe("parseSweepResult", () => {
  const known = new Set(["a.one", "b.two", "c.three"]);

  it("drops findings citing unknown or duplicate paths and caps at three per kind", () => {
    const parsed = parseSweepResult(
      JSON.stringify({
        contradictions: [
          { paths: ["a.one", "hallucinated.path"], summary: "bad" },
          { paths: ["a.one", "a.one"], summary: "duplicate" },
          { paths: ["a.one", "b.two"], summary: "real" },
        ],
        synergies: [
          { paths: ["a.one", "b.two"], insight: "s1" },
          { paths: ["a.one", "c.three"], insight: "s2" },
          { paths: ["b.two", "c.three"], insight: "s3" },
          { paths: ["a.one", "b.two"], insight: "s4-over-cap" },
        ],
      }),
      known,
    );
    expect(parsed?.contradictions).toEqual([{ paths: ["a.one", "b.two"], text: "real" }]);
    expect(parsed?.synergies).toHaveLength(3);
  });

  it("accepts empty findings as the correct common case", () => {
    expect(parseSweepResult('{"contradictions":[],"synergies":[]}', known)).toEqual({ contradictions: [], synergies: [] });
  });
});
