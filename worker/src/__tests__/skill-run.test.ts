import { describe, expect, it } from "vitest";
import type { AgentRunRequest, AgentRunResult, AgentRunner } from "../agent/runner.js";
import { parsePricingArtifact, SkillRunHandler } from "../jobs/skill-run.js";
import type { AgentJob } from "../queue/types.js";

const SOURCES = [{
  competitorId: "comp-1",
  name: "RivalCo",
  pricingUrl: "https://rival.example/pricing",
  excerpt: "Pro plan $29/user/mo. Enterprise custom.",
  evidenceId: "ev-1",
}];

describe("parsePricingArtifact", () => {
  it("parses a valid artifact and rejects rows with unknown competitor ids", () => {
    const artifact = parsePricingArtifact(JSON.stringify({
      matrix: [
        { competitor_id: "comp-1", competitor: "RivalCo", model: "per-seat", price_points: ["$29/user/mo"], packaging_axes: ["seats"], notes: "" },
        { competitor_id: "hallucinated", competitor: "MadeUp", model: "usage", price_points: [], packaging_axes: [], notes: "" },
      ],
      your_position: "Underpriced vs RivalCo",
      recommendation_md: "## Recommendation\nRaise Pro tier.",
      scenarios: [{ name: "Match", description: "Match RivalCo at $29." }],
    }), SOURCES);
    expect(artifact?.matrix).toHaveLength(1);
    expect(artifact?.matrix[0]).toMatchObject({ competitor_id: "comp-1", model: "per-seat" });
    expect(artifact?.bodyMd).toContain("Raise Pro tier");
  });

  it("returns null for unparseable or empty output", () => {
    expect(parsePricingArtifact("not json", SOURCES)).toBeNull();
    expect(parsePricingArtifact(JSON.stringify({ matrix: [], recommendation_md: "x" }), SOURCES)).toBeNull();
  });
});

class SkillRunner implements AgentRunner {
  constructor(private readonly main: string, private readonly verify: string) {}
  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const isVerify = request.prompt.startsWith("Classify the claim");
    return {
      resultText: isVerify ? this.verify : this.main,
      sessionId: "s", costUsd: 0.01, tokensIn: 1, tokensOut: 1,
    };
  }
}

describe("SkillRunHandler", () => {
  const makeHandler = (client: FakeClient, verify = JSON.stringify({ status: "confirmed", reason: "excerpt states $29" })) =>
    new SkillRunHandler({
      client: client.asSupabase(),
      runner: new SkillRunner(JSON.stringify({
        matrix: [{ competitor_id: "comp-1", competitor: "RivalCo", model: "per-seat", price_points: ["$29/user/mo"], packaging_axes: ["seats"], notes: "" }],
        your_position: "Underpriced",
        recommendation_md: "## Recommendation\nRaise the Pro tier to $29.",
        scenarios: [],
      }), verify),
      feedRunner: {
        async refresh() {
          return {
            health: "ok",
            payload: {},
            evidence: [{ title: "RivalCo pricing", excerpt: "Pro plan $29/user/mo. Enterprise custom.", sourceType: "website" }],
            metrics: [],
          };
        },
      } as never,
    });

  it("writes a verified pricing artifact with evidence links", async () => {
    const client = new FakeClient();
    await makeHandler(client).handle(makeJob());

    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      skill_key: "yield.pricing_teardown",
      evidence_ids: ["evidence-1"],
    });
    expect((artifact?.values.payload as Record<string, unknown>).spot_check).toEqual({ checked: 1, confirmed: 1 });
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values).toMatchObject({ status: "completed" });
  });

  it("hard-fails on a contradicted spot-check — no artifact written", async () => {
    const client = new FakeClient();
    const handler = makeHandler(client, JSON.stringify({ status: "contradicted", reason: "excerpt says $99" }));
    await expect(handler.handle(makeJob())).rejects.toThrow(/spot-check contradicted/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("rejects unimplemented skills loudly", async () => {
    const client = new FakeClient();
    await expect(makeHandler(client).handle(makeJob({ payload: { skill_key: "vault.moat_audit" } })))
      .rejects.toThrow(/not implemented/);
  });
});

function makeJob(over: Partial<AgentJob> = {}): AgentJob {
  return {
    id: "job-1", account_id: "account-1", kind: "skill_run",
    payload: { skill_key: "yield.pricing_teardown" },
    status: "running", attempts: 1, max_attempts: 3, agent_run_id: "run-1",
    parent_run_id: null, cascade_run_id: null, claimed_by: "w",
    locked_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(),
    run_after: new Date().toISOString(), last_error: null, created_at: new Date().toISOString(),
    ...over,
  };
}

class FakeClient {
  public inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  public updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  asSupabase(): never { return this as never; }
  from(table: string): FakeQuery { return new FakeQuery(this, table); }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private operation: "select" | "insert" | "update" = "select";
  private values: Record<string, unknown> = {};
  constructor(private readonly client: FakeClient, private readonly table: string) {}
  select(): this { return this; }
  insert(values: Record<string, unknown>): this { this.operation = "insert"; this.values = values; return this; }
  update(values: Record<string, unknown>): this { this.operation = "update"; this.values = values; return this; }
  eq(): this { return this; }
  is(): this { return this; }
  in(): this { return this; }
  or(): this { return this; }
  not(): this { return this; }
  order(): this { return this; }
  limit(): this { return this; }
  maybeSingle(): Promise<{ data: unknown; error: null }> { return Promise.resolve({ data: null, error: null }); }
  single(): Promise<{ data: unknown; error: null }> {
    if (this.operation === "insert") this.client.inserts.push({ table: this.table, values: this.values });
    return Promise.resolve({ data: { id: "evidence-1" }, error: null });
  }
  then<T1 = { data: unknown; error: null }, T2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => T1 | PromiseLike<T1>) | null,
  ): PromiseLike<T1 | T2> {
    if (this.operation === "insert") this.client.inserts.push({ table: this.table, values: this.values });
    if (this.operation === "update") this.client.updates.push({ table: this.table, values: this.values });
    return Promise.resolve({ data: this.resolveSelect(), error: null as null }).then(onfulfilled);
  }
  private resolveSelect(): unknown {
    if (this.table === "companies") return [{ id: "comp-1", name: "RivalCo", website_url: "https://rival.example" }];
    if (this.table === "canvas_section_versions") return [{ items: ["Subscription revenue"], created_at: "2026-07-04" }];
    if (this.table === "model_routes") {
      return [
        { account_id: null, route_key: "skill_run", task_class: "skill_run", provider: "anthropic", model_name: "claude-sonnet-5", params: {}, cost_per_1k_in: 0.002, cost_per_1k_out: 0.01 },
        { account_id: null, route_key: "research_verify", task_class: "research_verify", provider: "anthropic", model_name: "claude-sonnet-5", params: {}, cost_per_1k_in: 0.002, cost_per_1k_out: 0.01 },
      ];
    }
    return null;
  }
}
