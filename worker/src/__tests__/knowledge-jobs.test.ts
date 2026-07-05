import { describe, expect, it } from "vitest";
import type { AgentRunRequest, AgentRunResult, AgentRunner } from "../agent/runner.js";
import { computeGroundedness, extractClaimLines, KnowledgeJobHandler } from "../jobs/knowledge-jobs.js";
import type { AgentJob } from "../queue/types.js";

const ONBOARDING_RESPONSE = JSON.stringify({
  sections: [{
    section_key: "value_propositions",
    items: [{
      text: "AI strategy workspace for seed-stage companies",
      confidence: 0.99,
      evidence_excerpt: "We sell an AI strategy workspace to seed-stage founders.",
      grounded: true,
    }],
  }],
  dossiers: [
    {
      agent_key: "agent_value_propositions",
      doc_key: "positioning_narrative",
      title: "Positioning Narrative",
      body_md: "Owner says the product is an AI strategy workspace.",
      material_change: true,
    },
    {
      agent_key: "agent_value_propositions",
      doc_key: "atlas_summary",
      title: "Should be rejected",
      body_md: "Onboarding must never write the contract doc.",
    },
  ],
  owner_questions: [{
    agent_key: "agent_value_propositions",
    question: "Which customer segment is paying today?",
    why_needed: "Positioning depends on the real buyer.",
    doc_key: "positioning_narrative",
  }],
});

/** Routes responses by prompt kind so verifier calls get verifier JSON. */
class RoutingRunner implements AgentRunner {
  public calls: string[] = [];
  constructor(private readonly responses: {
    main?: string | string[];
    verify?: string;
  }) {}

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const isVerify = request.prompt.startsWith("Classify the claim");
    this.calls.push(isVerify ? "verify" : "main");
    let resultText: string;
    if (isVerify) {
      resultText = this.responses.verify ?? JSON.stringify({ status: "confirmed", reason: "matches excerpt" });
    } else if (Array.isArray(this.responses.main)) {
      const mains = this.calls.filter((kind) => kind === "main").length - 1;
      resultText = this.responses.main[Math.min(mains, this.responses.main.length - 1)] ?? "";
    } else {
      resultText = this.responses.main ?? "";
    }
    return { resultText, sessionId: "session-1", costUsd: 0.01, tokensIn: 10, tokensOut: 20 };
  }
}

describe("computeGroundedness", () => {
  it("pins exact score values and both boundary conditions", () => {
    expect(computeGroundedness([])).toEqual({
      score: 0,
      inputs: { formula: "groundedness_v1", grounded: 0, total: 0 },
    });
    expect(computeGroundedness([
      { grounded: true, evidence_ids: ["e1"] },
      { grounded: true, evidence_ids: ["e2"] },
      { grounded: false, evidence_ids: ["e3"] },
    ])).toEqual({
      score: 0.6667,
      inputs: { formula: "groundedness_v1", grounded: 2, total: 3 },
    });
    // grounded flag without evidence must NOT count (second formula condition)
    expect(computeGroundedness([
      { grounded: true, evidence_ids: [] },
      { grounded: true, evidence_ids: ["e1"] },
    ])).toEqual({
      score: 0.5,
      inputs: { formula: "groundedness_v1", grounded: 1, total: 2 },
    });
  });
});

describe("extractClaimLines", () => {
  it("pulls bullet and numbered claims, dedupes, skips short lines", () => {
    const body = "# Title\n- Competitor launched usage-based pricing this quarter\n- short\n1. Hiring shifted toward enterprise sales in Q2 postings\n- Competitor launched usage-based pricing this quarter\nplain prose line that is long enough but not a bullet";
    expect(extractClaimLines(body)).toEqual([
      "Competitor launched usage-based pricing this quarter",
      "Hiring shifted toward enterprise sales in Q2 postings",
    ]);
  });
});

