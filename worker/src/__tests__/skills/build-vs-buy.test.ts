import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { parseBuildVsBuyArtifact, runBuildVsBuy, type ActivityExcerpt } from "../../jobs/skills/build-vs-buy.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient } from "./harness.js";
import { SKILL_REGISTRY } from "../../jobs/skills/index.js";

const ACTIVITIES = ["Concierge onboarding", "In-house payroll processing"];

const EXCERPTS: ActivityExcerpt[] = [{
  activity: ACTIVITIES[0],
  excerpt: "Platforms like OnboardKit sell white-glove onboarding as a managed service, but reviewers call the playbooks generic.",
}, {
  activity: ACTIVITIES[1],
  excerpt: "Gusto and Rippling provide payroll processing as a SaaS platform with guided migration off in-house systems.",
}];

function feedFixtures() {
  return makeFakeFeedRunner({
    "build_vs_buy:account-1:concierge-onboarding": [{
      title: "Onboarding services roundup",
      excerpt: EXCERPTS[0].excerpt,
      sourceType: "social",
      sourceName: "Web Search",
      sourceUrl: "https://market.example/onboarding-services",
    }],
    "build_vs_buy:account-1:in-house-payroll-processing": [{
      title: "Payroll platforms compared",
      excerpt: EXCERPTS[1].excerpt,
      sourceType: "social",
      sourceName: "Web Search",
      // No sourceUrl — the skill must fall back to the feed name.
    }],
  });
}

function buildVsBuyOutput(): string {
  return JSON.stringify({
    rows: [{
      activity: ACTIVITIES[0],
      verdict: "keep_in_house",
      market_alternatives: [],
      switching_sketch: null,
      rationale: "Onboarding is the differentiator and the evidenced alternatives read as generic.",
    }, {
      activity: ACTIVITIES[1],
      verdict: "strong_buy_candidate",
      market_alternatives: [{
        name: "Gusto",
        evidence_quote: "Gusto and Rippling provide payroll processing as a SaaS platform",
      }],
      switching_sketch: "Run one parallel payroll cycle on Gusto, then cut over.",
      rationale: "Commodity activity with mature evidenced platforms.",
    }],
    body_md: "## Build vs buy\nPayroll is the clearest buy candidate.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addOwnSection("key_activities", [
    { text: ACTIVITIES[0], evidence_ids: ["ev-own-ka-1"] },
    { text: ACTIVITIES[1], evidence_ids: [] },
  ]);
}

function makeHandler(client: SkillFakeClient, runner: ScriptedSkillRunner): SkillRunHandler {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner,
    feedRunner: feedFixtures(),
  });
}

