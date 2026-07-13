import { describe, expect, it } from "vitest";
import type { AgentRunRequest, AgentRunResult, AgentRunner } from "../agent/runner.js";
import type { AgentJob } from "../queue/types.js";
import { WorkflowRunHandler, parseDualOutput } from "../jobs/workflow-run.js";

class SchemaScriptedRunner implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];
  constructor(private malformedFirst = false, private alwaysMalformed = false) {}

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    this.requests.push(request);
    if (this.alwaysMalformed || (this.malformedFirst && this.requests.length === 1)) {
      return result("Artifact before a malformed block\n```json\n{not-json}\n```");
    }
    const marker = "must satisfy this schema:\n";
    const schemaText = request.prompt.slice(request.prompt.lastIndexOf(marker) + marker.length).split("\n\nVALIDATION RETRY:")[0];
    const schema = JSON.parse(schemaText) as JsonSchema;
    const variables = synthesize(schema) as Record<string, unknown>;
    return result(`# ARTIFACT-CALL-${this.requests.length}\nUseful human-readable output.\n\nVARIABLES:\n\`\`\`json\n${JSON.stringify(variables)}\n\`\`\``);
  }
}

type JsonSchema = {
  type?: string;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
};

function synthesize(schema: JsonSchema): unknown {
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === "object") {
    return Object.fromEntries((schema.required ?? Object.keys(schema.properties ?? {})).map((key) => [
      key,
      synthesize(schema.properties?.[key] ?? {}),
    ]));
  }
  if (schema.type === "array") return schema.items ? [synthesize(schema.items)] : [];
  if (schema.type === "string") return "generated";
  if (schema.type === "number" || schema.type === "integer") return 1;
  if (schema.type === "boolean") return true;
  return {};
}

function result(resultText: string): AgentRunResult {
  return { resultText, sessionId: "scripted", costUsd: 0.01, tokensIn: 10, tokensOut: 20 };
}

function workflowJob(workflowId: string): AgentJob {
  return {
    id: `job-${workflowId}`,
    account_id: "account-1",
    agent_run_id: `agent-${workflowId}`,
    kind: "workflow_run",
    payload: { workflow_id: workflowId },
    status: "queued",
    attempts: 0,
    max_attempts: 2,
    parent_run_id: null,
    cascade_run_id: null,
    claimed_by: null,
    locked_at: null,
    heartbeat_at: null,
    run_after: "2026-07-12T00:00:00Z",
    last_error: null,
    created_at: "2026-07-12T00:00:00Z",
  };
}

class WorkflowFakeClient {
  readonly tables: Record<string, Record<string, unknown>[]>;
  readonly rpcWrites: Array<Record<string, unknown>> = [];
  failMessageInserts = false;
  private ids = 0;

  constructor() {
    const brain = [
      variable("canvas.customer_segments", [{ text: "Founder-led SaaS teams", confidence: "high" }]),
      variable("canvas.value_propositions", [{ text: "Turns strategy into an operating plan", confidence: "high" }]),
      variable("canvas.revenue_streams", [{ text: "Annual subscription", confidence: "medium" }]),
      variable("canvas.channels", [{ text: "Founder-led sales", confidence: "medium" }]),
    ];
    this.tables = {
      business_context_versions: [{
        id: "context-1",
        account_id: "account-1",
        company_name: "Acme Strategy",
        website: "https://acme.example",
        created_at: "2026-07-12T00:00:00Z",
      }],
      brain_variables: brain,
      model_routes: [{
        account_id: null,
        route_key: "workflow_run",
        task_class: "workflow_run",
        provider: "anthropic",
        model_name: "scripted-model",
        params: {},
        cost_per_1k_in: 0.002,
        cost_per_1k_out: 0.01,
      }],
      workflow_runs: [],
      workflow_artifacts: [],
      agent_runs: [
        { id: "agent-positioning-sprint", account_id: "account-1" },
        { id: "agent-hormozi-brain-os", account_id: "account-1" },
      ],
    };
  }

  from(table: string): WorkflowFakeQuery {
    return new WorkflowFakeQuery(this, table);
  }

  async rpc(name: string, params: Record<string, unknown>): Promise<{ data: unknown; error: null }> {
    if (name !== "write_brain_variables") throw new Error(`Unexpected RPC ${name}`);
    const writes = params.p_writes as Array<Record<string, unknown>>;
    for (const write of writes) {
      this.rpcWrites.push(write);
      const row = variable(String(write.path), write.value);
      const index = this.tables.brain_variables.findIndex((entry) => entry.path === write.path);
      if (index >= 0) this.tables.brain_variables[index] = row;
      else this.tables.brain_variables.push(row);
    }
    return { data: { variables: [], contradictions: [], history: [] }, error: null };
  }

