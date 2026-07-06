import { describe, expect, it } from "vitest";
import { companyKeyOf, computeCompanyScope, normalizeDomain } from "../db/company-scope.js";

const at = (day: number) => `2026-07-${String(day).padStart(2, "0")}T00:00:00Z`;

describe("company scope", () => {
  it("keys companies by domain first, name second", () => {
    expect(normalizeDomain("https://www.salesforce.com/products?x=1")).toBe("salesforce.com");
    expect(normalizeDomain("salesforce.com")).toBe("salesforce.com");
    expect(normalizeDomain("not a url")).toBeNull();
    expect(companyKeyOf("Salesforce, Inc.", "https://salesforce.com")).toBe("salesforce.com");
    // Legal suffixes never split a company's history.
    expect(companyKeyOf("Salesforce, Inc.", null)).toBe(companyKeyOf("Salesforce", null));
  });

  it("returns an empty scope for an account with no contexts", () => {
    expect(computeCompanyScope([])).toEqual({
      activeContextId: null,
      contextIds: [],
      companyKey: null,
      companyName: null,
    });
  });

  it("scopes to the newest company only — the previous company's contexts drop out", () => {
    const scope = computeCompanyScope([
      { id: "tier4", company_name: "Tier 4 Intelligence", website: "https://tier4.example", created_at: at(1) },
      { id: "salesforce", company_name: "Salesforce, Inc.", website: "https://salesforce.com", created_at: at(6) },
    ]);
    expect(scope.activeContextId).toBe("salesforce");
    expect(scope.contextIds).toEqual(["salesforce"]);
    expect(scope.companyKey).toBe("salesforce.com");
    expect(scope.companyName).toBe("Salesforce, Inc.");
  });

  it("keeps a re-analyzed company's full history across an A -> B -> A switch", () => {
    const scope = computeCompanyScope([
      { id: "a1", company_name: "Acme", website: "https://acme.example", created_at: at(1) },
      { id: "b1", company_name: "Beta Corp", website: "https://beta.example", created_at: at(3) },
      { id: "a2", company_name: "Acme Inc.", website: "https://www.acme.example", created_at: at(5) },
    ]);
    expect(scope.activeContextId).toBe("a2");
    // Newest-first, both Acme eras, Beta excluded.
    expect(scope.contextIds).toEqual(["a2", "a1"]);
  });

  it("assigns anonymous ensure-contexts to the era they were created in", () => {
    const scope = computeCompanyScope([
      { id: "a1", company_name: "Acme", website: null, created_at: at(1) },
      { id: "anon-a", company_name: null, website: null, created_at: at(2) },
      { id: "b1", company_name: "Beta Corp", website: null, created_at: at(3) },
      { id: "anon-b", company_name: null, website: null, created_at: at(4) },
      { id: "a2", company_name: "Acme", website: null, created_at: at(5) },
      { id: "anon-a2", company_name: null, website: null, created_at: at(6) },
    ]);
    // anon-a rode the first Acme era, anon-a2 rides the current one; anon-b
    // belonged to Beta's era and stays out.
    expect(scope.activeContextId).toBe("anon-a2");
    expect(scope.contextIds).toEqual(["anon-a2", "a2", "anon-a", "a1"]);
    expect(scope.companyKey).toBe("acme");
  });

  it("keeps every context in scope when the account only has anonymous contexts", () => {
    const scope = computeCompanyScope([
      { id: "anon-1", company_name: null, website: null, created_at: at(1) },
      { id: "anon-2", company_name: null, website: null, created_at: at(2) },
    ]);
    expect(scope.activeContextId).toBe("anon-2");
    expect(scope.contextIds).toEqual(["anon-2", "anon-1"]);
    expect(scope.companyKey).toBeNull();
  });
});