describe("KnowledgeJobHandler", () => {
  it("onboarding_extract verifies owner claims, caps confidence, and writes provenance", async () => {
    const client = new FakeClient();
    const runner = new RoutingRunner({ main: ONBOARDING_RESPONSE });
    const handler = new KnowledgeJobHandler({ client: client.asSupabase(), runner });

    await handler.handleOnboardingExtract(makeJob());

    // the verifier ran (RF-5A-2)
    expect(runner.calls).toContain("verify");

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
      confidence: 0.95, // 0.99 capped (RF-5A-7 coverage of the 0.95 cap)
      evidence_ids: ["evidence-1"],
      provenance: "owner_provided",
      grounded: true,
      verification_status: "confirmed",
      flags: [],
    }]);

    // provenance on the CURRENT dossier row matches the revision (RF-5A-4)
    const dossierUpsert = client.upserts.find((upsert) => upsert.table === "agent_documents");
    expect(dossierUpsert?.values).toMatchObject({
      doc_key: "positioning_narrative",
      claim_sources: { default: "owner_provided" },
    });
    // atlas_summary doc_key from the model is rejected (RF-5A-8)
    expect(client.upserts.filter((upsert) => upsert.values.doc_key === "atlas_summary")).toHaveLength(0);

    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values).toMatchObject({
      status: "completed",
    });
  });

  it("onboarding_extract caps unsupported claims at 0.5 and drops grounded flag", async () => {
    const client = new FakeClient();
    const runner = new RoutingRunner({
      main: ONBOARDING_RESPONSE,
      verify: JSON.stringify({ status: "unsupported", reason: "excerpt does not state this" }),
    });
    const handler = new KnowledgeJobHandler({ client: client.asSupabase(), runner });

    await handler.handleOnboardingExtract(makeJob());

    const canvasInsert = client.inserts.find((insert) => insert.table === "canvas_section_versions");
    expect(canvasInsert?.values.items).toEqual([expect.objectContaining({
      confidence: 0.5,
      grounded: false,
      verification_status: "unsupported",
      flags: ["unsupported"],
    })]);
    expect(canvasInsert?.values).toMatchObject({ groundedness_score: 0 });
  });

  it("onboarding_extract marks the founder document failed on error (RF-5A-5)", async () => {
    const client = new FakeClient();
    const runner = new RoutingRunner({ main: "not json at all" });
    // Unparseable extraction yields no sections/dossiers/questions — that's a
    // completed-but-empty run, so force a later failure instead via missing route.
    client.overrides.model_routes = [];
    const handler = new KnowledgeJobHandler({ client: client.asSupabase(), runner });

    await expect(handler.handleOnboardingExtract(makeJob())).rejects.toThrow(/No model route/);

    const statusUpdates = client.updates.filter((update) => update.table === "founder_documents");
    expect(statusUpdates.at(-1)?.values).toMatchObject({ status: "failed" });
    expect(statusUpdates.at(-1)?.values.error).toMatch(/No model route/);
  });

  it("summary_update hard-fails when both budget and escalated output are unparseable (RF-5A-1)", async () => {
    const client = new FakeClient();
    const runner = new RoutingRunner({ main: ["definitely not json", "still not json"] });
    const handler = new KnowledgeJobHandler({ client: client.asSupabase(), runner });

    await expect(handler.handleSummaryUpdate(makeJob({ kind: "summary_update", payload: { agent_profile_id: "agent-vp" } })))
      .rejects.toThrow(/refusing to overwrite atlas_summary/);

    // nothing was written — the standing summary is untouched
    expect(client.upserts.filter((upsert) => upsert.table === "agent_documents")).toHaveLength(0);
    // both tiers were attempted (budget then escalated)
    expect(runner.calls.filter((kind) => kind === "main")).toHaveLength(2);
  });

  it("summary_update escalates budget->mid and writes on the second attempt", async () => {
    const client = new FakeClient();
    const runner = new RoutingRunner({
      main: [
        "garbled budget output",
        JSON.stringify({ title: "Atlas Summary", body_md: "## Position\n- grounded bullet", material_change: true }),
      ],
    });
    const handler = new KnowledgeJobHandler({ client: client.asSupabase(), runner });

    await handler.handleSummaryUpdate(makeJob({ kind: "summary_update", payload: { agent_profile_id: "agent-vp" } }));

    const upsert = client.upserts.find((entry) => entry.table === "agent_documents");
    expect(upsert?.values).toMatchObject({ doc_key: "atlas_summary", body_md: "## Position\n- grounded bullet" });
  });


  it("grounding_suggest writes only verifier-confirmed candidates (spec 08 §3a)", async () => {
    const client = new FakeClient();
    const runner = new RoutingRunner({
      main: JSON.stringify({
        suggestions: [
          { item_index: 0, suggested_text: "AWS and Snowflake", rationale: "Named in the stack excerpt", evidence_index: 0 },
        ],
      }),
      verify: JSON.stringify({ status: "confirmed", reason: "excerpt names AWS and Snowflake" }),
    });
    const handler = new KnowledgeJobHandler({ client: client.asSupabase(), runner });

    await handler.handleGroundingSuggest(makeJob({ kind: "grounding_suggest", payload: {} }));

    const upsert = client.upserts.find((entry) => entry.table === "grounding_suggestions");
    expect(upsert?.values).toMatchObject({
      account_id: "account-1",
      section_key: "key_resources",
      item_text: "Cloud infrastructure providers",
      suggested_text: "AWS and Snowflake",
      evidence_id: "11111111-1111-4111-8111-111111111111",
      status: "open",
    });
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values).toMatchObject({
      status: "completed",
      output: expect.objectContaining({ suggested: 1, rejected_by_verifier: 0 }),
    });
  });

  it("grounding_suggest drops candidates the verifier refutes", async () => {
    const client = new FakeClient();
    const runner = new RoutingRunner({
      main: JSON.stringify({
        suggestions: [
          { item_index: 0, suggested_text: "Google Cloud Platform", evidence_index: 0 },
        ],
      }),
      verify: JSON.stringify({ status: "unsupported", reason: "excerpt names AWS, not GCP" }),
    });
    const handler = new KnowledgeJobHandler({ client: client.asSupabase(), runner });

    await handler.handleGroundingSuggest(makeJob({ kind: "grounding_suggest", payload: {} }));

    expect(client.upserts.filter((entry) => entry.table === "grounding_suggestions")).toHaveLength(0);
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values).toMatchObject({
      status: "completed",
      output: expect.objectContaining({ suggested: 0, rejected_by_verifier: 1 }),
    });
  });

  it("dossier_refresh skips without new evidence and never calls the LLM", async () => {
    const client = new FakeClient();
    client.overrides.watched_sources = [];
    client.overrides.agent_documents = { id: "doc-a", version: 3, body_md: "- old claim line", evidence_ids: [] };
    const runner = new RoutingRunner({ main: "should never be called" });
    const handler = new KnowledgeJobHandler({ client: client.asSupabase(), runner });

    await handler.handleDossierRefresh(makeJob({
      kind: "dossier_refresh",
      payload: { agent_profile_id: "agent-vp", doc_key: "positioning_narrative" },
    }));

    expect(runner.calls).toHaveLength(0);
    expect(client.upserts).toHaveLength(0);
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values).toMatchObject({
      status: "completed",
    });
  });

  it("dossier_refresh hard-fails when the spot-check finds a contradicted claim (RF-5A-2)", async () => {
    const client = new FakeClient();
    client.overrides.watched_sources = [{ id: "ws-1", kind: "url", target: "https://rival.example/pricing", label: "Rival pricing" }];
    client.overrides.agent_documents = { id: "doc-a", version: 3, body_md: "- old claim line", evidence_ids: [] };
    const runner = new RoutingRunner({
      main: JSON.stringify({ title: "Doc", body_md: "- Rival cut enterprise prices by forty percent this week", material_change: true }),
      verify: JSON.stringify({ status: "contradicted", reason: "the excerpt says prices increased" }),
    });
    const handler = new KnowledgeJobHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: {
        async refresh() {
          return {
            health: "ok",
            payload: {},
            evidence: [{ title: "Rival pricing page", excerpt: "Rival increased enterprise prices.", sourceType: "website" }],
            metrics: [],
          };
        },
      } as never,
    });

    await expect(handler.handleDossierRefresh(makeJob({
      kind: "dossier_refresh",
      payload: { agent_profile_id: "agent-vp", doc_key: "positioning_narrative" },
    }))).rejects.toThrow(/contradicted claim/);

    expect(client.upserts).toHaveLength(0);
  });

  it("dossier_refresh material change cascades: insight posted + summary_update enqueued (RF-5A-3)", async () => {
    const client = new FakeClient();
    client.overrides.watched_sources = [{ id: "ws-1", kind: "url", target: "https://rival.example", label: "Rival" }];
    client.overrides.agent_documents = { id: "doc-a", version: 3, body_md: "- old claim line", evidence_ids: [] };
    const runner = new RoutingRunner({
      main: JSON.stringify({ title: "Doc", body_md: "- Rival pivoted to usage-based pricing across all tiers", material_change: true }),
      verify: JSON.stringify({ status: "confirmed", reason: "excerpt states the pivot" }),
    });
    const handler = new KnowledgeJobHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: {
        async refresh() {
          return {
            health: "ok",
            payload: {},
            evidence: [{ title: "Rival pricing", excerpt: "Rival pivoted to usage-based pricing across all tiers.", sourceType: "website" }],
            metrics: [],
          };
        },
      } as never,
    });

    await handler.handleDossierRefresh(makeJob({
      kind: "dossier_refresh",
      payload: { agent_profile_id: "agent-vp", doc_key: "positioning_narrative" },
    }));

    expect(client.inserts.find((insert) => insert.table === "insights")?.values).toMatchObject({
      account_id: "account-1",
      severity: "notable",
      tags: ["dossier", "material_change"],
    });
    expect(client.inserts.find((insert) => insert.table === "agent_jobs")?.values).toMatchObject({
      kind: "summary_update",
      status: "queued",
    });
    const upsert = client.upserts.find((entry) => entry.table === "agent_documents");
    expect(upsert?.values.claim_sources).toMatchObject({
      default: "researched",
      spot_check: { checked: 1, confirmed: 1, unsupported: 0 },
    });
  });
});

