import { describe, expect, it } from "vitest";
import type { AgentRunner } from "../agent/runner.js";
import { CompanyResearchHandler } from "../jobs/company-research.js";
import { createJobDispatcher } from "../jobs/dispatch.js";
import type { AgentJob } from "../queue/types.js";

describe("CompanyResearchHandler", () => {
  it("writes cited canvas items and logs contradicted claims as gaps", async () => {
    const client = new CompanyResearchFakeClient();
    const runner = new ScriptedRunner([
      JSON.stringify({
        claims: [
          { section_key: "value_propositions", text: "Acme offers analytics dashboards.", confidence: 0.82, evidence_index: 0 },
          { section_key: "revenue_streams", text: "Acme pricing starts at $9.", confidence: 0.9, evidence_index: 0 },
        ],
      }),
      JSON.stringify({ status: "confirmed", reason: "The excerpt names analytics dashboards." }),
      JSON.stringify({ status: "contradicted", reason: "The excerpt says $29, not $9." }),
    ]);
    const handler = new CompanyResearchHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: fixtureFeedRunner(),
    });

    await handler.handle(makeCompanyJob());

    const canvasInsert = client.inserts.find((insert) => insert.table === "canvas_section_versions");
    expect(canvasInsert?.value).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      section_key: "value_propositions",
    });
    const items = canvasInsert?.value.items as Array<{ evidence_ids: string[] }> | undefined;
    expect(items?.[0]?.evidence_ids).toEqual(["evidence-1"]);
    const citedRatio = (items ?? []).filter((item) => item.evidence_ids.length > 0).length / Math.max(1, items?.length ?? 0);
    expect(citedRatio).toBeGreaterThanOrEqual(0.8);
    expect(client.inserts.find((insert) => insert.table === "gaps")?.value).toMatchObject({
      account_id: "account-1",
      gap_type: "contradictory",
      affected_sections: ["revenue_streams"],
      evidence_ids: ["evidence-1"],
    });
    expect(runner.requests[1]?.systemPrompt).toContain("adversarial verifier");
  });

  it("caps unsupported claim confidence at 0.5", async () => {
    const client = new CompanyResearchFakeClient();
    const runner = new ScriptedRunner([
      JSON.stringify({
        claims: [{ section_key: "customer_segments", text: "Acme sells to banks.", confidence: 0.91, evidence_index: 0 }],
      }),
      JSON.stringify({ status: "unsupported", reason: "Banks are not mentioned." }),
    ]);
    const handler = new CompanyResearchHandler({ client: client.asSupabase(), runner, feedRunner: fixtureFeedRunner() });

    await handler.handle(makeCompanyJob());

    const canvasInsert = client.inserts.find((insert) => insert.table === "canvas_section_versions");
    const item = (canvasInsert?.value.items as Array<{ confidence: number; flags: string[] }>)[0];
    expect(item).toMatchObject({ confidence: 0.5, flags: ["unsupported"] });
  });

  it("reuses existing evidence rows instead of duplicating (RF-3-7)", async () => {
    const client = new (class extends CompanyResearchFakeClient {
      selectOne(table: string): Record<string, unknown> | null {
        if (table === "evidence_items") return { id: "evidence-existing" };
        return super.selectOne(table);
      }
    })();
    const runner = new ScriptedRunner([
      JSON.stringify({ claims: [{ section_key: "channels", text: "Acme has self-serve signup.", confidence: 0.7, evidence_index: 0 }] }),
      JSON.stringify({ status: "confirmed", reason: "Supported." }),
    ]);
    const handler = new CompanyResearchHandler({ client: client.asSupabase(), runner, feedRunner: fixtureFeedRunner() });

    await handler.handle(makeCompanyJob());

    expect(client.inserts.filter((insert) => insert.table === "evidence_items")).toHaveLength(0);
    const canvasInsert = client.inserts.find((insert) => insert.table === "canvas_section_versions");
    const items = canvasInsert?.value.items as Array<{ evidence_ids: string[] }>;
    expect(items[0]?.evidence_ids).toEqual(["evidence-existing"]);
  });

  it("escalates extraction to mid route when budget extraction fails validation", async () => {
    const client = new CompanyResearchFakeClient();
    const runner = new ScriptedRunner([
      "```json\n{\"claims\": []}\n```",
      "Here is the JSON:\n```json\n" + JSON.stringify({
        claims: [{ section_key: "channels", text: "Acme sells through self-serve signup.", confidence: 0.72, evidence_index: 0 }],
      }) + "\n```",
      "```json\n{\"status\":\"confirmed\",\"reason\":\"The excerpt mentions self-serve signup.\"}\n```",
    ]);
    const handler = new CompanyResearchHandler({ client: client.asSupabase(), runner, feedRunner: fixtureFeedRunner() });

    await handler.handle(makeCompanyJob());

    expect(runner.requests[0]?.model).toBe("budget-extract-model");
    expect(runner.requests[1]?.model).toBe("escalated-extract-model");
    expect(runner.requests[2]?.model).toBe("claude-sonnet-5");
    expect(client.inserts.find((insert) => insert.table === "metric_snapshots")?.value).toMatchObject({
      metric_key: "research.escalation_rate",
      value: 1,
      label: "firecrawl_scrape",
    });
  });

  it("treats unparseable verifier output as unsupported", async () => {
    const client = new CompanyResearchFakeClient();
    const runner = new ScriptedRunner([
      JSON.stringify({
        claims: [{ section_key: "customer_segments", text: "Acme sells to banks.", confidence: 0.91, evidence_index: 0 }],
      }),
      "I cannot provide JSON today.",
    ]);
    const handler = new CompanyResearchHandler({ client: client.asSupabase(), runner, feedRunner: fixtureFeedRunner() });

    await handler.handle(makeCompanyJob());

    const canvasInsert = client.inserts.find((insert) => insert.table === "canvas_section_versions");
    const item = (canvasInsert?.value.items as Array<{ confidence: number; verification_status: string }>)[0];
    expect(item).toMatchObject({ confidence: 0.5, verification_status: "unsupported" });
  });

  it("dispatcher supports company_research jobs", async () => {
    const client = new CompanyResearchFakeClient();
    const dispatcher = createJobDispatcher({
      client: client.asSupabase(),
      runner: new ScriptedRunner([
        JSON.stringify({ claims: [{ section_key: "channels", text: "Acme has self-serve signup.", confidence: 0.7, evidence_index: 0 }] }),
        JSON.stringify({ status: "confirmed", reason: "Supported." }),
      ]),
      feedRunner: fixtureFeedRunner() as never,
    });

    await dispatcher(makeCompanyJob());
    expect(client.updates.at(-1)).toMatchObject({ table: "agent_runs", values: { status: "completed" } });
  });

  it("writes competitor-flagged canvas versions through the shared research pipeline", async () => {
    const client = new CompanyResearchFakeClient();
    const runner = new ScriptedRunner([
      JSON.stringify({
        claims: [{ section_key: "value_propositions", text: "RivalCo offers managed onboarding.", confidence: 0.78, evidence_index: 0 }],
      }),
      JSON.stringify({ status: "confirmed", reason: "The excerpt mentions managed onboarding." }),
    ]);
    const handler = new CompanyResearchHandler({ client: client.asSupabase(), runner, feedRunner: fixtureFeedRunner() });

    await handler.handleCompetitor(makeCompetitorJob());

    const competitorSelect = client.selects.find((select) => select.table === "companies");
    expect(competitorSelect?.filters).toEqual(expect.arrayContaining([
      ["account_id", "account-1"],
      ["id", "competitor-1"],
      ["is_competitor", true],
    ]));
    const canvasInsert = client.inserts.find((insert) => insert.table === "canvas_section_versions");
    expect(canvasInsert?.value).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      competitor_id: "competitor-1",
      section_key: "value_propositions",
    });
    expect(canvasInsert?.value.notes).toContain("competitor_research");
    expect(runner.requests[0]?.prompt).toContain("RivalCo");
    expect(client.updates.at(-1)).toMatchObject({
      table: "agent_runs",
      values: {
        status: "completed",
        output: expect.objectContaining({ competitor_id: "competitor-1" }),
      },
    });
  });

  it("dispatcher supports competitor_research jobs", async () => {
    const client = new CompanyResearchFakeClient();
    const dispatcher = createJobDispatcher({
      client: client.asSupabase(),
      runner: new ScriptedRunner([
        JSON.stringify({ claims: [{ section_key: "channels", text: "RivalCo sells through partners.", confidence: 0.7, evidence_index: 0 }] }),
        JSON.stringify({ status: "confirmed", reason: "Supported." }),
      ]),
      feedRunner: fixtureFeedRunner() as never,
    });

    await dispatcher(makeCompetitorJob());
    expect(client.updates.at(-1)).toMatchObject({ table: "agent_runs", values: { status: "completed" } });
  });
});