describe("tempo.build_vs_buy", () => {
  it("is registered in SKILL_REGISTRY so SkillRunHandler can dispatch it", () => {
    expect(SKILL_REGISTRY.get("tempo.build_vs_buy")).toBe(runBuildVsBuy);
  });

  it("classifies activities from feed evidence and writes a verified artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(buildVsBuyOutput(), JSON.stringify({ status: "confirmed", reason: "excerpt names the vendor" }));
    await makeHandler(client, runner).runSkillModule(runBuildVsBuy, makeSkillJob("tempo.build_vs_buy"));

    // Every excerpt fed to the model landed on the evidence ledger first.
    expect(client.inserts.filter((entry) => entry.table === "evidence_items")).toHaveLength(2);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "tempo.build_vs_buy",
      title: "Build vs buy — 2 activities, 1 buy candidate",
      evidence_ids: ["evidence-1"],
    });
    const payload = artifact?.values.payload as { rows: Array<Record<string, unknown>>; spot_check: Record<string, unknown> };
    expect(payload.rows).toHaveLength(2);
    expect(payload.rows[0]).toMatchObject({ activity: ACTIVITIES[0], verdict: "keep_in_house", market_alternatives: [], switching_sketch: null });
    expect(payload.rows[1]).toMatchObject({
      activity: ACTIVITIES[1],
      verdict: "strong_buy_candidate",
      market_alternatives: [{ name: "Gusto", evidence_quote: "Gusto and Rippling provide payroll processing as a SaaS platform" }],
    });
    // One evidenced alternative -> one verifier spot-check.
    expect(payload.spot_check).toEqual({ checked: 1, confirmed: 1 });
    expect(artifact?.values.inputs).toEqual({ sections: ["key_activities"], activities_scanned: 2, evidence_excerpts: 2 });
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({ status: "completed", output: { skill_key: "tempo.build_vs_buy", activities: 2, buy_candidates: 1, spot_check_confirmed: 1 } });
  });

  it("never lets the previous company's key activities reach the prompt", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER key_activities row from the ctx-0 era.
    client.addTrapRow("key_activities", "Stale old-company text");
    const runner = new ScriptedSkillRunner(buildVsBuyOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    await makeHandler(client, runner).runSkillModule(runBuildVsBuy, makeSkillJob("tempo.build_vs_buy"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain("Concierge onboarding");
    expect(mainPrompt).not.toContain("Stale old-company text");
  });

  it("fails honestly when the Key Activities section is empty — no artifact, no model call", async () => {
    const client = new SkillFakeClient();
    const runner = new ScriptedSkillRunner(buildVsBuyOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runBuildVsBuy, makeSkillJob("tempo.build_vs_buy")))
      .rejects.toThrow(/requires our Key Activities canvas items first/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when no activity produced any market evidence", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(buildVsBuyOutput(), "{}");
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runBuildVsBuy, makeSkillJob("tempo.build_vs_buy")))
      .rejects.toThrow(/could not retrieve market evidence for any activity/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact from invented model output", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // An activity the canvas never listed plus a memory-cited alternative —
    // every row must die in the parser.
    const runner = new ScriptedSkillRunner(JSON.stringify({
      rows: [{
        activity: "Invented data labeling pipeline",
        verdict: "strong_buy_candidate",
        market_alternatives: [{ name: "GhostVendor", evidence_quote: "GhostVendor dominates the labeling market" }],
        switching_sketch: "Just switch.",
        rationale: "r",
      }],
      body_md: "## Build vs buy",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runBuildVsBuy, makeSkillJob("tempo.build_vs_buy")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("hard-fails on a contradicted spot-check — no artifact written", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(buildVsBuyOutput(), JSON.stringify({ status: "contradicted", reason: "excerpt names a different vendor" }));
    await expect(makeHandler(client, runner).runSkillModule(runBuildVsBuy, makeSkillJob("tempo.build_vs_buy")))
      .rejects.toThrow(/spot-check contradicted/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("parseBuildVsBuyArtifact", () => {
  it("parses a grounded read and keeps only excerpt-quoted alternatives", () => {
    const parsed = parseBuildVsBuyArtifact(buildVsBuyOutput(), ACTIVITIES, EXCERPTS);
    expect(parsed?.rows.map((row) => row.activity)).toEqual(ACTIVITIES);
    expect(parsed?.rows[1]?.market_alternatives).toHaveLength(1);
    expect(parsed?.bodyMd).toContain("Build vs buy");
  });

  it("downgrades a buy verdict to keep_in_house when no alternative survives the quote gate", () => {
    const parsed = parseBuildVsBuyArtifact(JSON.stringify({
      rows: [{
        activity: ACTIVITIES[1],
        verdict: "strong_buy_candidate",
        // The quote lives in the OTHER activity's excerpt — cross-cited
        // evidence must not support a buy recommendation.
        market_alternatives: [{ name: "OnboardKit", evidence_quote: "Platforms like OnboardKit sell white-glove onboarding" }],
        switching_sketch: "Migrate next quarter.",
        rationale: "r",
      }],
      body_md: "## Build vs buy",
    }), ACTIVITIES, EXCERPTS);
    expect(parsed?.rows[0]).toMatchObject({
      activity: ACTIVITIES[1],
      verdict: "keep_in_house",
      market_alternatives: [],
      switching_sketch: null,
    });
  });

  it("drops invented activities, unknown verdicts, and duplicates", () => {
    const parsed = parseBuildVsBuyArtifact(JSON.stringify({
      rows: [{
        activity: "Invented activity",
        verdict: "keep_in_house",
        market_alternatives: [],
        switching_sketch: null,
        rationale: "r",
      }, {
        activity: ACTIVITIES[0],
        verdict: "outsource_everything",
        market_alternatives: [],
        switching_sketch: null,
        rationale: "r",
      }, {
        activity: ACTIVITIES[1],
        verdict: "consider_buying",
        market_alternatives: [{ name: "Gusto", evidence_quote: "provide payroll processing as a SaaS platform" }],
        switching_sketch: "Pilot one payroll run.",
        rationale: "r",
      }, {
        activity: ACTIVITIES[1],
        verdict: "keep_in_house",
        market_alternatives: [],
        switching_sketch: null,
        rationale: "duplicate row",
      }],
      body_md: "## Build vs buy",
    }), ACTIVITIES, EXCERPTS);
    expect(parsed?.rows).toHaveLength(1);
    expect(parsed?.rows[0]).toMatchObject({ activity: ACTIVITIES[1], verdict: "consider_buying" });
  });

  it("returns null when no row survives, body_md is missing, or the text is not JSON", () => {
    expect(parseBuildVsBuyArtifact(JSON.stringify({
      rows: [{ activity: "Invented activity", verdict: "keep_in_house", market_alternatives: [], switching_sketch: null, rationale: "r" }],
      body_md: "## Build vs buy",
    }), ACTIVITIES, EXCERPTS)).toBeNull();
    expect(parseBuildVsBuyArtifact(JSON.stringify({
      rows: [{ activity: ACTIVITIES[0], verdict: "keep_in_house", market_alternatives: [], switching_sketch: null, rationale: "r" }],
    }), ACTIVITIES, EXCERPTS)).toBeNull();
    expect(parseBuildVsBuyArtifact("not json at all", ACTIVITIES, EXCERPTS)).toBeNull();
  });
});
