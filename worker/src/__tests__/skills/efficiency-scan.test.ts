import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { parseEfficiencyScanArtifact, runEfficiencyScan } from "../../jobs/skills/efficiency-scan.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient } from "./harness.js";

const COST_ITEMS = [
  "Cloud infrastructure spend on AWS is our largest cost",
  "Manual QA labor across three shifts",
];

const EXCERPTS = [
  "Mid-size robotics teams adopting CloudTrim report 30% lower AWS bills within a quarter of rollout.",
  "Factories using AutoInspect AI have cut manual QA labor hours by half, according to published adopter case studies.",
];

function feedFixtures() {
  return makeFakeFeedRunner({
    "efficiency_scan:": [{
      title: "Cloud cost optimization vendors",
      excerpt: EXCERPTS[0],
      sourceType: "social",
      sourceName: "Web Search",
      sourceUrl: "https://industry.example/cloud-cost-tools",
    }, {
      title: "QA automation adoption report",
      excerpt: EXCERPTS[1],
      sourceType: "social",
      sourceName: "Web Search",
      // No sourceUrl — the skill must fall back to the feed name.
    }],
  });
}

function scanOutput(): string {
  return JSON.stringify({
    rows: [{
      cost_driver: COST_ITEMS[0],
      vendor: "CloudTrim",
      impact_score: 4,
      expected_impact: "Adopters report 30% lower AWS bills, directly attacking our largest cost line.",
      evidence_quote: "CloudTrim report 30% lower AWS bills",
    }, {
      // Deliberately listed second with the HIGHER score — the parser must
      // rank it first.
      cost_driver: COST_ITEMS[1],
      vendor: "AutoInspect AI",
      impact_score: 5,
      expected_impact: "Case studies show QA labor hours cut in half, our second-largest driver.",
      evidence_quote: "AutoInspect AI have cut manual QA labor hours by half",
    }],
    body_md: "## Efficiency scan\nQA automation is the biggest lever.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addOwnSection("cost_structure", [
    { text: COST_ITEMS[0], evidence_ids: ["ev-own-cost"] },
    { text: COST_ITEMS[1], evidence_ids: [] },
  ]);
}

function makeHandler(client: SkillFakeClient, runner: ScriptedSkillRunner): SkillRunHandler {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner,
    feedRunner: feedFixtures(),
  });
}