function makeCompanyJob(): AgentJob {
  return {
    id: "job-1",
    account_id: "account-1",
    kind: "company_research",
    payload: { company_url: "https://acme.example", business_context_version_id: "ctx-1" },
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

function makeCompetitorJob(): AgentJob {
  return {
    ...makeCompanyJob(),
    id: "job-competitor-1",
    kind: "competitor_research",
    payload: { competitor_id: "competitor-1", business_context_version_id: "ctx-1" },
  };
}

function fixtureFeedRunner() {
  return {
    async refresh() {
      return {
        health: "ok" as const,
        payload: { fixture: true },
        evidence: [{
          title: "Acme homepage",
          sourceType: "website" as const,
          sourceName: "Firecrawl",
          sourceUrl: "https://acme.example",
          excerpt: "Acme offers analytics dashboards with self-serve signup. Pricing starts at $29 per seat.",
          metadata: {},
        }],
        metrics: [],
      };
    },
  };
}

class ScriptedRunner implements AgentRunner {
  public requests: Parameters<AgentRunner["run"]>[0][] = [];

  constructor(private readonly outputs: string[]) {}

  async run(request: Parameters<AgentRunner["run"]>[0]) {
    this.requests.push(request);
    return {
      resultText: this.outputs.shift() ?? JSON.stringify({ claims: [] }),
      sessionId: "session-1",
      costUsd: 0.01,
      tokensIn: 10,
      tokensOut: 10,
    };
  }
}

class CompanyResearchFakeClient {
  public inserts: Array<{ table: string; value: Record<string, unknown> }> = [];
  public updates: Array<{ table: string; values: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
  public selects: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  private evidenceCounter = 0;

  asSupabase(): never {
    return this as never;
  }

  from(table: string): CompanyResearchFakeQuery {
    return new CompanyResearchFakeQuery(this, table);
  }

  selectOne(table: string, filters: Array<[string, unknown]> = []): Record<string, unknown> | null {
    if (table === "business_context_versions") {
      return { id: "ctx-1", company_name: "Acme", industry: "SaaS", website: "https://acme.example" };
    }
    if (table === "companies" && filters.some(([column, value]) => column === "account_id" && value === "account-1")) {
      return {
        id: "competitor-1",
        name: "RivalCo",
        website_url: "https://rival.example",
        description: "Rival analytics suite.",
        industry: "SaaS",
        is_competitor: true,
      };
    }
    return null;
  }

  selectMany(table: string): Record<string, unknown>[] {
    if (table === "model_routes") {
      return [
        route("extract", "extract", "budget-extract-model", "openrouter"),
        route("extract_escalated", "extract_escalated", "escalated-extract-model", "anthropic"),
        route("research_verify", "research_verify", "claude-sonnet-5", "anthropic"),
      ];
    }
    return [];
  }

  nextEvidenceId(): string {
    this.evidenceCounter += 1;
    return `evidence-${this.evidenceCounter}`;
  }
}

class CompanyResearchFakeQuery {
  private readonly filters: Array<[string, unknown]> = [];
  private insertValue: Record<string, unknown> | null = null;
  private updateValue: Record<string, unknown> | null = null;

  constructor(
    private readonly client: CompanyResearchFakeClient,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }

  insert(value: Record<string, unknown>): this {
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

  or(): this {
    return this;
  }

  order(): this {
    return this;
  }

  limit(): this {
    return this;
  }

  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: null }> {
    this.client.selects.push({ table: this.table, filters: [...this.filters] });
    return Promise.resolve({ data: this.client.selectOne(this.table, this.filters), error: null });
  }

  single(): Promise<{ data: { id: string }; error: null }> {
    return Promise.resolve({ data: { id: this.table === "evidence_items" ? this.client.nextEvidenceId() : "inserted-id" }, error: null });
  }

  then(resolve: (value: { data?: Record<string, unknown>[]; error: null }) => void): void {
    if (this.updateValue) {
      this.client.updates.push({ table: this.table, values: this.updateValue, filters: [...this.filters] });
      resolve({ error: null });
      return;
    }
    resolve({ data: this.client.selectMany(this.table), error: null });
  }
}

function route(routeKey: string, taskClass: string, modelName: string, provider = "anthropic") {
  return {
    account_id: null,
    route_key: routeKey,
    task_class: taskClass,
    provider,
    model_name: modelName,
    params: { temperature: 0.2, max_tokens: 1000 },
    cost_per_1k_in: 0.001,
    cost_per_1k_out: 0.005,
  };
}

describe("extractLogoFromPayload", () => {
  it("prefers og:image, resolves relative URLs, falls back to favicon then /favicon.ico", async () => {
    const { extractLogoFromPayload } = await import("../jobs/company-research.js");
    expect(extractLogoFromPayload(
      { data: { metadata: { ogImage: "/brand/og.png", favicon: "/icon.svg" } } },
      "https://rival.example/pricing",
    )).toEqual({ url: "https://rival.example/brand/og.png", source: "og_image" });
    expect(extractLogoFromPayload(
      { data: { metadata: { favicon: "https://cdn.rival.example/icon.svg" } } },
      "https://rival.example",
    )).toEqual({ url: "https://cdn.rival.example/icon.svg", source: "favicon" });
    expect(extractLogoFromPayload({}, "https://rival.example/about")).toEqual({
      url: "https://rival.example/favicon.ico",
      source: "fallback",
    });
    expect(extractLogoFromPayload({}, "not a url")).toBeNull();
  });
});
