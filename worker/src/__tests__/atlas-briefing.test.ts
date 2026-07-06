import { describe, expect, it } from "vitest";
import type { AgentRunRequest, AgentRunResult, AgentRunner } from "../agent/runner.js";
import { AtlasBriefingHandler, type AtlasBriefingPayload } from "../jobs/atlas-briefing.js";
import type { AgentJob } from "../queue/types.js";

class ScriptedRunner implements AgentRunner {
  request: AgentRunRequest | null = null;

  constructor(private readonly text: string) {}

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    this.request = request;
    return {
      resultText: this.text,
      sessionId: "session-1",
      costUsd: 0.2,
      tokensIn: 100,
      tokensOut: 50,
    };
  }
}

const VALID_MODEL_REPLY = JSON.stringify({
  headline: "Revenue data is grounded but the rest of the board is thin.",
  position: [
    { claim: "Revenue Streams is verified", basis: "Revenue Streams coverage: verified with 2 items" },
    { claim: "c2", basis: "b2" },
    { claim: "c3", basis: "b3" },
    { claim: "c4", basis: "b4" },
    { claim: "c5 — should be clamped away", basis: "b5" },
  ],
  directive: {
    room: "revenue_streams",
    skill_key: "yield.pricing_teardown",
    action: "Run the pricing teardown in Yield's room.",
    why: "It benchmarks your pricing against the two tracked competitors.",
  },
  watchouts: ["w1", "w2", "w3 — should be clamped away"],
});

describe("AtlasBriefingHandler", () => {
  it("builds a briefing for a rich account — 9 deterministic coverage entries, validated directive, deterministic changes", async () => {
    const client = new AtlasFakeClient();
    const runner = new ScriptedRunner(VALID_MODEL_REPLY);
    await new AtlasBriefingHandler({ client: client.asSupabase(), runner }).handle(makeJob());

    // Anthropic-only route filtering: the account-scoped xai row outranks the
    // global anthropic row but must never reach the Claude runner (RF-LIVE-8).
    expect(runner.request?.model).toBe("claude-opus-4-8");
    expect(runner.request?.prompt).toContain("Canvas coverage (9 sections");
    expect(runner.request?.prompt).toContain("Rival Robotics");
    expect(runner.request?.prompt).toContain("yield.pricing_teardown");

    const payload = completedPayload(client);
    expect(payload.kind).toBe("atlas_briefing_v1");
    expect(payload.coverage).toHaveLength(9);
    const bySection = new Map(payload.coverage.map((entry) => [entry.section_key, entry]));
    // Latest version wins: the newer 4-item customer_segments row, not the older 1-item one.
    expect(bySection.get("customer_segments")).toMatchObject({ state: "verified", items: 4 });
    // Half or more "Assumption:"-prefixed items marks the section assumed.
    expect(bySection.get("value_propositions")).toMatchObject({ state: "assumed", items: 3 });
    expect(bySection.get("key_partners")).toMatchObject({ state: "empty", items: 0 });

    // Model output is clamped, and the skill directive survives because it is
    // implemented AND belongs to the room it points at.
    expect(payload.position).toHaveLength(4);
    expect(payload.watchouts).toHaveLength(2);
    expect(payload.directive).toMatchObject({ room: "revenue_streams", skill_key: "yield.pricing_teardown" });

    // Deterministic deltas against the previous stored briefing.
    expect(payload.changes).toContain("Customer Segments moved from empty to verified (4 items)");
    expect(payload.changes).toContain("Open gaps went from 5 to 3");
    expect(payload.changes.some((change) => change.startsWith("New artifact:"))).toBe(true);
    expect(payload.headline).toBe("Revenue data is grounded but the rest of the board is thin.");
  });

  it("nulls a directive skill that is implemented but lives in a different room (rule B2)", async () => {
    const client = new AtlasFakeClient();
    const reply = JSON.stringify({
      headline: "h",
      position: [],
      directive: { room: "customer_segments", skill_key: "yield.pricing_teardown", action: "Do it.", why: "Because." },
      watchouts: [],
    });
    await new AtlasBriefingHandler({ client: client.asSupabase(), runner: new ScriptedRunner(reply) }).handle(makeJob());

    const payload = completedPayload(client);
    expect(payload.directive.room).toBe("customer_segments");
    expect(payload.directive.skill_key).toBeNull();
  });

  it("stays honest on an empty account — all-empty coverage, deterministic headline, no crash", async () => {
    const client = new AtlasFakeClient();
    client.tables.canvas_section_versions = [];
    client.tables.business_context_versions = [];
    client.tables.companies = [];
    client.tables.gaps = [];
    client.tables.skill_artifacts = [];
    client.tables.skill_catalog = [];
    client.tables.agent_runs = [{ id: "run-1", account_id: "account-1" }];
    // No atlas_briefing route seeded yet: the handler borrows the anthropic
    // workspace_chat default instead of failing.
    client.tables.model_routes = [{
      account_id: null,
      route_key: "workspace_chat",
      task_class: "workspace_chat",
      provider: "anthropic",
      model_name: "claude-sonnet-5",
      cost_per_1k_in: 0.002,
      cost_per_1k_out: 0.01,
    }];

    // Model omits the headline and the action — both fall back deterministically.
    const reply = JSON.stringify({ position: [], directive: { room: null, skill_key: null, action: "", why: "" }, watchouts: [] });
    const runner = new ScriptedRunner(reply);
    await new AtlasBriefingHandler({ client: client.asSupabase(), runner }).handle(makeJob());

    expect(runner.request?.model).toBe("claude-sonnet-5");
    const payload = completedPayload(client);
    expect(payload.coverage).toHaveLength(9);
    expect(payload.coverage.every((entry) => entry.state === "empty" && entry.items === 0)).toBe(true);
    expect(payload.headline).toContain("canvas is empty");
    expect(payload.directive).toMatchObject({ room: "key_partners", skill_key: null });
    expect(payload.directive.action.length).toBeGreaterThan(0);
    expect(payload.changes).toEqual([]);
  });

  it("completes with a deterministic fallback payload when the model rambles instead of returning JSON", async () => {
    const client = new AtlasFakeClient();
    const runner = new ScriptedRunner("Honestly, you should really think about your pricing strategy. Good luck out there!");
    await new AtlasBriefingHandler({ client: client.asSupabase(), runner }).handle(makeJob());

    const payload = completedPayload(client);
    expect(payload.kind).toBe("atlas_briefing_v1");
    expect(payload.headline).toContain("of 9 canvas sections");
    expect(payload.position.length).toBeGreaterThan(0);
    expect(payload.position.every((claim) => claim.claim.length > 0 && claim.basis.length > 0)).toBe(true);
    // Deterministic directive: the first empty section in canonical order.
    expect(payload.directive).toMatchObject({ room: "key_partners", skill_key: null });
    expect(payload.coverage).toHaveLength(9);

    const completed = client.updates
      .filter((entry) => entry.table === "agent_runs")
      .map((entry) => entry.values as Record<string, unknown>)
      .find((values) => values.status === "completed");
    expect(completed?.summary).toBe(payload.headline);
  });
});