  nextId(table: string): string {
    this.ids += 1;
    return `${table}-${this.ids}`;
  }

  asSupabase(): never { return this as never; }
}

class WorkflowFakeQuery {
  private filters: Array<{ column: string; value: unknown }> = [];
  private inFilters: Array<{ column: string; values: unknown[] }> = [];
  private likeFilters: Array<{ column: string; prefix: string }> = [];
  private limitCount: number | null = null;
  private inserted: Record<string, unknown> | null = null;
  private updated: Record<string, unknown> | null = null;

  constructor(private client: WorkflowFakeClient, private table: string) {}
  select(): this { return this; }
  order(): this { return this; }
  or(): this { return this; }
  limit(count: number): this { this.limitCount = count; return this; }
  eq(column: string, value: unknown): this { this.filters.push({ column, value }); return this; }
  in(column: string, values: unknown[]): this { this.inFilters.push({ column, values }); return this; }
  like(column: string, pattern: string): this {
    this.likeFilters.push({ column, prefix: pattern.replace(/%$/, "") });
    return this;
  }
  insert(values: Record<string, unknown>): this { this.inserted = values; return this; }
  update(values: Record<string, unknown>): this { this.updated = values; return this; }

  async single(): Promise<{ data: Record<string, unknown> | null; error: null }> {
    if (this.inserted) return { data: this.applyInsert(), error: null };
    return { data: this.rows()[0] ?? null, error: null };
  }

