import { describe, expect, it } from "vitest";
import {
  readVariables,
  writeVariables,
  type BrainConfidence,
  type BrainHistoryRow,
  type BrainSource,
  type BrainVariable,
} from "../db/brain.js";

const accountA = "account-a";
const accountB = "account-b";
const wesco = "wesco.com";
const acqui = "acquiportal intelligence arbitrage";

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Array<[string, unknown]> = [];

  constructor(private readonly db: FakeBrainDb) {}

  select(): this { return this; }
  eq(column: string, value: unknown): this { this.filters.push([column, value]); return this; }
  in(column: string, value: unknown): this { this.filters.push([`in:${column}`, value]); return this; }
  like(column: string, value: unknown): this { this.filters.push([`like:${column}`, value]); return this; }
  order(): this { return this; }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const result = this.db.select(this.filters);
    return Promise.resolve(result).then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

interface RpcWrite {
  path: string;
  value: unknown;
  confidence: BrainConfidence;
  staleness_policy: string | null;
}

class FakeBrainDb {
  rows: BrainVariable[] = [];
  history: BrainHistoryRow[] = [];
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  selectCalls: Array<Array<[string, unknown]>> = [];
  private id = 0;

  asSupabase() { return this as never; }
  from(): FakeQuery { return new FakeQuery(this); }

  select(filters: Array<[string, unknown]>) {
    this.selectCalls.push(filters);
    const rows = this.rows.filter((row) => filters.every(([column, value]) => {
      if (column === "account_id") return row.account_id === value;
      if (column === "company_key") return row.company_key === value;
      if (column === "in:path") return (value as string[]).includes(row.path);
      if (column === "like:path") return row.path.startsWith(String(value).replace(/%$/, ""));
      return true;
    }));
    return { data: rows, error: null };
  }

  async rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args });
    const accountId = args.p_account_id as string;
    const companyKey = (args.p_company_key as string | null) ?? "";
    const source = args.p_source as BrainSource;
    const sourceArtifact = args.p_source_artifact as string | null;
    const writes = args.p_writes as RpcWrite[];
    const variables: BrainVariable[] = [];
    const contradictions: unknown[] = [];
    const history: BrainHistoryRow[] = [];

    const find = (path: string) => this.rows.find(
      (row) => row.account_id === accountId && row.company_key === companyKey && row.path === path,
    );

    for (const write of writes) {
      const existing = find(write.path);
      const machine = source === "scraped" || source.startsWith("mcp_pull:") || source.startsWith("workflow:");
      const userExisting = existing?.source === "user_stated" || existing?.source === "user_override";
      const path = existing && userExisting && machine ? `contradiction.${write.path}` : write.path;
      const priorSaved = find(path);
      const now = new Date().toISOString();
      const row: BrainVariable = {
        id: priorSaved?.id ?? `brain-${++this.id}`,
        account_id: accountId,
        company_key: companyKey,
        path,
        value: path.startsWith("contradiction.")
          ? { existing: existing?.value, incoming: write.value, detected_at: now }
          : write.value,
        confidence: write.confidence,
        source,
        source_artifact: sourceArtifact,
        staleness_policy: write.staleness_policy ?? priorSaved?.staleness_policy ?? null,
        updated_at: now,
        created_at: priorSaved?.created_at ?? now,
      };
      const index = this.rows.findIndex(
        (item) => item.account_id === accountId && item.company_key === companyKey && item.path === path,
      );
      if (index === -1) this.rows.push(row); else this.rows[index] = row;
      variables.push(row);
      const changeReason = path.startsWith("contradiction.")
        ? "contradiction_resolution"
        : existing ? (source === "user_stated" || source === "user_override" ? "user_override" : "update") : "initial";
      const historyRow = { ...row, variable_id: row.id, change_reason: changeReason } as BrainHistoryRow;
      this.history.push(historyRow);
      history.push(historyRow);
      if (path.startsWith("contradiction.") && existing) {
        contradictions.push({
          path: write.path,
          existing,
          incoming: { path: write.path, value: write.value, confidence: write.confidence, source },
          contradictionPath: path,
        });
      }
    }

    return { data: { variables, contradictions, history }, error: null };
  }
}

