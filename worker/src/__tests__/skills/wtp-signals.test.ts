import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { parseWtpSignalsArtifact, runWtpSignals, wtpSignalsPrompt } from "../../jobs/skills/wtp-signals.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient } from "./harness.js";

const SEGMENTS = ["Mid-market factory operators", "Robotics hobbyists"];

const EXCERPTS = [
  "Factory operators on the plant-ops forum say Acme Robotics is honestly a bargain for what the arms deliver and they would pay more per cell.",
  "Hobbyist reviewers complain the starter kit is way too expensive for weekend tinkering compared to used units.",
];

function feedFixtures() {
  return makeFakeFeedRunner({
    "wtp_signals:": [{
      title: "Plant-ops forum pricing thread",
      excerpt: EXCERPTS[0],
      sourceType: "social",
      sourceName: "Grok Live Search",
      sourceUrl: "https://forum.example/plant-ops-pricing",
    }, {
      title: "Hobbyist review roundup",
      excerpt: EXCERPTS[1],
      sourceType: "social",
      sourceName: "Grok Live Search",
      // No sourceUrl — the skill must fall back to the feed name.
    }],
  });
}

function signalsOutput(): string {
  return JSON.stringify({
    signals: [{
      segment: SEGMENTS[0],
      signal: "underpriced",
      rationale: "Operators call it a bargain and volunteer they would pay more per cell.",
      evidence_quote: "honestly a bargain for what the arms deliver",
    }, {
      segment: SEGMENTS[1],
      signal: "overpriced",
      rationale: "Hobbyists balk at the starter kit price versus used units.",
      evidence_quote: "the starter kit is way too expensive",
    }],
    body_md: "## Willingness-to-pay signals\nOperators read underpriced; hobbyists read overpriced.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addOwnSection("revenue_streams", [
    { text: "Per-cell subscription at $900/month", evidence_ids: ["ev-own-rs"] },
  ]);
  client.addOwnSection("customer_segments", [
    { text: SEGMENTS[0], evidence_ids: ["ev-own-cs-1"] },
    { text: SEGMENTS[1], evidence_ids: ["ev-own-cs-2"] },
  ]);
}

function makeHandler(client: SkillFakeClient, runner: ScriptedSkillRunner): SkillRunHandler {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner,
    feedRunner: feedFixtures(),
  });
}