describe("ledger.efficiency_scan", () => {
  it("ranks vendor candidates against our named cost drivers and writes a verified artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(scanOutput(), JSON.stringify({ status: "confirmed", reason: "excerpt names the vendor and the saving" }));
    await makeHandler(client, runner).runSkillModule(runEfficiencyScan, makeSkillJob("ledger.efficiency_scan"));

    // Every excerpt fed to the model landed on the evidence ledger first.
    expect(client.inserts.filter((entry) => entry.table === "evidence_items")).toHaveLength(2);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "ledger.efficiency_scan",
      title: "Efficiency scan — 2 vendor candidates across 2 cost drivers",
      // Feed excerpts plus the own cost items the rows are grounded in.
      evidence_ids: ["evidence-1", "ev-own-cost"],
    });
    const payload = artifact?.values.payload as {
      rows: Array<Record<string, unknown>>;
      spot_check: Record<string, unknown>;
    };
    expect(payload.rows).toHaveLength(2);
    // Ranked: the impact-5 row leads even though the model listed it second.
    expect(payload.rows[0]).toMatchObject({ vendor: "AutoInspect AI", cost_driver: COST_ITEMS[1], impact_score: 5 });
    expect(payload.rows[1]).toMatchObject({ vendor: "CloudTrim", cost_driver: COST_ITEMS[0], impact_score: 4 });
    expect(payload.spot_check).toEqual({ checked: 2, confirmed: 2 });
    // Our cost drivers reach the prompt verbatim as the targets.
    expect(runner.requests[0]?.prompt).toContain(COST_ITEMS[0]);
    expect(runner.requests[0]?.prompt).toContain(COST_ITEMS[1]);
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({
        status: "completed",
        output: { skill_key: "ledger.efficiency_scan", rows: 2, cost_drivers_covered: 2, spot_check_confirmed: 2 },
      });
  });

  it("scopes the feed cache key to the analyzed company and queries with our cost driver texts", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(scanOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    const seen: Array<{ cacheKey: string; query: string }> = [];
    const inner = feedFixtures() as { refresh(request: { cacheKey?: string; feedKey: string; query?: string }): Promise<unknown> };
    const spyingFeedRunner = {
      async refresh(request: { cacheKey?: string; feedKey: string; query?: string }) {
        seen.push({ cacheKey: request.cacheKey ?? "", query: request.query ?? "" });
        return inner.refresh(request);
      },
    } as never;
    const handler = new SkillRunHandler({ client: client.asSupabase(), runner, feedRunner: spyingFeedRunner });
    await handler.runSkillModule(runEfficiencyScan, makeSkillJob("ledger.efficiency_scan"));
    // Without the company slug, switching companies within the feed TTL would
    // serve the previous company's cached vendor excerpts.
    expect(seen).toHaveLength(1);
    expect(seen[0]?.cacheKey).toBe("efficiency_scan:account-1:acme-robotics");
    expect(seen[0]?.query).toBe(`${COST_ITEMS[0]}; ${COST_ITEMS[1]} software vendors tools reduce cost`);
  });

  it("never lets the previous company's cost items reach the prompt or the feed query", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER cost_structure row from the ctx-0 era.
    client.addTrapRow("cost_structure", "Stale old-company cost line");
    const runner = new ScriptedSkillRunner(scanOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    const seen: string[] = [];
    const inner = feedFixtures() as { refresh(request: { cacheKey?: string; feedKey: string; query?: string }): Promise<unknown> };
    const spyingFeedRunner = {
      async refresh(request: { cacheKey?: string; feedKey: string; query?: string }) {
        seen.push(request.query ?? "");
        return inner.refresh(request);
      },
    } as never;
    const handler = new SkillRunHandler({ client: client.asSupabase(), runner, feedRunner: spyingFeedRunner });
    await handler.runSkillModule(runEfficiencyScan, makeSkillJob("ledger.efficiency_scan"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain(COST_ITEMS[0]);
    expect(mainPrompt).not.toContain("Stale old-company cost line");
    expect(seen[0]).not.toContain("Stale old-company cost line");
  });

  it("fails honestly when no company has been analyzed — no artifact, no model call", async () => {
    const client = new SkillFakeClient();
    // No contexts at all: scope.companyName resolves to null.
    client.contexts = [];
    const runner = new ScriptedSkillRunner(scanOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runEfficiencyScan, makeSkillJob("ledger.efficiency_scan")))
      .rejects.toThrow("efficiency_scan requires an analyzed company first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when our Cost Structure canvas is empty — no artifact, no model call", async () => {
    const client = new SkillFakeClient();
    // Active company exists, but no cost_structure items were ever written.
    const runner = new ScriptedSkillRunner(scanOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runEfficiencyScan, makeSkillJob("ledger.efficiency_scan")))
      .rejects.toThrow("efficiency_scan requires our Cost Structure canvas items first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when the feed returns no vendor evidence", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(scanOutput(), "{}");
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runEfficiencyScan, makeSkillJob("ledger.efficiency_scan")))
      .rejects.toThrow(/could not retrieve vendor evidence/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact when a row cites a quote from the model's memory", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // The quote appears in no retrieved excerpt — a memory-cited vendor.
    const runner = new ScriptedSkillRunner(JSON.stringify({
      rows: [{
        cost_driver: COST_ITEMS[0],
        vendor: "GhostSaver Inc",
        impact_score: 5,
        expected_impact: "r",
        evidence_quote: "GhostSaver slashes cloud bills by 90%",
      }],
      body_md: "## Efficiency scan",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runEfficiencyScan, makeSkillJob("ledger.efficiency_scan")))
      .rejects.toThrow("efficiency_scan produced unparseable output; refusing to write an artifact");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("refuses to write an artifact when a row targets a cost driver we never wrote down", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Paraphrased cost driver — not verbatim one of our canvas items.
    const runner = new ScriptedSkillRunner(JSON.stringify({
      rows: [{
        cost_driver: "High AWS spend",
        vendor: "CloudTrim",
        impact_score: 4,
        expected_impact: "r",
        evidence_quote: "CloudTrim report 30% lower AWS bills",
      }],
      body_md: "## Efficiency scan",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runEfficiencyScan, makeSkillJob("ledger.efficiency_scan")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("hard-fails on a contradicted spot-check — no artifact written", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(scanOutput(), JSON.stringify({ status: "contradicted", reason: "the excerpt credits a different vendor" }));
    await expect(makeHandler(client, runner).runSkillModule(runEfficiencyScan, makeSkillJob("ledger.efficiency_scan")))
      .rejects.toThrow(/spot-check contradicted/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("parseEfficiencyScanArtifact", () => {
  it("parses grounded rows and ranks them by impact_score, highest first", () => {
    const parsed = parseEfficiencyScanArtifact(scanOutput(), COST_ITEMS, EXCERPTS);
    expect(parsed?.rows.map((row) => row.vendor)).toEqual(["AutoInspect AI", "CloudTrim"]);
    expect(parsed?.rows.map((row) => row.impact_score)).toEqual([5, 4]);
    expect(parsed?.bodyMd).toContain("Efficiency scan");
  });

  it("rejects the WHOLE parse when any row's quote is not a substring of an excerpt", () => {
    const mixed = JSON.stringify({
      rows: [{
        cost_driver: COST_ITEMS[0],
        vendor: "CloudTrim",
        impact_score: 4,
        expected_impact: "r",
        evidence_quote: "CloudTrim report 30% lower AWS bills",
      }, {
        cost_driver: COST_ITEMS[1],
        vendor: "GhostSaver Inc",
        impact_score: 5,
        expected_impact: "r",
        evidence_quote: "not in any excerpt",
      }],
      body_md: "## Efficiency scan",
    });
    // One ungrounded row poisons the parse — the grounded sibling does NOT survive.
    expect(parseEfficiencyScanArtifact(mixed, COST_ITEMS, EXCERPTS)).toBeNull();
  });

  it("rejects the WHOLE parse when any row invents or paraphrases a cost driver", () => {
    const invented = JSON.stringify({
      rows: [{
        cost_driver: COST_ITEMS[0],
        vendor: "CloudTrim",
        impact_score: 4,
        expected_impact: "r",
        evidence_quote: "CloudTrim report 30% lower AWS bills",
      }, {
        cost_driver: "Office rent",
        vendor: "DeskShare",
        impact_score: 3,
        expected_impact: "r",
        evidence_quote: "AutoInspect AI have cut manual QA labor hours by half",
      }],
      body_md: "## Efficiency scan",
    });
    expect(parseEfficiencyScanArtifact(invented, COST_ITEMS, EXCERPTS)).toBeNull();
    // A cost driver from the previous company's era is equally not ours.
    expect(parseEfficiencyScanArtifact(JSON.stringify({
      rows: [{
        cost_driver: "Stale old-company cost line",
        vendor: "CloudTrim",
        impact_score: 4,
        expected_impact: "r",
        evidence_quote: "CloudTrim report 30% lower AWS bills",
      }],
      body_md: "## Efficiency scan",
    }), COST_ITEMS, EXCERPTS)).toBeNull();
  });

  it("rejects missing fields, empty rows, missing body_md, and non-JSON", () => {
    expect(parseEfficiencyScanArtifact(JSON.stringify({
      rows: [{ cost_driver: COST_ITEMS[0], vendor: "CloudTrim", impact_score: 4, evidence_quote: "CloudTrim report 30% lower AWS bills" }],
      body_md: "## Efficiency scan",
    }), COST_ITEMS, EXCERPTS)).toBeNull();
    expect(parseEfficiencyScanArtifact(JSON.stringify({ rows: [], body_md: "## Efficiency scan" }), COST_ITEMS, EXCERPTS)).toBeNull();
    expect(parseEfficiencyScanArtifact(JSON.stringify({
      rows: [{ cost_driver: COST_ITEMS[0], vendor: "CloudTrim", impact_score: 4, expected_impact: "r", evidence_quote: "CloudTrim report 30% lower AWS bills" }],
    }), COST_ITEMS, EXCERPTS)).toBeNull();
    expect(parseEfficiencyScanArtifact("not json at all", COST_ITEMS, EXCERPTS)).toBeNull();
  });

  it("clamps impact_score to 1-5 and defaults non-numeric scores to 1", () => {
    const parsed = parseEfficiencyScanArtifact(JSON.stringify({
      rows: [{
        cost_driver: COST_ITEMS[0],
        vendor: "CloudTrim",
        impact_score: 9,
        expected_impact: "r",
        evidence_quote: "CloudTrim report 30% lower AWS bills",
      }, {
        cost_driver: COST_ITEMS[1],
        vendor: "AutoInspect AI",
        impact_score: "huge",
        expected_impact: "r",
        evidence_quote: "AutoInspect AI have cut manual QA labor hours by half",
      }],
      body_md: "## Efficiency scan",
    }), COST_ITEMS, EXCERPTS);
    expect(parsed?.rows[0]?.impact_score).toBe(5);
    expect(parsed?.rows[1]?.impact_score).toBe(1);
  });
});
