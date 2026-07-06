import { describe, expect, it } from "vitest";
import type { AgentRunRequest, AgentRunResult, AgentRunner } from "../agent/runner.js";
import {
  parseAvatarArtifact,
  parseChannelEconomicsArtifact,
  parseChannelGapArtifact,
  parseDifferentiatorArtifact,
  parsePricingArtifact,
  parseProofGapArtifact,
  parseSegmentExpansionArtifact,
  runModelStep,
  SkillRunHandler,
} from "../jobs/skill-run.js";
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

describe("runModelStep", () => {
  it("retries once on a process-level failure and succeeds", async () => {
    let calls = 0;
    const result = await runModelStep("normalize", async () => {
      calls += 1;
      if (calls === 1) throw new Error("Claude Code process exited with code 1");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("does not retry non-process failures and prefixes the step", async () => {
    let calls = 0;
    await expect(runModelStep("normalize", async () => {
      calls += 1;
      throw new Error("unparseable output");
    })).rejects.toThrow(/^normalize: unparseable output/);
    expect(calls).toBe(1);
  });

  it("reports both messages when the retry also dies", async () => {
    await expect(runModelStep("verify", async () => {
      throw new Error("spawn ENOMEM");
    })).rejects.toThrow(/verify failed twice at the process level/);
  });
});

class SkillRunner implements AgentRunner {
  private mainIndex = 0;
  public requests: AgentRunRequest[] = [];
  constructor(private readonly main: string | string[], private readonly verify: string) {}
  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    this.requests.push(request);
    const isVerify = request.prompt.startsWith("Classify the claim");
    const resultText = Array.isArray(this.main) ? this.main[Math.min(this.mainIndex, this.main.length - 1)] : this.main;
    if (!isVerify && Array.isArray(this.main)) this.mainIndex += 1;
    return {
      resultText: isVerify ? this.verify : resultText,
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

  it.each([
    ["compass.avatar_refinement", avatarOutput(), "cards"],
    ["compass.segment_expansion", segmentExpansionOutput(), "opportunities"],
    ["relay.channel_gap_scan", channelGapOutput(), "gaps"],
    ["relay.channel_economics", channelEconomicsOutput(), "channels"],
  ])("writes a verified %s artifact with typed payload", async (skillKey, output, payloadKey) => {
    const client = new FakeClient();
    const handler = makeSkillHandler(client, output);
    await handler.handle(makeJob({ payload: { skill_key: skillKey } }));

    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({ account_id: "account-1", skill_key: skillKey });
    expect((artifact?.values.payload as Record<string, unknown>)[payloadKey]).toBeTruthy();
    expect(artifact?.values.evidence_ids).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values).toMatchObject({ status: "completed" });
  });

  it.each([
    ["compass.avatar_refinement", avatarOutput()],
    ["compass.segment_expansion", segmentExpansionOutput()],
    ["relay.channel_gap_scan", channelGapOutput()],
    ["relay.channel_economics", channelEconomicsOutput()],
  ])("rejects %s when verifier contradicts", async (skillKey, output) => {
    const client = new FakeClient();
    const handler = makeSkillHandler(client, output, JSON.stringify({ status: "contradicted", reason: "not in evidence" }));
    await expect(handler.handle(makeJob({ payload: { skill_key: skillKey } }))).rejects.toThrow(/spot-check contradicted/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it.each([
    ["compass.avatar_refinement", /Customer Segments canvas items/],
    ["compass.segment_expansion", /Customer Segments canvas items/],
    ["relay.channel_gap_scan", /Channels canvas items/],
    ["relay.channel_economics", /Channels canvas items/],
  ])("fails %s honestly on empty input", async (skillKey, message) => {
    const client = new FakeClient();
    client.ownRows = [];
    const handler = makeSkillHandler(client, avatarOutput());
    await expect(handler.handle(makeJob({ payload: { skill_key: skillKey } }))).rejects.toThrow(message);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("forge skills (Phase F)", () => {
  it("differentiator_audit classifies claims, spot-checks non-unique verdicts, and never sees the previous company's rows", async () => {
    const client = new FakeClient();
    const runner = new SkillRunner(differentiatorOutput(), JSON.stringify({ status: "confirmed", reason: "competitor text matches" }));
    const handler = new SkillRunHandler({ client: client.asSupabase(), runner, feedRunner: { async refresh() { throw new Error("no feeds in this skill"); } } as never });
    await handler.handle(makeJob({ payload: { skill_key: "forge.differentiator_audit" } }));

    // Company scoping: the newer ctx-0 trap row must never reach the prompt.
    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain("Only platform with evidence-cited canvases");
    expect(mainPrompt).not.toContain("Stale old-company differentiator");

    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "forge.differentiator_audit",
    });
    const rows = (artifact?.values.payload as { rows: Array<Record<string, unknown>> }).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ verdict: "unique", competitor: null });
    expect(rows[1]).toMatchObject({ verdict: "contested", competitor: "RivalCo" });
    // Artifact -> context wiring: the owning agent gets a summary note.
    const note = client.inserts.find((entry) => entry.table === "context_sources");
    expect(note?.values).toMatchObject({ agent_profile_id: "profile-1", type: "note" });
    expect((note?.values.config as Record<string, unknown>).source).toBe("skill_artifact");
  });

  it("differentiator_audit fails honestly without competitor VP research", async () => {
    const client = new FakeClient();
    client.competitorRows = client.competitorRows.filter((row) => row.section_key !== "value_propositions");
    const runner = new SkillRunner(differentiatorOutput(), "{}");
    const handler = new SkillRunHandler({ client: client.asSupabase(), runner, feedRunner: { async refresh() { throw new Error("x"); } } as never });
    await expect(handler.handle(makeJob({ payload: { skill_key: "forge.differentiator_audit" } })))
      .rejects.toThrow(/competitor Value Propositions research/);
  });

  it("proof_gap_scan flags evidence-free and assumption items, writes register rows stamped to the active company, and supersedes prior rows", async () => {
    const client = new FakeClient();
    const runner = new SkillRunner(proofGapOutput(), "{}");
    const handler = new SkillRunHandler({ client: client.asSupabase(), runner, feedRunner: { async refresh() { throw new Error("x"); } } as never });
    await handler.handle(makeJob({ payload: { skill_key: "forge.proof_gap_scan" } }));

    // Deterministic detection: only the assumption-labeled, evidence-free item.
    const gapInsert = client.inserts.find((entry) => entry.table === "gaps");
    const gapRows = gapInsert?.values as unknown as Array<Record<string, unknown>>;
    expect(gapRows).toHaveLength(1);
    expect(gapRows[0]).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      gap_type: "missing_data",
      affected_sections: ["value_propositions"],
    });
    expect(String(gapRows[0].title)).toMatch(/^Proof gap: Assumption: fastest onboarding/);
    // Idempotency: prior open proof gaps superseded before the insert.
    const supersede = client.updates.find((update) => update.table === "gaps");
    expect(supersede?.values).toMatchObject({ status: "superseded" });

    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({ skill_key: "forge.proof_gap_scan", business_context_version_id: "ctx-1" });
    expect((artifact?.values.payload as Record<string, unknown>).detection).toBe("deterministic");
  });

  it("proof_gap_scan writes an honest no-gaps artifact without a model call when every claim carries evidence", async () => {
    const client = new FakeClient();
    client.ownRows = client.ownRows.map((row) =>
      row.section_key === "value_propositions" && row.business_context_version_id === "ctx-1"
        ? { ...row, items: [{ text: "Only platform with evidence-cited canvases", evidence_ids: ["ev-own-vp"] }] }
        : row,
    );
    const runner = new SkillRunner("model should never be called", "{}");
    const handler = new SkillRunHandler({ client: client.asSupabase(), runner, feedRunner: { async refresh() { throw new Error("x"); } } as never });
    await handler.handle(makeJob({ payload: { skill_key: "forge.proof_gap_scan" } }));

    expect(runner.requests).toHaveLength(0);
    expect(client.inserts.filter((entry) => entry.table === "gaps")).toHaveLength(0);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(String(artifact?.values.title)).toContain("no gaps");
  });

  it("proof_gap_scan rejects a model reply that drops a detected gap", async () => {
    const client = new FakeClient();
    const runner = new SkillRunner(JSON.stringify({ gaps: [], body_md: "## Proof plan" }), "{}");
    const handler = new SkillRunHandler({ client: client.asSupabase(), runner, feedRunner: { async refresh() { throw new Error("x"); } } as never });
    await expect(handler.handle(makeJob({ payload: { skill_key: "forge.proof_gap_scan" } })))
      .rejects.toThrow(/unparseable output/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("new skill artifact parsers", () => {
  it("parse typed outputs and reject empty payloads", () => {
    expect(parseAvatarArtifact(avatarOutput(), ["Seed-stage SaaS founders"])?.cards).toHaveLength(1);
    expect(parseSegmentExpansionArtifact(segmentExpansionOutput())?.opportunities).toHaveLength(1);
    expect(parseChannelGapArtifact(channelGapOutput())?.gaps).toHaveLength(1);
    expect(parseChannelEconomicsArtifact(channelEconomicsOutput())?.channels[0]?.cac_posture).toBe("unknown — not published");
    expect(parseAvatarArtifact(JSON.stringify({ cards: [] }), ["x"])).toBeNull();
  });

  it("parseDifferentiatorArtifact rejects invented claims and unnamed contests", () => {
    const allowed = ["Only platform with evidence-cited canvases", "Assumption: fastest onboarding in the category"];
    const parsed = parseDifferentiatorArtifact(differentiatorOutput(), allowed);
    expect(parsed?.rows).toHaveLength(2);
    // A claim the canvas never made is dropped, not shipped.
    expect(parseDifferentiatorArtifact(JSON.stringify({
      rows: [{ claim: "Invented claim", verdict: "unique", competitor: null, competitor_evidence: "", basis: "b" }],
      body_md: "x",
    }), allowed)).toBeNull();
    // "contested" without a named competitor is an unsupported assertion.
    expect(parseDifferentiatorArtifact(JSON.stringify({
      rows: [{ claim: allowed[0], verdict: "contested", competitor: null, competitor_evidence: "", basis: "b" }],
      body_md: "x",
    }), allowed)).toBeNull();
  });

  it("parseProofGapArtifact requires a suggestion for every detected gap", () => {
    const detected = [{ claim: "Assumption: fastest onboarding in the category", reason: "assumption" as const }];
    expect(parseProofGapArtifact(proofGapOutput(), detected)?.gaps).toHaveLength(1);
    expect(parseProofGapArtifact(JSON.stringify({ gaps: [], body_md: "x" }), detected)).toBeNull();
  });
});

function makeSkillHandler(
  client: FakeClient,
  output: string,
  verify = JSON.stringify({ status: "confirmed", reason: "supported" }),
) {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner: new SkillRunner(output, verify),
    feedRunner: {
      async refresh() {
        return {
          health: "ok",
          payload: {},
          evidence: [{
            title: "Founder community thread",
            excerpt: "Seed-stage SaaS founders say onboarding is too slow and they need proof before buying.",
            sourceType: "social",
            sourceName: "Grok Live Search",
            sourceUrl: "https://community.example/founders",
          }],
          metrics: [],
        };
      },
    } as never,
  });
}

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
  // Two company eras on one account: ctx-1 (Acme) is active; ctx-0 belongs to
  // the previously analyzed company and must never reach a skill.
  public contexts: Array<Record<string, unknown>> = [
    { id: "ctx-1", company_name: "Acme Robotics", website: null, created_at: "2026-07-03T00:00:00Z" },
    { id: "ctx-0", company_name: "Old Ventures", website: "https://old.example", created_at: "2026-06-01T00:00:00Z" },
  ];
  public ownRows: Array<Record<string, unknown>> = [{
    section_key: "customer_segments",
    business_context_version_id: "ctx-1",
    competitor_id: null,
    items: [{ text: "Seed-stage SaaS founders", evidence_ids: ["ev-own-segment"] }],
    created_at: "2026-07-04",
  }, {
    section_key: "channels",
    business_context_version_id: "ctx-1",
    competitor_id: null,
    items: [{ text: "Founder-led outbound", evidence_ids: ["ev-own-channel"] }],
    created_at: "2026-07-04",
  }, {
    section_key: "revenue_streams",
    business_context_version_id: "ctx-1",
    competitor_id: null,
    items: ["Subscription revenue"],
    created_at: "2026-07-04",
  }, {
    section_key: "value_propositions",
    business_context_version_id: "ctx-1",
    competitor_id: null,
    items: [
      { text: "Only platform with evidence-cited canvases", evidence_ids: ["ev-own-vp"] },
      { text: "Assumption: fastest onboarding in the category", evidence_ids: [] },
    ],
    created_at: "2026-07-04",
  }, {
    // Cross-company trap: NEWER than the ctx-1 row — without company scoping
    // latest-per-section would feed the old company's claim into the skill.
    section_key: "value_propositions",
    business_context_version_id: "ctx-0",
    competitor_id: null,
    items: [{ text: "Stale old-company differentiator", evidence_ids: [] }],
    created_at: "2026-07-05",
  }, {
    section_key: "key_resources",
    business_context_version_id: "ctx-1",
    competitor_id: null,
    items: [{ text: "AI workflow engine", evidence_ids: [] }],
    created_at: "2026-07-04",
  }, {
    section_key: "key_activities",
    business_context_version_id: "ctx-1",
    competitor_id: null,
    items: [{ text: "Concierge onboarding", evidence_ids: [] }],
    created_at: "2026-07-04",
  }];
  public competitorRows: Array<Record<string, unknown>> = [{
    section_key: "customer_segments",
    business_context_version_id: "ctx-1",
    competitor_id: "comp-1",
    companies: { name: "RivalCo" },
    items: [{ text: "RivalCo serves enterprise innovation teams.", evidence_ids: ["ev-competitor-1"] }],
    created_at: "2026-07-04",
  }, {
    section_key: "channels",
    business_context_version_id: "ctx-1",
    competitor_id: "comp-1",
    companies: { name: "RivalCo" },
    items: [{ text: "RivalCo distributes through integration marketplaces and partner webinars.", evidence_ids: ["ev-competitor-1"] }],
    created_at: "2026-07-04",
  }, {
    section_key: "value_propositions",
    business_context_version_id: "ctx-1",
    competitor_id: "comp-1",
    companies: { name: "RivalCo" },
    items: [{ text: "RivalCo offers evidence-cited strategy canvases.", evidence_ids: ["ev-competitor-vp"] }],
    created_at: "2026-07-04",
  }];
  asSupabase(): never { return this as never; }
  from(table: string): FakeQuery { return new FakeQuery(this, table); }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private operation: "select" | "insert" | "update" = "select";
  private values: Record<string, unknown> = {};
  private filters: Array<{ op: string; column: string; value: unknown }> = [];
  constructor(private readonly client: FakeClient, private readonly table: string) {}
  select(): this { return this; }
  insert(values: Record<string, unknown>): this { this.operation = "insert"; this.values = values; return this; }
  update(values: Record<string, unknown>): this { this.operation = "update"; this.values = values; return this; }
  eq(column: string, value: unknown): this { this.filters.push({ op: "eq", column, value }); return this; }
  is(column: string, value: unknown): this { this.filters.push({ op: "is", column, value }); return this; }
  in(column: string, value: unknown): this { this.filters.push({ op: "in", column, value }); return this; }
  like(column: string, value: unknown): this { this.filters.push({ op: "like", column, value }); return this; }
  or(): this { return this; }
  not(column: string, op: string, value: unknown): this { this.filters.push({ op: `not:${op}`, column, value }); return this; }
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
    if (this.table === "business_context_versions") return this.client.contexts;
    if (this.table === "agent_profiles") return [{ id: "profile-1", account_id: "account-1" }];
    if (this.table === "context_sources") return [];
    if (this.table === "canvas_section_versions") {
      const section = this.filters.find((filter) => filter.column === "section_key")?.value;
      const wantsCompetitor = this.filters.some((filter) => filter.op === "not:is" && filter.column === "competitor_id");
      const contextIds = this.filters.find((filter) => filter.op === "in" && filter.column === "business_context_version_id")?.value as string[] | undefined;
      let rows = wantsCompetitor ? this.client.competitorRows : this.client.ownRows;
      if (section) rows = rows.filter((row) => row.section_key === section);
      // Honor company scoping the way postgrest would — the trap rows from
      // the previous company era must actually be filtered by the query.
      if (contextIds) rows = rows.filter((row) => contextIds.includes(row.business_context_version_id as string));
      return rows;
    }
    if (this.table === "model_routes") {
      return [
        { account_id: null, route_key: "skill_run", task_class: "skill_run", provider: "anthropic", model_name: "claude-sonnet-5", params: {}, cost_per_1k_in: 0.002, cost_per_1k_out: 0.01 },
        { account_id: null, route_key: "research_verify", task_class: "research_verify", provider: "anthropic", model_name: "claude-sonnet-5", params: {}, cost_per_1k_in: 0.002, cost_per_1k_out: 0.01 },
      ];
    }
    return null;
  }
}

function avatarOutput(): string {
  return JSON.stringify({
    cards: [{
      segment: "Seed-stage SaaS founders",
      who: "Founders trying to turn messy strategy data into action.",
      pains: [{ quote: "onboarding is too slow", interpretation: "They need faster activation." }],
      buying_triggers: ["Investor update due"],
      disqualifiers: ["No current competitor set"],
      messaging_hooks: ["Turn competitor noise into a next move"],
    }],
    messaging_hooks: ["Strategy work without the blank page"],
    body_md: "## ICP refinement\nLead with speed to proof.",
  });
}

function segmentExpansionOutput(): string {
  return JSON.stringify({
    opportunities: [{
      segment: "Enterprise innovation teams",
      competitor: "RivalCo",
      competitor_evidence: "RivalCo serves enterprise innovation teams.",
      fit_score: 4,
      fit_rationale: "Our AI workflow engine and concierge onboarding map to complex teams.",
      recommended_probe: "Interview three innovation leads.",
    }],
    body_md: "## Expansion shortlist\nTest enterprise innovation teams first.",
  });
}

function channelGapOutput(): string {
  return JSON.stringify({
    gaps: [{
      channel: "Integration marketplaces",
      competitor: "RivalCo",
      competitor_evidence: "RivalCo distributes through integration marketplaces.",
      effort: 3,
      impact: 5,
      recommendation: "Pilot one marketplace listing.",
    }],
    body_md: "## Channel gaps\nMarketplace presence is the sharpest gap.",
  });
}

function differentiatorOutput(): string {
  return JSON.stringify({
    rows: [{
      claim: "Only platform with evidence-cited canvases",
      verdict: "unique",
      competitor: null,
      competitor_evidence: "",
      basis: "No competitor text mentions evidence citations.",
    }, {
      claim: "Assumption: fastest onboarding in the category",
      verdict: "contested",
      competitor: "RivalCo",
      competitor_evidence: "RivalCo offers evidence-cited strategy canvases.",
      basis: "RivalCo claims a comparable capability.",
    }],
    body_md: "## Differentiation read\nEvidence citations are the wedge.",
  });
}

function proofGapOutput(): string {
  return JSON.stringify({
    gaps: [{
      claim: "Assumption: fastest onboarding in the category",
      suggested_source: "Onboarding time metric from the product database",
      how_to_get_it: "Export median time-to-first-canvas for the last 20 signups.",
    }],
    body_md: "## Proof plan\nOne metric closes the only open gap.",
  });
}

function channelEconomicsOutput(): string {
  return JSON.stringify({
    channels: [{
      channel: "Partner webinars",
      competitor: "RivalCo",
      public_signal: "RivalCo distributes through partner webinars.",
      cac_posture: "unknown — not published",
      confidence: 0.55,
      notes: "Signal is visible, unit cost is not published.",
    }],
    body_md: "## Channel economics\nKeep unknown CAC cells honest.",
  });
}