describe("yield.wtp_signals", () => {
  it("reads WTP per segment from review evidence and writes a verified artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(signalsOutput(), JSON.stringify({ status: "confirmed", reason: "excerpt supports the read" }));
    await makeHandler(client, runner).runSkillModule(runWtpSignals, makeSkillJob("yield.wtp_signals"));

    // Every excerpt fed to the model landed on the evidence ledger first.
    expect(client.inserts.filter((entry) => entry.table === "evidence_items")).toHaveLength(2);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "yield.wtp_signals",
      title: "Willingness-to-pay signals — 2 segment reads, 2 mispricing flags",
      evidence_ids: ["evidence-1"],
    });
    const payload = artifact?.values.payload as {
      signals: Array<Record<string, unknown>>;
      spot_check: Record<string, unknown>;
    };
    expect(payload.signals).toHaveLength(2);
    expect(payload.signals[0]).toMatchObject({ segment: SEGMENTS[0], signal: "underpriced" });
    expect(payload.signals[1]).toMatchObject({ segment: SEGMENTS[1], signal: "overpriced" });
    expect(payload.spot_check).toEqual({ checked: 2, confirmed: 2 });
    // Both required sections reach the prompt.
    expect(runner.requests[0]?.prompt).toContain("Per-cell subscription at $900/month");
    expect(runner.requests[0]?.prompt).toContain(SEGMENTS[0]);
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({ status: "completed", output: { skill_key: "yield.wtp_signals", segments: 2, flagged: 2, spot_check_confirmed: 2 } });
  });

  it("scopes the feed cache key to the analyzed company so a re-analyzed account never reuses stale review excerpts", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(signalsOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    const seen: string[] = [];
    const inner = feedFixtures() as { refresh(request: { cacheKey?: string; feedKey: string }): Promise<unknown> };
    const spyingFeedRunner = {
      async refresh(request: { cacheKey?: string; feedKey: string }) {
        seen.push(request.cacheKey ?? "");
        return inner.refresh(request);
      },
    } as never;
    const handler = new SkillRunHandler({ client: client.asSupabase(), runner, feedRunner: spyingFeedRunner });
    await handler.runSkillModule(runWtpSignals, makeSkillJob("yield.wtp_signals"));
    // Without the company slug, switching companies within the feed TTL would
    // serve the previous company's cached pricing-review excerpts.
    expect(seen).toEqual(["wtp_signals:account-1:acme-robotics"]);
  });

  it("never lets the previous company's canvas rows reach the prompt", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company traps: NEWER rows from the ctx-0 era in both sections.
    client.addTrapRow("revenue_streams", "Stale old-company revenue text");
    client.addTrapRow("customer_segments", "Stale old-company segment text");
    const runner = new ScriptedSkillRunner(signalsOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    await makeHandler(client, runner).runSkillModule(runWtpSignals, makeSkillJob("yield.wtp_signals"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain("Per-cell subscription at $900/month");
    expect(mainPrompt).toContain(SEGMENTS[0]);
    expect(mainPrompt).not.toContain("Stale old-company revenue text");
    expect(mainPrompt).not.toContain("Stale old-company segment text");
  });

  it("fails honestly when no company has been analyzed — no artifact, no model call", async () => {
    const client = new SkillFakeClient();
    // No contexts at all: scope.companyName resolves to null.
    client.contexts = [];
    const runner = new ScriptedSkillRunner(signalsOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runWtpSignals, makeSkillJob("yield.wtp_signals")))
      .rejects.toThrow("wtp_signals requires an analyzed company first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when our Revenue Streams are empty — before any model call", async () => {
    const client = new SkillFakeClient();
    client.addOwnSection("customer_segments", [{ text: SEGMENTS[0], evidence_ids: [] }]);
    const runner = new ScriptedSkillRunner(signalsOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runWtpSignals, makeSkillJob("yield.wtp_signals")))
      .rejects.toThrow("wtp_signals requires our Revenue Streams canvas items first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when Customer Segments are empty — before any model call", async () => {
    const client = new SkillFakeClient();
    client.addOwnSection("revenue_streams", [{ text: "Per-cell subscription at $900/month", evidence_ids: [] }]);
    const runner = new ScriptedSkillRunner(signalsOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runWtpSignals, makeSkillJob("yield.wtp_signals")))
      .rejects.toThrow("wtp_signals requires Customer Segments canvas items first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when the feed returns no usable review excerpts", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(signalsOutput(), "{}");
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runWtpSignals, makeSkillJob("yield.wtp_signals")))
      .rejects.toThrow(/could not retrieve pricing review evidence/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact when a quote comes from the model's memory instead of the excerpts", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // The second row's quote appears in no retrieved excerpt.
    const runner = new ScriptedSkillRunner(JSON.stringify({
      signals: [{
        segment: SEGMENTS[0],
        signal: "underpriced",
        rationale: "r",
        evidence_quote: "honestly a bargain for what the arms deliver",
      }, {
        segment: SEGMENTS[1],
        signal: "overpriced",
        rationale: "r",
        evidence_quote: "everyone knows the kits cost twice the fair price",
      }],
      body_md: "## Willingness-to-pay signals",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runWtpSignals, makeSkillJob("yield.wtp_signals")))
      .rejects.toThrow("wtp_signals produced unparseable output; refusing to write an artifact");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("skips the verifier honestly when every read is unknown — no fake spot-check pass", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(JSON.stringify({
      signals: SEGMENTS.map((segment) => ({
        segment,
        signal: "unknown",
        rationale: "The excerpts never speak to this segment's price perception.",
        evidence_quote: "honestly a bargain for what the arms deliver",
      })),
      body_md: "## Willingness-to-pay signals\nNo directional read available.",
    }), JSON.stringify({ status: "confirmed", reason: "should never be asked" }));
    await makeHandler(client, runner).runSkillModule(runWtpSignals, makeSkillJob("yield.wtp_signals"));

    // Exactly one model call: the artifact pass. No verify round-trip ran.
    expect(runner.requests).toHaveLength(1);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values.title).toBe("Willingness-to-pay signals — 2 segment reads, 0 mispricing flags");
    expect((artifact?.values.payload as { spot_check: unknown }).spot_check).toEqual({ checked: 0, confirmed: 0 });
  });

  it("hard-fails on a contradicted spot-check — no artifact written", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(signalsOutput(), JSON.stringify({ status: "contradicted", reason: "excerpt reads the opposite direction" }));
    await expect(makeHandler(client, runner).runSkillModule(runWtpSignals, makeSkillJob("yield.wtp_signals")))
      .rejects.toThrow(/spot-check contradicted/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("wtpSignalsPrompt", () => {
  it("carries the company, both sections, and the indexed excerpts", () => {
    const prompt = wtpSignalsPrompt(
      "Acme Robotics",
      [{ sectionKey: "revenue_streams", text: "Per-cell subscription at $900/month", evidenceIds: [] }],
      [{ sectionKey: "customer_segments", text: SEGMENTS[0], evidenceIds: [] }],
      EXCERPTS,
    );
    expect(prompt).toContain("Acme Robotics");
    expect(prompt).toContain("Per-cell subscription at $900/month");
    expect(prompt).toContain(SEGMENTS[0]);
    expect(prompt).toContain(`[0] ${EXCERPTS[0]}`);
    expect(prompt).toContain(`[1] ${EXCERPTS[1]}`);
  });
});

describe("parseWtpSignalsArtifact", () => {
  it("parses a fully grounded per-segment read in canvas order", () => {
    const parsed = parseWtpSignalsArtifact(signalsOutput(), SEGMENTS, EXCERPTS);
    expect(parsed?.signals.map((row) => row.segment)).toEqual(SEGMENTS);
    expect(parsed?.signals.map((row) => row.signal)).toEqual(["underpriced", "overpriced"]);
    expect(parsed?.bodyMd).toContain("Willingness-to-pay signals");
  });

  it("rejects the whole parse when any quote is not a substring of an excerpt", () => {
    const oneInvented = JSON.stringify({
      signals: [{
        segment: SEGMENTS[0],
        signal: "underpriced",
        rationale: "r",
        evidence_quote: "honestly a bargain for what the arms deliver",
      }, {
        segment: SEGMENTS[1],
        signal: "aligned",
        rationale: "r",
        evidence_quote: "not in any excerpt",
      }],
      body_md: "## Willingness-to-pay signals",
    });
    expect(parseWtpSignalsArtifact(oneInvented, SEGMENTS, EXCERPTS)).toBeNull();
  });

  it("rejects invented segments, unknown signal values, and duplicate segment rows", () => {
    const inventedSegment = JSON.stringify({
      signals: [{
        segment: "Enterprise aerospace primes",
        signal: "underpriced",
        rationale: "r",
        evidence_quote: "honestly a bargain for what the arms deliver",
      }],
      body_md: "## Willingness-to-pay signals",
    });
    expect(parseWtpSignalsArtifact(inventedSegment, SEGMENTS, EXCERPTS)).toBeNull();

    const badSignal = JSON.stringify({
      signals: [{
        segment: SEGMENTS[0],
        signal: "sideways",
        rationale: "r",
        evidence_quote: "honestly a bargain for what the arms deliver",
      }],
      body_md: "## Willingness-to-pay signals",
    });
    expect(parseWtpSignalsArtifact(badSignal, [SEGMENTS[0]], EXCERPTS)).toBeNull();

    const duplicate = JSON.stringify({
      signals: [{
        segment: SEGMENTS[0],
        signal: "underpriced",
        rationale: "r",
        evidence_quote: "honestly a bargain for what the arms deliver",
      }, {
        segment: SEGMENTS[0],
        signal: "overpriced",
        rationale: "r",
        evidence_quote: "the starter kit is way too expensive",
      }],
      body_md: "## Willingness-to-pay signals",
    });
    expect(parseWtpSignalsArtifact(duplicate, [SEGMENTS[0]], EXCERPTS)).toBeNull();
  });

  it("rejects a partial read that skips a segment, and missing fields or body", () => {
    const partial = JSON.stringify({
      signals: [{
        segment: SEGMENTS[0],
        signal: "underpriced",
        rationale: "r",
        evidence_quote: "honestly a bargain for what the arms deliver",
      }],
      body_md: "## Willingness-to-pay signals",
    });
    expect(parseWtpSignalsArtifact(partial, SEGMENTS, EXCERPTS)).toBeNull();

    const missingRationale = JSON.stringify({
      signals: [{
        segment: SEGMENTS[0],
        signal: "underpriced",
        evidence_quote: "honestly a bargain for what the arms deliver",
      }],
      body_md: "## Willingness-to-pay signals",
    });
    expect(parseWtpSignalsArtifact(missingRationale, [SEGMENTS[0]], EXCERPTS)).toBeNull();

    const missingBody = JSON.stringify({
      signals: [{
        segment: SEGMENTS[0],
        signal: "underpriced",
        rationale: "r",
        evidence_quote: "honestly a bargain for what the arms deliver",
      }],
    });
    expect(parseWtpSignalsArtifact(missingBody, [SEGMENTS[0]], EXCERPTS)).toBeNull();
  });

  it("rejects non-JSON and non-array signals", () => {
    expect(parseWtpSignalsArtifact("not json at all", SEGMENTS, EXCERPTS)).toBeNull();
    expect(parseWtpSignalsArtifact(JSON.stringify({ signals: "nope", body_md: "x" }), SEGMENTS, EXCERPTS)).toBeNull();
  });
});
