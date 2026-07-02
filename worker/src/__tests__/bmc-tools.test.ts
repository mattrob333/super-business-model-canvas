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

    await expect(tools.read_competitor_canvas.handler({ competitor_id: "competitor-1" }))
      .resolves.toMatchObject({ structuredContent: { items: [] } });
    await expect(tools.search_web.handler({ query: "Acme pricing" }))
      .resolves.toMatchObject({ structuredContent: { degraded: true } });
    await expect(tools.firecrawl_scrape.handler({ url: "https://example.com" }))
      .resolves.toMatchObject({ structuredContent: { degraded: true } });
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
});

function registeredTools(client: never): Record<string, RegisteredTool> {
  const ctx: ToolContext = {
    accountId: "account-1",
    agentRunId: "run-1",
    ownSectionKey: "value_propositions",
    agentProfileId: "profile-1",
    proposalMode: true,
  };
  const server = createBmcServer(client, ctx) as unknown as SdkServerShape;
  return server.instance._registeredTools;
}

class FakeSupabaseClient {
  public operations: Array<{
    table: string;
    filters: Array<[string, unknown]>;
    insert?: Record<string, unknown>;
  }> = [];

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

  then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void): void {
    resolve({ data: [], error: null });
  }
}
