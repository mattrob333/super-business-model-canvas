import type { SupabaseClient } from "@supabase/supabase-js";

export type BrainSource =
  | "user_stated"
  | "user_override"
  | "scraped"
  | `mcp_pull:${string}`
  | `workflow:${string}`;

export type BrainConfidence = "high" | "medium" | "low";

export interface BrainVariable {
  id: string;
  account_id: string;
  /** Company era the value belongs to ('' when the account has no named company). */
  company_key: string;
  path: string;
  value: unknown;
  confidence: BrainConfidence;
  source: BrainSource;
  source_artifact: string | null;
  staleness_policy: string | null;
  updated_at: string;
  created_at: string;
}

export interface BrainVariableWrite {
  path: string;
  value: unknown;
  confidence: BrainConfidence;
  stalenessPolicy?: string | null;
}

export interface BrainReadOptions {
  prefix?: string;
  paths?: string[];
}

export interface BrainWriteOptions {
  source: BrainSource;
  sourceArtifact?: string | null;
}

export interface BrainConflict {
  path: string;
  existing: BrainVariable;
  incoming: BrainVariableWrite & { source: BrainSource };
  contradictionPath: string;
}

export interface BrainHistoryRow extends BrainVariable {
  variable_id: string;
  change_reason: "initial" | "update" | "user_override" | "contradiction_resolution";
}

export interface BrainWriteResult {
  variables: BrainVariable[];
  contradictions: BrainConflict[];
  history: BrainHistoryRow[];
}

function assertNoError(error: { message: string } | null, operation: string): void {
  if (error) throw new Error(`BrainStore ${operation} failed: ${error.message}`);
}

/**
 * Read company-scoped brain variables. The company key is REQUIRED (owner bug
 * 2026-07-15: account-wide reads fed Wesco's canvas into an AcquiPortal
 * positioning run) — pass CompanyScope.companyKey; null means the account has
 * no named company and maps to the '' bucket.
 */
export async function readVariables(
  client: SupabaseClient,
  accountId: string,
  companyKey: string | null,
  options: BrainReadOptions = {},
): Promise<BrainVariable[]> {
  let query = client
    .from("brain_variables")
    .select("*")
    .eq("account_id", accountId)
    .eq("company_key", companyKey ?? "");
  if (options.prefix !== undefined) query = query.like("path", `${options.prefix}%`);
  if (options.paths !== undefined) query = query.in("path", options.paths);

  const { data, error } = await query.order("path", { ascending: true });
  assertNoError(error, "read");
  return (data ?? []) as BrainVariable[];
}

/**
 * Atomically apply trust ordering, upsert accepted variables, and append history.
 * The service-role-only SQL RPC is one database transaction and one network round trip.
 */
export async function writeVariables(
  client: SupabaseClient,
  accountId: string,
  companyKey: string | null,
  writes: BrainVariableWrite[],
  options: BrainWriteOptions,
): Promise<BrainWriteResult> {
  if (writes.length === 0) return { variables: [], contradictions: [], history: [] };

  const { data, error } = await client.rpc("write_brain_variables", {
    p_account_id: accountId,
    p_writes: writes.map((write) => ({
      path: write.path,
      value: write.value,
      confidence: write.confidence,
      staleness_policy: write.stalenessPolicy ?? null,
    })),
    p_source: options.source,
    p_source_artifact: options.sourceArtifact ?? null,
    p_company_key: companyKey ?? "",
  });
  assertNoError(error, "write");

  const result = asRecord(data);
  return {
    variables: asArray(result.variables) as BrainVariable[],
    contradictions: asArray(result.contradictions) as BrainConflict[],
    history: asArray(result.history) as BrainHistoryRow[],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