function makeJob(over: Partial<AgentJob> = {}): AgentJob {
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
    ...over,
  };
}

const DEFAULT_ROUTES = [
  { account_id: null, route_key: "onboarding_extract", task_class: "onboarding_extract", provider: "anthropic", model_name: "claude-sonnet-5", params: {}, cost_per_1k_in: 0.002, cost_per_1k_out: 0.01 },
  { account_id: null, route_key: "research_verify", task_class: "research_verify", provider: "anthropic", model_name: "claude-sonnet-5", params: {}, cost_per_1k_in: 0.002, cost_per_1k_out: 0.01 },
  { account_id: null, route_key: "dossier_refresh", task_class: "dossier_refresh", provider: "anthropic", model_name: "claude-sonnet-5", params: {}, cost_per_1k_in: 0.002, cost_per_1k_out: 0.01 },
  { account_id: null, route_key: "summary_update", task_class: "summary_update", provider: "anthropic", model_name: "claude-haiku-4-5-20251001", params: {}, cost_per_1k_in: 0.001, cost_per_1k_out: 0.005 },
  { account_id: null, route_key: "summary_update_escalated", task_class: "summary_update_escalated", provider: "anthropic", model_name: "claude-sonnet-5", params: {}, cost_per_1k_in: 0.002, cost_per_1k_out: 0.01 },
  { account_id: null, route_key: "grounding_suggest", task_class: "grounding_suggest", provider: "anthropic", model_name: "claude-haiku-4-5-20251001", params: {}, cost_per_1k_in: 0.001, cost_per_1k_out: 0.005 },
];

