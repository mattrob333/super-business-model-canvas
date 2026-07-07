import { describe, expect, it } from "vitest";
import { createBmcServer } from "../tools/bmc-tools.js";
import type { ToolContext } from "../tools/bmc-tools.js";

interface RegisteredTool {
  handler: (args: Record<string, unknown>) => Promise<{
    structuredContent?: Record<string, unknown>;
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}

interface SdkServerShape {
  instance: {
    _registeredTools: Record<string, RegisteredTool>;
  };
}

describe("BMC MCP tools", () => {
  it("executes every tool against an account-scoped fake schema", async () => {
    const client = new FakeSupabaseClient();
    const tools = registeredTools(client.asSupabase());

    await expect(tools.read_canvas.handler({ section_key: "value_propositions", include_evidence: false }))
      .resolves.toMatchObject({ structuredContent: { rows: [] } });
    expect(client.operations.at(-1)).toMatchObject({
      table: "canvas_section_versions",
      filters: [
        ["account_id", "account-1"],
        // RF-4-2: own-canvas reads must never see competitor-linked versions.
        ["is:competitor_id", null],
        // Company scoping: reads are confined to the active company's context
        // chain (empty fake account -> empty chain).
        ["in:business_context_version_id", []],
        ["section_key", "value_propositions"],
      ],
    });

    await expect(tools.write_section_items.handler({
      section_key: "value_propositions",
      items: [{ text: "Supported value", confidence: 0.8, evidence_ids: ["11111111-1111-4111-8111-111111111111"] }],
      notes: "Evidence-backed",
    })).resolves.toMatchObject({ structuredContent: { proposal: true, section_key: "value_propositions" } });

    await expect(tools.log_evidence.handler({ title: "Homepage", source_type: "manual", metadata: {} }))
      .resolves.toMatchObject({ structuredContent: { evidence_id: "inserted-id" } });
    expect(client.operations.at(-1)).toMatchObject({
      table: "evidence_items",
      insert: { account_id: "account-1", created_by_agent_run_id: "run-1" },
    });

    await expect(tools.open_gap.handler({ title: "Weak proof", severity: "medium", affected_sections: [], evidence_ids: [] }))
      .resolves.toMatchObject({ structuredContent: { gap_id: "inserted-id" } });
    expect(client.operations.at(-1)).toMatchObject({
      table: "gaps",
      insert: { account_id: "account-1", created_by_agent_run_id: "run-1" },
    });

    await expect(tools.post_insight.handler({ severity: "info", title: "Signal", tags: [], evidence_ids: [] }))
      .resolves.toMatchObject({ structuredContent: { insight_id: "inserted-id" } });
    expect(client.operations.at(-1)).toMatchObject({
      table: "insights",
      insert: { account_id: "account-1", agent_profile_id: "profile-1", agent_run_id: "run-1" },
    });

    await expect(tools.read_competitor_canvas.handler({ competitor_id: "11111111-1111-4111-8111-111111111111" }))
      .resolves.toMatchObject({
        structuredContent: {
          competitor_id: "11111111-1111-4111-8111-111111111111",
          rows: [],
        },
      });
    expect(client.operations.at(-1)).toMatchObject({
      table: "canvas_section_versions",
      filters: [
        ["account_id", "account-1"],
        ["competitor_id", "11111111-1111-4111-8111-111111111111"],
      ],
    });
    await expect(tools.search_web.handler({ query: "Acme pricing" }))
      .resolves.toMatchObject({ structuredContent: { degraded: false, health: "ok" } });
    await expect(tools.firecrawl_scrape.handler({ url: "https://example.com" }))
      .resolves.toMatchObject({ structuredContent: { degraded: false, health: "ok" } });
    expect((tools as unknown as { __feedCalls: Array<Record<string, unknown>> }).__feedCalls).toMatchObject([
      { accountId: "account-1", feedKey: "grok_live_search", query: "Acme pricing" },
      { accountId: "account-1", feedKey: "firecrawl_scrape", companyUrl: "https://example.com" },
    ]);
  });

  it("rejects own-section and evidence guardrail violations inside the tool", async () => {
    const tools = registeredTools(new FakeSupabaseClient().asSupabase());

    await expect(tools.write_section_items.handler({
      section_key: "channels",
      items: [{ text: "Wrong section", confidence: 0.4, evidence_ids: [] }],
      notes: "",
    })).resolves.toMatchObject({ isError: true });

    await expect(tools.write_section_items.handler({
      section_key: "value_propositions",
      items: [{ text: "Unsupported high-confidence claim", confidence: 0.9, evidence_ids: [] }],
      notes: "",
    })).resolves.toMatchObject({ isError: true });
  });

  it("does not register run_skill unless the context allows it", () => {
    const tools = registeredTools(new FakeSupabaseClient().asSupabase());
    expect(tools.run_skill).toBeUndefined();
  });

  it("run_skill enqueues an own-room implemented skill as a durable run + job, once per reply", async () => {
    const client = new FakeSupabaseClient();
    client.tableRows.skill_catalog = [
      { skill_key: "forge.positioning_brief", agent_key: "agent_value_propositions", title: "Positioning brief", implemented: true },
    ];
    client.tableRows.business_context_versions = [
      { id: "ctx-1", company_name: "Acme", website: null, created_at: "2026-01-02T00:00:00Z" },
    ];
    const tools = registeredTools(client.asSupabase(), { allowSkillRuns: true });

    await expect(tools.run_skill.handler({ skill_key: "forge.positioning_brief" }))
      .resolves.toMatchObject({ structuredContent: { run_id: "inserted-id", skill_key: "forge.positioning_brief", status: "queued" } });

    const runInsert = client.operations.find((op) => op.table === "agent_runs" && op.insert);
    expect(runInsert?.insert).toMatchObject({
      account_id: "account-1",
      agent_profile_id: "profile-1",
      run_type: "skill_run",
      trigger_type: "cascade",
      status: "pending",
    });
    const jobInsert = client.operations.find((op) => op.table === "agent_jobs" && op.insert);
    expect(jobInsert?.insert).toMatchObject({
      account_id: "account-1",
      kind: "skill_run",
      status: "queued",
      agent_run_id: "inserted-id",
      payload: { skill_key: "forge.positioning_brief", business_context_version_id: "ctx-1" },
    });

    // One skill run per reply: the second call in the same turn is refused.
    await expect(tools.run_skill.handler({ skill_key: "forge.positioning_brief" }))
      .resolves.toMatchObject({ isError: true });
  });

  it("run_skill refuses other rooms' skills, unimplemented skills, and no-company accounts", async () => {
    const client = new FakeSupabaseClient();
    client.tableRows.skill_catalog = [
      { skill_key: "relay.channel_gap_scan", agent_key: "agent_channels", title: "Channel gap scan", implemented: true },
      { skill_key: "forge.future_skill", agent_key: "agent_value_propositions", title: "Future", implemented: false },
      { skill_key: "forge.positioning_brief", agent_key: "agent_value_propositions", title: "Positioning brief", implemented: true },
    ];
    const tools = registeredTools(client.asSupabase(), { allowSkillRuns: true });

    await expect(tools.run_skill.handler({ skill_key: "relay.channel_gap_scan" }))
      .resolves.toMatchObject({ isError: true });
    await expect(tools.run_skill.handler({ skill_key: "forge.future_skill" }))
      .resolves.toMatchObject({ isError: true });
    // Implemented + own-room, but no analyzed company (empty context chain).
    await expect(tools.run_skill.handler({ skill_key: "forge.positioning_brief" }))
      .resolves.toMatchObject({ isError: true });
    expect(client.operations.some((op) => op.table === "agent_runs" && op.insert)).toBe(false);
  });
});

function registeredTools(client: never, ctxOverrides: Partial<ToolContext> = {}): Record<string, RegisteredTool> {
  const feedCalls: Array<Record<string, unknown>> = [];
  const ctx: ToolContext = {
    accountId: "account-1",
    agentRunId: "run-1",
    ownSectionKey: "value_propositions",
    agentProfileId: "profile-1",
    proposalMode: true,
    ...ctxOverrides,
    feedRunner: {
      async refresh(request: Record<string, unknown>) {
        feedCalls.push(request);
        return {
          health: "ok",
          payload: { cached: true },
          evidence: [{ title: "Cached evidence", sourceType: "website" }],
          metrics: [],
        };
      },
    } as never,
  };
  const server = createBmcServer(client, ctx) as unknown as SdkServerShape;
  const tools = server.instance._registeredTools;
  Object.defineProperty(tools, "__feedCalls", { value: feedCalls });
  return tools;
}

class FakeSupabaseClient {
  public operations: Array<{
    table: string;
    filters: Array<[string, unknown]>;
    insert?: Record<string, unknown>;
  }> = [];

