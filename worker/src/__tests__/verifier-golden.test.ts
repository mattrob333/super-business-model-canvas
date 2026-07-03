import { describe, expect, it } from "vitest";
import { ClaudeAgentRunner, type AgentRunRequest, type AgentRunResult, type AgentRunner } from "../agent/runner.js";
import { verifyClaimAgainstExcerpt, type VerificationStatus } from "../jobs/company-research.js";

/**
 * Verifier golden set — exercises the REAL verification unit
 * (`verifyClaimAgainstExcerpt`): prompt construction, tolerant JSON parsing,
 * and status mapping. Two modes:
 *
 * - Fixture mode (default, CI): a recording runner replays realistic verifier
 *   responses — including fenced and malformed outputs — while asserting the
 *   claim and excerpt actually reached the prompt.
 * - Live mode (opt-in): GOLDEN_LIVE=1 + ANTHROPIC_API_KEY runs the same 10
 *   claims against the real research_verify model and requires >= 9/10.
 *   Run: GOLDEN_LIVE=1 ANTHROPIC_API_KEY=sk-... npx vitest run verifier-golden
 */

interface GoldenClaim {
  claim: string;
  excerpt: string;
  expected: VerificationStatus;
  /** Recorded verifier response replayed in fixture mode. */
  recordedResponse: string;
}

const goldenClaims: GoldenClaim[] = [
  {
    claim: "Acme offers analytics dashboards.",
    excerpt: "Acme offers analytics dashboards for revenue teams.",
    expected: "confirmed",
    recordedResponse: '{"status":"confirmed","reason":"The excerpt states Acme offers analytics dashboards."}',
  },
  {
    claim: "Pricing starts at $29 per seat.",
    excerpt: "Pricing starts at $29 per seat.",
    expected: "confirmed",
    recordedResponse: '```json\n{"status":"confirmed","reason":"Exact pricing match in the excerpt."}\n```',
  },
  {
    claim: "Acme supports self-serve signup.",
    excerpt: "Teams can begin with self-serve signup.",
    expected: "confirmed",
    recordedResponse: '{"status":"confirmed","reason":"Self-serve signup is stated."}',
  },
  {
    claim: "Acme sells enterprise plans.",
    excerpt: "Enterprise plans are available with custom terms.",
    expected: "confirmed",
    recordedResponse: 'Here is my verdict:\n```json\n{"status":"confirmed","reason":"Enterprise plans are available."}\n```',
  },
  {
    claim: "Acme sells primarily to banks.",
    excerpt: "Acme serves revenue operations teams.",
    expected: "unsupported",
    recordedResponse: '{"status":"unsupported","reason":"The excerpt names revenue operations teams, not banks."}',
  },
  {
    claim: "Acme has offices in Berlin.",
    excerpt: "Acme serves customers globally.",
    expected: "unsupported",
    recordedResponse: '{"status":"unsupported","reason":"No office locations are mentioned."}',
  },
  {
    claim: "Acme includes a free hardware device.",
    excerpt: "Acme offers software dashboards.",
    expected: "unsupported",
    recordedResponse: '{"status":"unsupported","reason":"Hardware is never mentioned in the excerpt."}',
  },
  {
    claim: "Acme guarantees 300% ROI.",
    excerpt: "Customers report faster reporting workflows.",
    expected: "unsupported",
    // Malformed on purpose: safeParseVerification must fail closed to unsupported.
    recordedResponse: "I cannot commit to a verdict in JSON form today.",
  },
  {
    claim: "Pricing starts at $9 per seat.",
    excerpt: "Pricing starts at $29 per seat.",
    expected: "contradicted",
    recordedResponse: '{"status":"contradicted","reason":"The excerpt says $29 per seat, not $9."}',
  },
  {
    claim: "Acme has no enterprise plan.",
    excerpt: "Enterprise plans are available with custom terms.",
    expected: "contradicted",
    recordedResponse: '{"status":"contradicted","reason":"The excerpt confirms enterprise plans exist."}',
  },
];

const FIXTURE_ROUTE = {
  model_name: "claude-sonnet-5",
  params: { temperature: 0.1, max_tokens: 2000 },
  cost_per_1k_in: 0.002,
  cost_per_1k_out: 0.01,
};

class RecordingRunner implements AgentRunner {
  public requests: AgentRunRequest[] = [];

  constructor(private readonly responses: string[]) {}

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    this.requests.push(request);
    const resultText = this.responses[this.requests.length - 1];
    if (resultText === undefined) throw new Error("RecordingRunner exhausted");
    return { resultText, sessionId: null, costUsd: null, tokensIn: null, tokensOut: null };
  }
}

describe("research verifier golden set (fixture mode)", () => {
  it("classifies at least 9 of 10 recorded claims through the real verifier unit", async () => {
    const runner = new RecordingRunner(goldenClaims.map((item) => item.recordedResponse));

    let correct = 0;
    for (const [index, item] of goldenClaims.entries()) {
      const verdict = await verifyClaimAgainstExcerpt(runner, FIXTURE_ROUTE, item.claim, item.excerpt);
      if (verdict.status === item.expected) correct += 1;

      // The claim and excerpt must actually reach the real prompt.
      const request = runner.requests[index];
      expect(request?.prompt).toContain(item.claim);
      expect(request?.prompt).toContain(item.excerpt);
      expect(request?.model).toBe(FIXTURE_ROUTE.model_name);
      expect(request?.allowedTools).toEqual([]);
    }

    expect(correct).toBeGreaterThanOrEqual(9);
  });

  it("fails closed: malformed verifier output becomes unsupported, never confirmed", async () => {
    const runner = new RecordingRunner(["Absolutely no JSON here."]);
    const verdict = await verifyClaimAgainstExcerpt(runner, FIXTURE_ROUTE, "Any claim.", "Any excerpt.");
    expect(verdict).toMatchObject({ status: "unsupported", reason: "verifier output unparseable" });
  });
});

const liveMode = process.env.GOLDEN_LIVE === "1" && Boolean(process.env.ANTHROPIC_API_KEY);

describe.runIf(liveMode)("research verifier golden set (live mode)", () => {
  it("classifies at least 9 of 10 claims with the real research_verify model", async () => {
    // Mirrors the seeded global research_verify route (schema.sql §14, task_class rows).
    const runner = new ClaudeAgentRunner();

    let correct = 0;
    const misses: string[] = [];
    for (const item of goldenClaims) {
      const verdict = await verifyClaimAgainstExcerpt(runner, FIXTURE_ROUTE, item.claim, item.excerpt);
      if (verdict.status === item.expected) {
        correct += 1;
      } else {
        misses.push(`"${item.claim}" expected ${item.expected}, got ${verdict.status} (${verdict.reason})`);
      }
    }

    expect(correct, misses.join("\n")).toBeGreaterThanOrEqual(9);
  }, 300_000);
});