function completedPayload(client: AtlasFakeClient): AtlasBriefingPayload {
  const completed = client.updates
    .filter((entry) => entry.table === "agent_runs")
    .map((entry) => entry.values as Record<string, unknown>)
    .find((values) => values.status === "completed");
  expect(completed).toBeDefined();
  return completed?.output as AtlasBriefingPayload;
}

function makeJob(): AgentJob {
  return {
    id: "job-1",
    account_id: "account-1",
    agent_run_id: "run-1",
    parent_run_id: null,
    cascade_run_id: null,
    kind: "atlas_briefing",
    status: "queued",
    payload: {},
    attempts: 0,
    max_attempts: 3,
    run_after: new Date().toISOString(),
    locked_at: null,
    heartbeat_at: null,
    claimed_by: null,
    last_error: null,
    created_at: new Date().toISOString(),
  };
}

class AtlasFakeClient {
  inserts: Array<{ table: string; values: unknown }> = [];
  updates: Array<{ table: string; values: unknown }> = [];

  readonly tables: Record<string, unknown[]> = {
    // Newest-first, mirroring the created_at desc order the real query uses.
    canvas_section_versions: [{
      account_id: "account-1",
      competitor_id: null,
      section_key: "customer_segments",
      items: ["Mid-market manufacturers", { text: "Enterprise OEMs" }, "Robotics integrators", "Aftermarket service buyers"],
      created_at: "2026-07-05T10:00:00Z",
    }, {
      account_id: "account-1",
      competitor_id: null,
      section_key: "customer_segments",
      items: ["Old single item"],
      created_at: "2026-07-01T10:00:00Z",
    }, {
      account_id: "account-1",
      competitor_id: null,
      section_key: "value_propositions",
      items: ["Assumption: best-in-class uptime", "Assumption— cheapest integration", { text: "Fast delivery" }],
      created_at: "2026-07-04T10:00:00Z",
    }, {
      account_id: "account-1",
      competitor_id: null,
      section_key: "revenue_streams",
      items: ["Hardware sales", "Service contracts"],
      created_at: "2026-07-04T09:00:00Z",
    }, {
      // Competitor canvases never count toward the account's own coverage.
      account_id: "account-1",
      competitor_id: "competitor-1",
      section_key: "channels",
      items: ["Their channel"],
      created_at: "2026-07-05T11:00:00Z",
    }],
    business_context_versions: [{
      account_id: "account-1",
      company_name: "Acme Robotics",
      industry: "Industrial automation",
      summary: "Sells robotic arms to mid-market manufacturers.",
      created_at: "2026-07-06T00:00:00Z",
    }],
    companies: [{
      account_id: "account-1",
      name: "Rival Robotics",
      website_url: "https://rival.example",
      is_competitor: true,
      created_at: "2026-07-01T00:00:00Z",
    }, {
      account_id: "account-1",
      name: "Acme Robotics",
      website_url: null,
      is_competitor: false,
      created_at: "2026-07-01T00:00:00Z",
    }],
    gaps: [{
      account_id: "account-1",
      title: "No pricing data for any competitor",
      severity: "high",
      status: "open",
      score: 90,
    }, {
      account_id: "account-1",
      title: "Channels section is a guess",
      severity: "medium",
      status: "acknowledged",
      score: 60,
    }, {
      account_id: "account-1",
      title: "Churn rate unknown",
      severity: "low",
      status: "in_progress",
      score: 30,
    }, {
      account_id: "account-1",
      title: "Already fixed",
      severity: "high",
      status: "resolved",
      score: 95,
    }],
    skill_artifacts: [{
      account_id: "account-1",
      title: "Pricing teardown — Rival Robotics",
      skill_key: "yield.pricing_teardown",
      created_at: "2026-07-03T00:00:00Z",
    }],
    skill_catalog: [{
      skill_key: "yield.pricing_teardown",
      agent_key: "agent_revenue_streams",
      title: "Pricing teardown",
      implemented: true,
      sort_order: 1,
    }, {
      skill_key: "relay.channel_gap_scan",
      agent_key: "agent_channels",
      title: "Channel gap scan",
      implemented: false,
      sort_order: 1,
    }],
    agent_runs: [{
      id: "run-1",
      account_id: "account-1",
    }, {
      id: "run-0",
      account_id: "account-1",
      run_type: "atlas_briefing",
      status: "completed",
      completed_at: "2026-07-01T00:00:00Z",
      input: { open_gaps: 5 },
      output: {
        kind: "atlas_briefing_v1",
        generated_at: "2026-07-01T00:00:00Z",
        coverage: [
          { section_key: "customer_segments", state: "empty", items: 0 },
          { section_key: "value_propositions", state: "assumed", items: 3 },
          { section_key: "revenue_streams", state: "verified", items: 2 },
        ],
      },
    }],
    model_routes: [{
      // Account-scoped xai route with the winning route_key: precedence says
      // pick it, the anthropic-only filter says never — filter must win.
      account_id: "account-1",
      route_key: "atlas_briefing",
      task_class: null,
      provider: "xai",
      model_name: "grok-4.3",
      cost_per_1k_in: 0.00125,
      cost_per_1k_out: 0.0025,
    }, {
      account_id: null,
      route_key: "atlas_briefing",
      task_class: "atlas_briefing",
      provider: "anthropic",
      model_name: "claude-opus-4-8",
      cost_per_1k_in: 0.015,
      cost_per_1k_out: 0.075,
    }, {
      account_id: null,
      route_key: "workspace_chat",
      task_class: "workspace_chat",
      provider: "anthropic",
      model_name: "claude-sonnet-5",
      cost_per_1k_in: 0.002,
      cost_per_1k_out: 0.01,
    }],
  };

