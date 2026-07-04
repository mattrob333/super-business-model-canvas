import { describe, expect, it } from "vitest";
import type { AgentRunRequest, AgentRunResult, AgentRunner } from "../agent/runner.js";
import { computeGroundedness, KnowledgeJobHandler } from "../jobs/knowledge-jobs.js";
import type { AgentJob } from "../queue/types.js";

describe("computeGroundedness", () => {
  it("pins exact score values and empty boundary", () => {
    expect(computeGroundedness([])).toEqual({
      score: 0,
      inputs: { formula: "groundedness_v1", grounded: 0, total: 0 },
    });
    expect(computeGroundedness([
      { grounded: true, evidence_ids: ["e1"], provenance: "owner_provided" },
      { grounded: true, evidence_ids: ["e2"], provenance: "owner_provided" },
      { grounded: false, evidence_ids: ["e3"], provenance: "owner_provided" },
    ])).toEqual({
      score: 0.6667,
      inputs: { formula: "groundedness_v1", grounded: 2, total: 3 },
    });
  });
});

describe("KnowledgeJobHandler", () => {
  it("onboarding_extract writes owner-provided evidence and fresh canvas versions", async () => {
    const client = new FakeClient();
    const handler = new KnowledgeJobHandler({
      client: client.asSupabase(),
      runner: new FixtureRunner(JSON.stringify({
        sections: [{
          section_key: "value_propositions",
          items: [{
            text: "AI strategy workspace for seed-stage companies",
            confidence: 0.91,
            evidence_excerpt: "We sell an AI strategy workspace to seed-stage founders.",
            grounded: true,
          }],
        }],
        dossiers: [{
          agent_key: "agent_value_propositions",
          doc_key: "positioning_narrative",
          title: "Positioning Narrative",
          body_md: "Owner says the product is an AI strategy workspace.",
          material_change: true,
        }],
        owner_questions: [{
          agent_key: "agent_value_propositions",
          question: "Which customer segment is paying today?",
          why_needed: "Positioning depends on the real buyer.",
          doc_key: "positioning_narrative",
        }],
      })),
    });

    await handler.handleOnboardingExtract(makeJob());

    const canvasInsert = client.inserts.find((insert) => insert.table === "canvas_section_versions");
    expect(canvasInsert?.values).toMatchObject({
      account_id: "account-1",
      competitor_id: null,
      section_key: "value_propositions",
      freshness_status: "fresh",
      groundedness_score: 1,
    });
    expect(canvasInsert?.values).toHaveProperty("last_verified_at");
    expect(canvasInsert?.values.items).toEqual([{
      text: "AI strategy workspace for seed-stage companies",
      confidence: 0.91,
      evidence_ids: ["evidence-1"],
      provenance: "owner_provided",
      grounded: true,
    }]);

    expect(client.inserts.find((insert) => insert.table === "evidence_items")?.values).toMatchObject({
      account_id: "account-1",
      source_type: "document",
      metadata: { founder_document_id: "doc-1", provenance: "owner_provided" },
    });
    expect(client.inserts.find((insert) => insert.table === "owner_questions")?.values).toMatchObject({
      account_id: "account-1",
      status: "open",
      question: "Which customer segment is paying today?",
    });
    expect(client.upserts.find((upsert) => upsert.table === "agent_documents")?.values).toMatchObject({
      account_id: "account-1",
      doc_key: "positioning_narrative",
      freshness_status: "fresh",
      material_change: true,
    });
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values).toMatchObject({
      status: "completed",
    });
  });
});

class FixtureRunner implements AgentRunner {
  constructor(private readonly resultText: string) {}

  async run(_request: AgentRunRequest): Promise<AgentRunResult> {
    void _request;
    return {
      resultText: this.resultText,
      sessionId: "session-1",
      costUsd: 0.01,
      tokensIn: 10,
      tokensOut: 20,
    };
  }
}

function makeJob(): AgentJob {
  return {
    id: "job-1",
    account_id: "account-1",
    kind: "onboarding_extract",
    payload: { founder_document_id: "doc-1", text: "We sell an AI strategy workspace to seed-stage founders." },
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

class FakeClient {
  public inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  public upserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  public updates: Array<{ table: string; values: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];

  asSupabase(): never {
    return this as never;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null; count?: number }> {
  private operation: "select" | "insert" | "update" | "upsert" = "select";
  private values: Record<string, unknown> = {};
  private readonly filters: Array<[string, unknown]> = [];
  private countMode = false;

  constructor(private readonly client: FakeClient, private readonly table: string) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }): this {
    this.countMode = options?.count === "exact" && options.head === true;
    return this;
  }

  insert(values: Record<string, unknown>): this {
    this.operation = "insert";
    this.values = values;
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.operation = "update";
    this.values = values;
    return this;
  }

  upsert(values: Record<string, unknown>): this {
    this.operation = "upsert";
    this.values = values;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  or(_filter: string): this {
    void _filter;
    return this;
  }

  in(_column: string, _values: unknown[]): this {
    void _column;
    void _values;
    return this;
  }

  order(_column: string): this {
    void _column;
    return this;
  }

  limit(_count: number): this {
    void _count;
    return this;
  }

  maybeSingle(): Promise<{ data: unknown; error: null }> {
    return Promise.resolve({ data: this.resolveSelect(), error: null });
  }

  single(): Promise<{ data: unknown; error: null }> {
    if (this.operation === "insert") this.client.inserts.push({ table: this.table, values: this.values });
    if (this.operation === "upsert") this.client.upserts.push({ table: this.table, values: this.values });
    return Promise.resolve({ data: this.resolveWrite(), error: null });
  }

  then<TResult1 = { data: unknown; error: null; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    if (this.operation === "insert") this.client.inserts.push({ table: this.table, values: this.values });
    if (this.operation === "update") this.client.updates.push({ table: this.table, values: this.values, filters: this.filters });
    const response = this.countMode
      ? { data: null, error: null as null, count: 0 }
      : { data: this.resolveSelect(), error: null as null };
    return Promise.resolve(response).then(onfulfilled);
  }

  private resolveWrite(): Record<string, unknown> {
    if (this.table === "evidence_items") return { id: "evidence-1" };
    if (this.table === "agent_documents") return { id: "agent-document-1" };
    return { id: `${this.table}-1` };
  }

  private resolveSelect(): unknown {
    if (this.table === "founder_documents") {
      return {
        id: "doc-1",
        account_id: "account-1",
        title: "Seed Deck",
        file_name: "seed-deck.txt",
        storage_bucket: "founder-documents",
        storage_path: "account-1/doc-1.txt",
        content_type: "text/plain",
        extracted_text: null,
      };
    }
    if (this.table === "model_routes") {
      return [{
        account_id: null,
        route_key: "onboarding_extract",
        task_class: "onboarding_extract",
        provider: "anthropic",
        model_name: "claude-sonnet-5",
        params: {},
        cost_per_1k_in: 0.002,
        cost_per_1k_out: 0.01,
      }];
    }
    if (this.table === "business_context_versions") return { id: "context-1" };
    if (this.table === "agent_profiles") {
      return [
        { id: "agent-vp", agent_key: "agent_value_propositions", display_name: "Forge" },
      ];
    }
    if (this.table === "agent_documents") return null;
    return null;
  }
}