  async maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: null }> {
    return { data: this.rows()[0] ?? null, error: null };
  }

  then<TResult1 = { data: Record<string, unknown>[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Record<string, unknown>[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    if (this.updated) this.applyUpdate();
    else if (this.inserted) this.applyInsert();
    return Promise.resolve({ data: this.rows(), error: null }).then(onfulfilled, onrejected);
  }

  private rows(): Record<string, unknown>[] {
    let rows = [...(this.client.tables[this.table] ?? [])];
    for (const filter of this.filters) rows = rows.filter((row) => row[filter.column] === filter.value);
    for (const filter of this.inFilters) rows = rows.filter((row) => filter.values.includes(row[filter.column]));
    for (const filter of this.likeFilters) rows = rows.filter((row) => String(row[filter.column] ?? "").startsWith(filter.prefix));
    return this.limitCount === null ? rows : rows.slice(0, this.limitCount);
  }

  private applyInsert(): Record<string, unknown> {
    if (this.table === "workspace_messages" && this.client.failMessageInserts) {
      this.inserted = null;
      throw new Error("workspace_messages insert refused (scripted)");
    }
    const row = { id: this.client.nextId(this.table), ...this.inserted };
    this.client.tables[this.table] ??= [];
    this.client.tables[this.table].push(row);
    this.inserted = null;
    return row;
  }

  private applyUpdate(): void {
    for (const row of this.rows()) Object.assign(row, this.updated);
    this.updated = null;
  }
}

function variable(path: string, value: unknown): Record<string, unknown> {
  return {
    id: `var-${path}`,
    account_id: "account-1",
    path,
    value,
    confidence: "medium",
    source: "user_stated",
    source_artifact: null,
    staleness_policy: null,
    created_at: "2026-07-12T00:00:00Z",
    updated_at: "2026-07-12T00:00:00Z",
  };
}

describe("workflow_run headless interpreter", () => {
  it.each([
    ["positioning-sprint", 6, true],
    ["hormozi-brain-os", 7, false],
  ] as const)("completes %s from the authored card", async (workflowId, stepCount, retryFirst) => {
    const client = new WorkflowFakeClient();
    const runner = new SchemaScriptedRunner(retryFirst);
    const handler = new WorkflowRunHandler({ client: client.asSupabase(), runner });

    await handler.handle(workflowJob(workflowId));

    expect(runner.requests).toHaveLength(stepCount + (retryFirst ? 1 : 0));
    expect(client.tables.workflow_runs.at(-1)).toMatchObject({ status: "completed", current_step: null });
    expect(client.tables.workflow_artifacts).toHaveLength(1);
    expect(client.tables.workflow_artifacts[0].body_md).toContain(`workflow: ${workflowId}`);
    expect(client.tables.workflow_artifacts[0].body_md).toContain("# ARTIFACT-CALL-");
    expect(client.rpcWrites.length).toBeGreaterThanOrEqual(stepCount);
    expect(runner.requests[1].prompt).not.toContain("# ARTIFACT-CALL-1");
    if (retryFirst) expect(runner.requests[1].prompt).toContain("VALIDATION RETRY");
  });

  it("marks the durable run failed after the single validation retry", async () => {
    const client = new WorkflowFakeClient();
    const handler = new WorkflowRunHandler({ client: client.asSupabase(), runner: new SchemaScriptedRunner(false, true) });

    await expect(handler.handle(workflowJob("positioning-sprint"))).rejects.toThrow("failed visibly at step s1-alternatives");
    expect(client.tables.workflow_runs.at(-1)).toMatchObject({ status: "failed" });
  });

  it("emits a2ui rows at run start, every step boundary, and completion when a thread is given", async () => {
    const client = new WorkflowFakeClient();
    const handler = new WorkflowRunHandler({ client: client.asSupabase(), runner: new SchemaScriptedRunner() });
    const job = workflowJob("positioning-sprint");
    (job.payload as Record<string, unknown>).thread_id = "thread-1";

    await handler.handle(job);

    const rows = client.tables.workspace_messages ?? [];
    // 1 initial (createSurface + run card) + 6 step boundaries + 1 completion.
    expect(rows).toHaveLength(8);
    expect(rows.every((row) => row.kind === "a2ui" && row.thread_id === "thread-1")).toBe(true);
    const first = rows[0].content as { surface_id: string; messages: Array<Record<string, unknown>> };
    expect(first.messages[0]).toHaveProperty("createSurface");
    expect(JSON.stringify(first.messages)).toContain("WorkflowRunCard");
    const last = rows.at(-1)?.content as { messages: Array<Record<string, unknown>> };
    expect(JSON.stringify(last.messages)).toContain('"completed"');
    // Same surface across every row — the frontend folds them into one view.
    expect(new Set(rows.map((row) => (row.content as { surface_id: string }).surface_id)).size).toBe(1);
  });

  it("emits nothing without a thread and survives message-insert failures", async () => {
    const silent = new WorkflowFakeClient();
    await new WorkflowRunHandler({ client: silent.asSupabase(), runner: new SchemaScriptedRunner() })
      .handle(workflowJob("positioning-sprint"));
    expect(silent.tables.workspace_messages ?? []).toHaveLength(0);

    const refusing = new WorkflowFakeClient();
    refusing.failMessageInserts = true;
    const job = workflowJob("positioning-sprint");
    (job.payload as Record<string, unknown>).thread_id = "thread-1";
    await new WorkflowRunHandler({ client: refusing.asSupabase(), runner: new SchemaScriptedRunner() }).handle(job);
    expect(refusing.tables.workflow_runs.at(-1)).toMatchObject({ status: "completed" });
  });

  it("persists a step's declared contradictions[] block as a contradiction.* record", async () => {
    const client = new WorkflowFakeClient();
    const base = new SchemaScriptedRunner();
    const runner: AgentRunner = {
      async run(request) {
        const result = await base.run(request);
        if (base.requests.length !== 1) return result;
        const fenceStart = result.resultText.lastIndexOf("```json\n");
        const variables = JSON.parse(
          result.resultText.slice(fenceStart + "```json\n".length).replace(/```\s*$/, ""),
        ) as Record<string, unknown>;
        variables.contradictions = [{ claim: "canvas says $99", found: "$49", source_url: "https://example.com" }];
        return {
          ...result,
          resultText: `${result.resultText.slice(0, fenceStart)}\`\`\`json\n${JSON.stringify(variables)}\n\`\`\``,
        };
      },
    };
    const handler = new WorkflowRunHandler({ client: client.asSupabase(), runner });

    await handler.handle(workflowJob("positioning-sprint"));

    const contradictionWrite = client.rpcWrites.find((write) =>
      write.path === "contradiction.positioning-sprint.s1-alternatives");
    expect(contradictionWrite).toBeDefined();
    expect(contradictionWrite?.value).toEqual([
      { claim: "canvas says $99", found: "$49", source_url: "https://example.com" },
    ]);
    expect(client.rpcWrites.some((write) => write.path === "positioning.contradictions")).toBe(false);
  });
});

describe("parseDualOutput", () => {
  it("keeps markdown and parses only the final fenced JSON block", () => {
    const parsed = parseDualOutput("# Artifact\n```text\nexample\n```\nVARIABLES:\n```json\n{\"answer\":1}\n```");
    expect(parsed).toEqual({ ok: true, value: { artifactSection: "# Artifact\n```text\nexample\n```", variables: { answer: 1 } } });
  });
});