  asSupabase() {
    return {
      from: (table: string) => new AtlasFakeQuery(this, table),
    } as never;
  }
}

class AtlasFakeQuery {
  private filters: Array<{ column: string; value: unknown }> = [];
  private listFilters: Array<{ column: string; values: unknown[]; negated: boolean }> = [];
  private limitCount: number | null = null;
  private pendingInsert: unknown | null = null;
  private pendingUpdate: unknown | null = null;

  constructor(private readonly client: AtlasFakeClient, private readonly table: string) {}

  select(): this { return this; }
  order(): this { return this; }
  limit(count: number): this { this.limitCount = count; return this; }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.listFilters.push({ column, values, negated: false });
    return this;
  }

  // Supabase's negated-in shape: .not("status", "in", "(a,b,c)").
  not(column: string, _operator: string, value: unknown): this {
    const values = String(value).replace(/^\(|\)$/g, "").split(",");
    this.listFilters.push({ column, values, negated: true });
    return this;
  }

  or(): this { return this; }

  insert(values: unknown): Promise<{ error: null }> {
    this.client.inserts.push({ table: this.table, values });
    this.pendingInsert = values;
    return Promise.resolve({ error: null });
  }

  update(values: unknown): this {
    this.client.updates.push({ table: this.table, values });
    this.pendingUpdate = values;
    return this;
  }

  async maybeSingle(): Promise<{ data: unknown | null; error: null }> {
    return { data: this.rows()[0] ?? null, error: null };
  }

  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    if (this.pendingUpdate || this.pendingInsert) {
      return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
    }
    return Promise.resolve({ data: this.rows(), error: null }).then(onfulfilled, onrejected);
  }

  private rows(): unknown[] {
    let rows = [...(this.client.tables[this.table] ?? [])] as Record<string, unknown>[];
    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }
    for (const filter of this.listFilters) {
      rows = rows.filter((row) => filter.values.includes(row[filter.column]) !== filter.negated);
    }
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    return rows;
  }
}
