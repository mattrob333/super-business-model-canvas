import type { AgentRunRequest, AgentRunResult, AgentRunner } from "../../agent/runner.js";
import type { AgentJob } from "../../queue/types.js";

/**
 * Shared harness for standalone skill-module tests (Phase G). One
 * scope-aware fake per suite would mean six divergent copies — this is the
 * single source. The fake HONORS `.in(business_context_version_id)` the way
 * postgrest would, and the fixtures deliberately plant a NEWER row from a
 * previous company era (ctx-0): if a skill's query forgets company scoping,
 * the trap row wins latest-per-section and assertions catch it.
 */

export class ScriptedSkillRunner implements AgentRunner {
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

export function makeSkillJob(skillKey: string, over: Partial<AgentJob> = {}): AgentJob {
  return {
    id: "job-1", account_id: "account-1", kind: "skill_run",
    payload: { skill_key: skillKey },
    status: "running", attempts: 1, max_attempts: 3, agent_run_id: "run-1",
    parent_run_id: null, cascade_run_id: null, claimed_by: "w",
    locked_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(),
    run_after: new Date().toISOString(), last_error: null, created_at: new Date().toISOString(),
    ...over,
  };
}

export class SkillFakeClient {
  public inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  public updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  // Two company eras on one account: ctx-1 (Acme) is active; ctx-0 belongs to
  // the previously analyzed company and must never reach a skill.
  public contexts: Array<Record<string, unknown>> = [
    { id: "ctx-1", company_name: "Acme Robotics", website: null, created_at: "2026-07-03T00:00:00Z" },
    { id: "ctx-0", company_name: "Old Ventures", website: "https://old.example", created_at: "2026-06-01T00:00:00Z" },
  ];
  public ownRows: Array<Record<string, unknown>> = [];
  public competitorRows: Array<Record<string, unknown>> = [];

  /** Convenience: add a latest own-canvas row for the ACTIVE company. */
  addOwnSection(sectionKey: string, items: Array<Record<string, unknown> | string>): void {
    this.ownRows.push({
      section_key: sectionKey,
      business_context_version_id: "ctx-1",
      competitor_id: null,
      items,
      created_at: "2026-07-04",
    });
  }

  /** Convenience: add competitor-canvas items for the ACTIVE company. */
  addCompetitorSection(sectionKey: string, competitorName: string, items: Array<Record<string, unknown> | string>): void {
    this.competitorRows.push({
      section_key: sectionKey,
      business_context_version_id: "ctx-1",
      competitor_id: "comp-1",
      companies: { name: competitorName },
      items,
      created_at: "2026-07-04",
    });
  }

  /** The cross-company trap: a NEWER row from the previous company's era. */
  addTrapRow(sectionKey: string, text: string): void {
    this.ownRows.push({
      section_key: sectionKey,
      business_context_version_id: "ctx-0",
      competitor_id: null,
      items: [{ text, evidence_ids: [] }],
      created_at: "2026-07-05",
    });
  }

  asSupabase(): never { return this as never; }
  from(table: string): SkillFakeQuery { return new SkillFakeQuery(this, table); }
}

export class SkillFakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private operation: "select" | "insert" | "update" = "select";
  private values: Record<string, unknown> = {};
  private filters: Array<{ op: string; column: string; value: unknown }> = [];
  constructor(private readonly client: SkillFakeClient, private readonly table: string) {}
  select(): this { return this; }
  insert(values: Record<string, unknown>): this { this.operation = "insert"; this.values = values; return this; }
  update(values: Record<string, unknown>): this { this.operation = "update"; this.values = values; return this; }
  eq(column: string, value: unknown): this { this.filters.push({ op: "eq", column, value }); return this; }
  is(column: string, value: unknown): this { this.filters.push({ op: "is", column, value }); return this; }
  in(column: string, value: unknown): this { this.filters.push({ op: "in", column, value }); return this; }
  like(column: string, value: unknown): this { this.filters.push({ op: "like", column, value }); return this; }
  not(column: string, op: string, value: unknown): this { this.filters.push({ op: `not:${op}`, column, value }); return this; }
  or(): this { return this; }
  order(): this { return this; }
  limit(): this { return this; }
  maybeSingle(): Promise<{ data: unknown; error: null }> {
    const rows = this.resolveSelect();
    return Promise.resolve({ data: Array.isArray(rows) ? rows[0] ?? null : rows, error: null });
  }
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

export interface FakeFeedEvidence {
  title: string;
  excerpt: string;
  sourceType: string;
  sourceName?: string;
  sourceUrl?: string;
}

/** Feed fake: map cacheKey prefixes (or "*" catch-all) to evidence lists. */
export function makeFakeFeedRunner(byPrefix: Record<string, FakeFeedEvidence[]>) {
  return {
    async refresh(request: { cacheKey?: string; feedKey: string }) {
      const key = request.cacheKey ?? request.feedKey;
      const match = Object.entries(byPrefix).find(([prefix]) => prefix === "*" || key.startsWith(prefix));
      if (!match) return { health: "error", payload: {}, evidence: [], metrics: [], error: `no fixture for ${key}` };
      return { health: "ok", payload: {}, evidence: match[1], metrics: [] };
    },
  } as never;
}
