import type { SupabaseClient } from "@supabase/supabase-js";
import { readVariables } from "../db/brain.js";

/**
 * Coverage gap engine v1 (Atlas plan AT-5, spec §2).
 *
 * gap_score = value_weight × urgency ÷ fill_cost — greedy information-gain
 * per user-minute. Pure scoring over the coverage_manifest × the account's
 * brain; the database is the referee (briefing rule B3) and the model never
 * invents coverage numbers.
 *
 * NAMING LAW: everything here says "coverage". The existing `gaps` table and
 * gap_engine job are competitor-gap analysis — a different concept entirely.
 */

export interface CoverageSlot {
  path: string;
  section_key: string | null;
  title: string;
  value_weight: number;
  fill_actions: Array<{ action?: string; prompt?: string; workflow_id?: string }>;
  freshness: string | null;
  sort_order: number;
}

export interface CoverageGap {
  path: string;
  title: string;
  score: number;
  reason: "empty" | "stale";
  cheapestAction: string;
  askPrompt: string | null;
}

export interface CoverageReport {
  total: number;
  filled: number;
  gaps: CoverageGap[];
}

/** Cheapest-first fill costs (named constants — tune deliberately, not inline). */
const FILL_COSTS: Record<string, number> = {
  ask: 1,
  scrape: 3,
  mcp_pull: 3,
  workflow: 8,
};
const UNKNOWN_ACTION_COST = 5;
/** An empty slot is maximally urgent; a stale one matters, but less. */
const EMPTY_URGENCY = 1;
const STALE_URGENCY = 0.4;

function cheapestFillAction(slot: CoverageSlot): { action: string; cost: number; askPrompt: string | null } {
  let best: { action: string; cost: number; askPrompt: string | null } | null = null;
  for (const entry of slot.fill_actions) {
    const action = typeof entry?.action === "string" ? entry.action : "unknown";
    const cost = FILL_COSTS[action] ?? UNKNOWN_ACTION_COST;
    if (!best || cost < best.cost) {
      best = { action, cost, askPrompt: typeof entry?.prompt === "string" ? entry.prompt : null };
    }
  }
  return best ?? { action: "ask", cost: FILL_COSTS.ask, askPrompt: null };
}

function freshnessDays(freshness: string | null): number | null {
  if (!freshness) return null;
  const match = /(\d+)\s*day/i.exec(freshness);
  return match ? Number(match[1]) : null;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export interface CoverageVariable {
  path: string;
  value: unknown;
  updated_at: string;
}

/** Pure scoring — deterministic given slots, variables, and the clock. */
export function scoreCoverage(
  slots: CoverageSlot[],
  variables: CoverageVariable[],
  now: Date = new Date(),
): CoverageReport {
  const byPath = new Map(variables.map((variable) => [variable.path, variable]));
  const gaps: CoverageGap[] = [];
  let filled = 0;

  for (const slot of slots) {
    const variable = byPath.get(slot.path);
    const isFilled = variable !== undefined && hasValue(variable.value);
    if (isFilled) filled += 1;

    let urgency = 0;
    let reason: CoverageGap["reason"] = "empty";
    if (!isFilled) {
      urgency = EMPTY_URGENCY;
    } else {
      const days = freshnessDays(slot.freshness);
      if (days !== null) {
        const ageDays = (now.getTime() - new Date(variable.updated_at).getTime()) / 86_400_000;
        if (ageDays > days) {
          urgency = STALE_URGENCY;
          reason = "stale";
        }
      }
    }
    if (urgency === 0) continue;

    const cheapest = cheapestFillAction(slot);
    gaps.push({
      path: slot.path,
      title: slot.title,
      score: Math.round(((slot.value_weight * urgency) / cheapest.cost) * 100) / 100,
      reason,
      cheapestAction: cheapest.action,
      askPrompt: cheapest.askPrompt,
    });
  }

  gaps.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return { total: slots.length, filled, gaps };
}

/**
 * Load the coverage report for one company (pass CompanyScope.companyKey).
 * Account-specific manifest rows override the global template at the same
 * path (the `account_id is null` seed); the manifest stays account-level —
 * only the VARIABLES that fill it are company-scoped.
 */
export async function loadCoverageReport(
  client: SupabaseClient,
  accountId: string,
  companyKey: string | null,
): Promise<CoverageReport> {
  const { data, error } = await client
    .from("coverage_manifest")
    .select("account_id, path, section_key, title, value_weight, fill_actions, freshness, sort_order")
    .or(`account_id.is.null,account_id.eq.${accountId}`)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Failed to load coverage manifest: ${error.message}`);

  const byPath = new Map<string, CoverageSlot & { account_id: string | null }>();
  for (const raw of (data ?? []) as Array<CoverageSlot & { account_id: string | null }>) {
    const existing = byPath.get(raw.path);
    if (!existing || (existing.account_id === null && raw.account_id !== null)) {
      byPath.set(raw.path, raw);
    }
  }

  const namespaces = new Set([...byPath.keys()].map((path) => `${path.split(".")[0]}.`));
  const variables: CoverageVariable[] = [];
  for (const prefix of namespaces) {
    const rows = await readVariables(client, accountId, companyKey, { prefix });
    variables.push(...rows.map((row) => ({ path: row.path, value: row.value, updated_at: row.updated_at })));
  }

  return scoreCoverage([...byPath.values()], variables);
}
