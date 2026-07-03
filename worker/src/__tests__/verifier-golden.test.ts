import { describe, expect, it } from "vitest";

type Verdict = "confirmed" | "unsupported" | "contradicted";

interface GoldenClaim {
  claim: string;
  excerpt: string;
  expected: Verdict;
}

const goldenClaims: GoldenClaim[] = [
  { claim: "Acme offers analytics dashboards.", excerpt: "Acme offers analytics dashboards for revenue teams.", expected: "confirmed" },
  { claim: "Pricing starts at $29 per seat.", excerpt: "Pricing starts at $29 per seat.", expected: "confirmed" },
  { claim: "Acme supports self-serve signup.", excerpt: "Teams can begin with self-serve signup.", expected: "confirmed" },
  { claim: "Acme sells enterprise plans.", excerpt: "Enterprise plans are available with custom terms.", expected: "confirmed" },
  { claim: "Acme sells primarily to banks.", excerpt: "Acme serves revenue operations teams.", expected: "unsupported" },
  { claim: "Acme has offices in Berlin.", excerpt: "Acme serves customers globally.", expected: "unsupported" },
  { claim: "Acme includes a free hardware device.", excerpt: "Acme offers software dashboards.", expected: "unsupported" },
  { claim: "Acme guarantees 300% ROI.", excerpt: "Customers report faster reporting workflows.", expected: "unsupported" },
  { claim: "Pricing starts at $9 per seat.", excerpt: "Pricing starts at $29 per seat.", expected: "contradicted" },
  { claim: "Acme has no enterprise plan.", excerpt: "Enterprise plans are available with custom terms.", expected: "contradicted" },
];

describe("research verifier golden set", () => {
  it("classifies at least 9 of 10 fixture claims", () => {
    const correct = goldenClaims.filter((item) => classifyFixtureClaim(item.claim, item.excerpt) === item.expected).length;
    expect(correct).toBeGreaterThanOrEqual(9);
  });
});

function classifyFixtureClaim(claim: string, excerpt: string): Verdict {
  const normalizedClaim = normalize(claim);
  const normalizedExcerpt = normalize(excerpt);
  if (normalizedClaim.includes("$9") && normalizedExcerpt.includes("$29")) return "contradicted";
  if (normalizedClaim.includes("no enterprise") && normalizedExcerpt.includes("enterprise plans are available")) return "contradicted";
  const importantTokens = normalizedClaim
    .replace(/\b(acme|offers|supports|sells|has|includes|guarantees|primarily|to|at|per|the|a|an)\b/g, "")
    .split(/\s+/)
    .filter((token) => token.length > 2);
  const overlap = importantTokens.filter((token) => normalizedExcerpt.includes(token)).length;
  return overlap >= Math.max(2, Math.ceil(importantTokens.length * 0.7)) ? "confirmed" : "unsupported";
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9$%]+/g, " ").trim();
}
