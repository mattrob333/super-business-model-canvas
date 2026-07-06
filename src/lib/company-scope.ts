import { supabase } from "@/integrations/supabase/client";

/**
 * Company scoping: one account holds many companies over time (each URL/deck
 * analysis bridges a new business_context_versions row), but every versioned
 * table used to be read account-wide — so opening Salesforce still surfaced
 * Tier4's canvas rows, gaps, competitors and briefings (owner bug 2026-07-06).
 *
 * business_context_versions rows partition the account into company "eras".
 * The ACTIVE company is whichever company the newest context belongs to; its
 * scope is the set of ALL context ids for that same company (domain match
 * first, name match second), so re-analyzing a company extends its history.
 * Anonymous contexts ("Initial business context" ensure-rows) inherit the
 * company of the nearest older named context.
 *
 * Mirror of worker/src/db/company-scope.ts — keep the two in sync.
 */

export interface CompanyScope {
  /** Newest context id, or null when the account has no contexts at all. */
  activeContextId: string | null;
  /** Every context id belonging to the active company (its full history). */
  contextIds: string[];
  /** Stable identity key for the active company (domain else name), null if anonymous. */
  companyKey: string | null;
  companyName: string | null;
}

interface ContextRowLike {
  id: string;
  company_name: string | null;
  website: string | null;
  created_at: string;
}

export function normalizeDomain(website: string | null | undefined): string | null {
  if (typeof website !== "string" || !website.trim()) return null;
  const trimmed = website.trim().toLowerCase();
  const withoutProtocol = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const host = withoutProtocol.split(/[/?#]/)[0].replace(/^www\./, "").replace(/:\d+$/, "");
  return host.includes(".") ? host : null;
}

export function normalizeCompanyName(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null;
  const normalized = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|gmbh|sa|plc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

export function companyKeyOf(name: string | null | undefined, website: string | null | undefined): string | null {
  return normalizeDomain(website) ?? normalizeCompanyName(name);
}

function sameCompany(a: ContextRowLike, b: ContextRowLike): boolean {
  const domainA = normalizeDomain(a.website);
  const domainB = normalizeDomain(b.website);
  if (domainA && domainB) return domainA === domainB;
  const nameA = normalizeCompanyName(a.company_name);
  const nameB = normalizeCompanyName(b.company_name);
  return Boolean(nameA && nameB && nameA === nameB);
}

function isNamed(row: ContextRowLike): boolean {
  return companyKeyOf(row.company_name, row.website) !== null;
}

export function computeCompanyScope(rows: ContextRowLike[]): CompanyScope {
  if (rows.length === 0) {
    return { activeContextId: null, contextIds: [], companyKey: null, companyName: null };
  }
  const byNewest = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const active = byNewest[0];
  const activeNamed = byNewest.find(isNamed) ?? null;

  if (!activeNamed) {
    return {
      activeContextId: active.id,
      contextIds: byNewest.map((row) => row.id),
      companyKey: null,
      companyName: null,
    };
  }

  const byOldest = [...byNewest].reverse();
  const firstNamed = byOldest.find(isNamed) as ContextRowLike;
  let currentEra: ContextRowLike = firstNamed;
  const contextIds: string[] = [];
  for (const row of byOldest) {
    if (isNamed(row)) currentEra = row;
    if (sameCompany(currentEra, activeNamed)) contextIds.push(row.id);
  }
  contextIds.reverse();

  return {
    activeContextId: active.id,
    contextIds,
    companyKey: companyKeyOf(activeNamed.company_name, activeNamed.website),
    companyName: activeNamed.company_name,
  };
}

// Short-lived cache: a page render fans out to many scoped readers (canvas,
// gaps, competitors, artifacts, Atlas dock) — they should share one query.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { scope: CompanyScope; at: number; inflight?: Promise<CompanyScope> }>();

export function invalidateCompanyScope(accountId?: string): void {
  if (accountId) cache.delete(accountId);
  else cache.clear();
}

export async function loadCompanyScope(accountId: string): Promise<CompanyScope> {
  const cached = cache.get(accountId);
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.inflight ?? cached.scope;
  }

  const inflight = (async () => {
    const { data, error } = await supabase
      .from("business_context_versions")
      .select("id, company_name, website, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(`Failed to load company scope: ${error.message}`);
    const scope = computeCompanyScope((data ?? []) as ContextRowLike[]);
    cache.set(accountId, { scope, at: Date.now() });
    return scope;
  })();
  cache.set(accountId, {
    scope: cached?.scope ?? { activeContextId: null, contextIds: [], companyKey: null, companyName: null },
    at: now,
    inflight,
  });
  try {
    return await inflight;
  } catch (error) {
    cache.delete(accountId);
    throw error;
  }
}