  /** Seed rows per table for reads (maybeSingle / awaited selects). */
  public tableRows: Record<string, Array<Record<string, unknown>>> = {};

  asSupabase(): never {
    return this as never;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  private readonly filters: Array<[string, unknown]> = [];
  private insertValue: Record<string, unknown> | null = null;

  constructor(
    private readonly client: FakeSupabaseClient,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }

  insert(value: Record<string, unknown>): this {
    this.insertValue = value;
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

  in(column: string, values: unknown[]): this {
    this.filters.push([`in:${column}`, values]);
    return this;
  }

  order(): this {
    return this;
  }

  limit(): this {
    this.client.operations.push({ table: this.table, filters: [...this.filters] });
    return this;
  }

  single(): Promise<{ data: { id: string }; error: null }> {
    this.client.operations.push({
      table: this.table,
      filters: [...this.filters],
      insert: this.insertValue ?? undefined,
    });
    return Promise.resolve({ data: { id: "inserted-id" }, error: null });
  }

  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: null }> {
    this.client.operations.push({
      table: this.table,
      filters: [...this.filters],
      insert: this.insertValue ?? undefined,
    });
    return Promise.resolve({ data: this.matchingRows()[0] ?? null, error: null });
  }

  then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void): void {
    this.client.operations.push({
      table: this.table,
      filters: [...this.filters],
      insert: this.insertValue ?? undefined,
    });
    resolve({ data: this.matchingRows(), error: null });
  }

  private matchingRows(): Array<Record<string, unknown>> {
    const rows = this.client.tableRows[this.table] ?? [];
    return rows.filter((row) =>
      this.filters.every(([column, value]) =>
        column.includes(":") || !(column in row) || row[column] === value,
      ),
    );
  }
}