class FakeClient {
  public inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  public upserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  public updates: Array<{ table: string; values: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
  public overrides: Record<string, unknown> = {};

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

  is(column: string, value: unknown): this {
    this.filters.push([`is:${column}`, value]);
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    this.filters.push([`not:${column}:${operator}`, value]);
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push([`neq:${column}`, value]);
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
    if (this.operation === "upsert") this.client.upserts.push({ table: this.table, values: this.values });
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
    if (this.table in this.client.overrides) return this.client.overrides[this.table];
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
    if (this.table === "model_routes") return DEFAULT_ROUTES;
    if (this.table === "business_context_versions") return { id: "context-1" };
    if (this.table === "agent_profiles") {
      return [
        { id: "agent-vp", agent_key: "agent_value_propositions", display_name: "Forge" },
      ];
    }
    if (this.table === "evidence_items") {
      return [
        { id: "11111111-1111-4111-8111-111111111111", excerpt: "Our stack runs on AWS and Snowflake for warehousing." },
      ];
    }
    if (this.table === "canvas_section_versions") {
      return [{
        section_key: "key_resources",
        created_at: "2026-07-04T10:00:00Z",
        items: [
          { text: "Cloud infrastructure providers", confidence: 0.6, evidence_ids: [], grounded: false },
          { text: "AI strategy workspace for seed-stage companies", confidence: 0.95, evidence_ids: ["e"], grounded: true },
        ],
      }];
    }
    if (this.table === "agent_documents") return null;
    if (this.table === "watched_sources") return [];
    return null;
  }
}