describe("BrainStore", () => {
  it("round-trips a batch through exactly one atomic RPC and appends history", async () => {
    const db = new FakeBrainDb();
    const client = db.asSupabase();
    const result = await writeVariables(client, accountA, wesco, [
      { path: "positioning.one_liner", value: "Fast reporting", confidence: "high" },
      { path: "canvas.customer_segments", value: ["Founders"], confidence: "medium" },
    ], { source: "scraped", sourceArtifact: "run-1" });

    expect(db.rpcCalls).toHaveLength(1);
    expect(db.rpcCalls[0]).toMatchObject({
      name: "write_brain_variables",
      args: { p_account_id: accountA, p_company_key: wesco },
    });
    expect(result.history).toHaveLength(2);
    expect(db.history).toHaveLength(2);
    expect(await readVariables(client, accountA, wesco)).toHaveLength(2);
  });

  it("preserves user truth and creates a machine contradiction with history", async () => {
    const db = new FakeBrainDb();
    const client = db.asSupabase();
    await writeVariables(client, accountA, wesco, [{ path: "positioning.one_liner", value: "User truth", confidence: "high" }], { source: "user_stated" });
    const result = await writeVariables(client, accountA, wesco, [{ path: "positioning.one_liner", value: "Scraped guess", confidence: "medium" }], { source: "scraped" });

    expect(result.contradictions).toHaveLength(1);
    const rows = await readVariables(client, accountA, wesco);
    expect(rows.find((row) => row.path === "positioning.one_liner")?.value).toBe("User truth");
    expect(rows.find((row) => row.path === "contradiction.positioning.one_liner")?.value).toMatchObject({
      existing: "User truth",
      incoming: "Scraped guess",
    });
    expect(db.history.at(-1)?.change_reason).toBe("contradiction_resolution");
  });

  it("allows machine-over-machine replacement and user writes always win", async () => {
    const db = new FakeBrainDb();
    const client = db.asSupabase();
    await writeVariables(client, accountA, wesco, [{ path: "canvas.key_resources", value: "old", confidence: "low" }], { source: "scraped" });
    await writeVariables(client, accountA, wesco, [{ path: "canvas.key_resources", value: "new", confidence: "high" }], { source: "mcp_pull:crm" });
    await writeVariables(client, accountA, wesco, [{ path: "canvas.key_resources", value: "override", confidence: "high" }], { source: "user_override" });
    await writeVariables(client, accountA, wesco, [{ path: "canvas.key_resources", value: "later machine", confidence: "high" }], { source: "workflow:positioning@v1#s1" });

    const rows = await readVariables(client, accountA, wesco);
    expect(rows.find((item) => item.path === "canvas.key_resources")).toMatchObject({ value: "override", source: "user_override" });
    expect(rows.filter((item) => item.path.startsWith("contradiction."))).toHaveLength(1);
  });

  it("isolates reads and writes by account", async () => {
    const db = new FakeBrainDb();
    const client = db.asSupabase();
    await writeVariables(client, accountA, wesco, [{ path: "canvas.channels", value: ["A"], confidence: "high" }], { source: "user_stated" });
    await writeVariables(client, accountB, wesco, [{ path: "canvas.channels", value: ["B"], confidence: "high" }], { source: "user_stated" });

    expect((await readVariables(client, accountA, wesco)).map((row) => row.value)).toEqual([["A"]]);
    expect((await readVariables(client, accountB, wesco)).map((row) => row.value)).toEqual([["B"]]);
    expect(db.selectCalls.every((filters) => filters.some(([column, value]) => column === "account_id" && [accountA, accountB].includes(value as string)))).toBe(true);
  });

  it("isolates companies inside one account — the 2026-07-15 owner bug", async () => {
    const db = new FakeBrainDb();
    const client = db.asSupabase();
    // Same account, same path, two companies: the values must never mix, and
    // a user_stated answer for one company must not shadow the other's.
    await writeVariables(client, accountA, wesco, [{ path: "positioning.one_liner", value: "Wesco line", confidence: "high" }], { source: "user_stated" });
    await writeVariables(client, accountA, acqui, [{ path: "positioning.one_liner", value: "AcquiPortal line", confidence: "medium" }], { source: "workflow:positioning-sprint@v1#s6" });

    expect((await readVariables(client, accountA, wesco)).map((row) => row.value)).toEqual(["Wesco line"]);
    expect((await readVariables(client, accountA, acqui)).map((row) => row.value)).toEqual(["AcquiPortal line"]);
    // The machine write for AcquiPortal did NOT trip a contradiction against
    // Wesco's user_stated value — different company, different brain.
    expect(db.rows.filter((row) => row.path.startsWith("contradiction."))).toHaveLength(0);
    // Null company key maps to the '' bucket and stays isolated too.
    expect(await readVariables(client, accountA, null)).toHaveLength(0);
  });

  it("supports prefix and exact-path reads without dropping account scope", async () => {
    const db = new FakeBrainDb();
    const client = db.asSupabase();
    await writeVariables(client, accountA, wesco, [
      { path: "canvas.channels", value: ["Direct"], confidence: "high" },
      { path: "positioning.one_liner", value: "Focused", confidence: "medium" },
    ], { source: "scraped" });

    expect((await readVariables(client, accountA, wesco, { prefix: "canvas." })).map((row) => row.path)).toEqual(["canvas.channels"]);
    expect((await readVariables(client, accountA, wesco, { paths: ["positioning.one_liner"] })).map((row) => row.path)).toEqual(["positioning.one_liner"]);
  });
});
