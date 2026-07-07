import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { parseMonetizationGapsArtifact, runMonetizationGaps } from "../../jobs/skills/monetization-gaps.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient } from "./harness.js";

const COMPETITOR_ITEMS = [
  { competitor: "RivalCo", text: "RivalCo charges a 2% transaction fee on every marketplace order." },
  { competitor: "RivalCo", text: "RivalCo sells a certification program for power users." },
  { competitor: "StackPay", text: "StackPay offers usage-based API pricing billed per 1,000 calls." },
];

function gapRows(): Array<Record<string, unknown>> {
  return [{
    model: "Transaction fees",
    competitors: [{ competitor: "RivalCo", evidence_quote: "2% transaction fee on every marketplace order" }],
    adoption_rationale: "Our subscription covers access but captures none of the order volume flowing through the product.",
    first_experiment: "Add a 1% fee to the next 50 marketplace orders and measure completion-rate impact.",
  }, {
    model: "Usage-based API pricing",
    competitors: [{ competitor: "StackPay", evidence_quote: "usage-based API pricing billed per 1,000 calls" }],
    adoption_rationale: "Heavy API users pay the same flat $99 as light ones, leaving expansion revenue uncaptured.",
    first_experiment: "Offer metered API pricing to the ten highest-volume accounts as an opt-in pilot.",
  }];
}

function gapsOutput(gaps: Array<Record<string, unknown>> = gapRows()): string {
  return JSON.stringify({
    gaps,
    body_md: "## Monetization gaps\nTransaction fees are the largest missed model.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addOwnSection("revenue_streams", [
    { text: "Flat monthly SaaS subscription at $99", evidence_ids: ["ev-own-rs-1"] },
    { text: "Annual enterprise contracts", evidence_ids: ["ev-own-rs-2"] },
  ]);
  client.addCompetitorSection("revenue_streams", "RivalCo", [
    { text: COMPETITOR_ITEMS[0].text, evidence_ids: ["ev-competitor-rs-1"] },
    { text: COMPETITOR_ITEMS[1].text, evidence_ids: ["ev-competitor-rs-2", "ev-competitor-rs-1"] },
  ]);
  client.addCompetitorSection("revenue_streams", "StackPay", [
    { text: COMPETITOR_ITEMS[2].text, evidence_ids: ["ev-competitor-rs-3"] },
  ]);
}

function makeHandler(client: SkillFakeClient, runner: ScriptedSkillRunner): SkillRunHandler {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner,
    feedRunner: makeFakeFeedRunner({}),
  });
}

describe("yield.monetization_gaps", () => {
  it("ranks missed monetization models with verbatim competitor quotes and writes a typed artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(gapsOutput(), "{}");
    await makeHandler(client, runner).runSkillModule(runMonetizationGaps, makeSkillJob("yield.monetization_gaps"));

    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "yield.monetization_gaps",
      title: "Monetization gaps — 2 missed models, 2 competitors cited",
    });
    const payload = artifact?.values.payload as { gaps: Array<Record<string, unknown>>; verification: string };
    // Canvas-only skill: the payload names the parser gate, never a fake verifier pass.
    expect(payload.verification).toBe("parser_verbatim_competitor_quotes");
    expect(payload.gaps).toHaveLength(2);
    expect(payload.gaps[0]).toMatchObject({
      model: "Transaction fees",
      competitors: [{ competitor: "RivalCo", evidence_quote: "2% transaction fee on every marketplace order" }],
    });
    expect(payload.gaps[1]).toMatchObject({
      model: "Usage-based API pricing",
      competitors: [{ competitor: "StackPay", evidence_quote: "usage-based API pricing billed per 1,000 calls" }],
    });
    // Evidence links are the COMPETITOR items' ids, deduped.
    expect(artifact?.values.evidence_ids).toEqual(["ev-competitor-rs-1", "ev-competitor-rs-2", "ev-competitor-rs-3"]);
    expect(artifact?.values.inputs).toEqual({ sections: ["revenue_streams"], competitor_items: 3 });
    // One model pass on the skill_run route — no verifier call for a canvas-only skill.
    expect(runner.requests).toHaveLength(1);
    expect(runner.requests[0]?.prompt).toContain("Flat monthly SaaS subscription at $99");
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({ status: "completed", output: { skill_key: "yield.monetization_gaps", gaps: 2, competitors_cited: 2 } });
  });

  it("never lets the previous company's revenue items — own or competitor — reach the prompt", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER own revenue_streams row from the ctx-0 era.
    client.addTrapRow("revenue_streams", "Stale old-company text");
    // And a NEWER competitor row from the ctx-0 era.
    client.competitorRows.push({
      section_key: "revenue_streams",
      business_context_version_id: "ctx-0",
      competitor_id: "comp-9",
      companies: { name: "OldRival" },
      items: [{ text: "Stale old-company competitor revenue text", evidence_ids: [] }],
      created_at: "2026-07-05",
    });
    const runner = new ScriptedSkillRunner(gapsOutput(), "{}");
    await makeHandler(client, runner).runSkillModule(runMonetizationGaps, makeSkillJob("yield.monetization_gaps"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain("Flat monthly SaaS subscription at $99");
    expect(mainPrompt).toContain("RivalCo charges a 2% transaction fee");
    expect(mainPrompt).not.toContain("Stale old-company text");
    expect(mainPrompt).not.toContain("Stale old-company competitor revenue text");
    expect(mainPrompt).not.toContain("OldRival");
  });

  it("fails honestly when our Revenue Streams section is empty — no artifact, no model call", async () => {
    const client = new SkillFakeClient();
    client.addCompetitorSection("revenue_streams", "RivalCo", [
      { text: COMPETITOR_ITEMS[0].text, evidence_ids: ["ev-competitor-rs-1"] },
    ]);
    const runner = new ScriptedSkillRunner(gapsOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runMonetizationGaps, makeSkillJob("yield.monetization_gaps")))
      .rejects.toThrow("monetization_gaps requires our Revenue Streams canvas items first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when no competitor Revenue Streams research exists — no artifact, no model call", async () => {
    const client = new SkillFakeClient();
    client.addOwnSection("revenue_streams", [
      { text: "Flat monthly SaaS subscription at $99", evidence_ids: ["ev-own-rs-1"] },
    ]);
    const runner = new ScriptedSkillRunner(gapsOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runMonetizationGaps, makeSkillJob("yield.monetization_gaps")))
      .rejects.toThrow("monetization_gaps requires at least one researched competitor first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact when a gap's quote is not in the named competitor's items", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // The quote appears in no competitor item — a memory-cited business model.
    const runner = new ScriptedSkillRunner(JSON.stringify({
      gaps: [{
        model: "Advertising",
        competitors: [{ competitor: "RivalCo", evidence_quote: "RivalCo makes most of its money from display ads" }],
        adoption_rationale: "r",
        first_experiment: "Run an ad pilot.",
      }],
      body_md: "## Monetization gaps",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runMonetizationGaps, makeSkillJob("yield.monetization_gaps")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("parseMonetizationGapsArtifact", () => {
  it("parses grounded gaps preserving the model's ranking order", () => {
    const parsed = parseMonetizationGapsArtifact(gapsOutput(), COMPETITOR_ITEMS);
    expect(parsed?.gaps.map((gap) => gap.model)).toEqual(["Transaction fees", "Usage-based API pricing"]);
    expect(parsed?.bodyMd).toContain("Monetization gaps");
  });

  it("accepts an honest empty gaps array — monetization parity is a valid finding", () => {
    const parsed = parseMonetizationGapsArtifact(JSON.stringify({
      gaps: [],
      body_md: "## Monetization gaps\nNo gap: we already run every model competitors do.",
    }), COMPETITOR_ITEMS);
    expect(parsed?.gaps).toEqual([]);
  });

  it("rejects the whole parse when a quote is not a verbatim substring of any competitor item", () => {
    const gaps = gapRows();
    (gaps[1].competitors as Array<Record<string, unknown>>)[0].evidence_quote = "billed per one thousand calls";
    expect(parseMonetizationGapsArtifact(gapsOutput(gaps), COMPETITOR_ITEMS)).toBeNull();
  });

  it("rejects the whole parse when a quote is borrowed from a DIFFERENT competitor's items", () => {
    const gaps = gapRows();
    // The quote is verbatim StackPay text pinned on RivalCo.
    (gaps[0].competitors as Array<Record<string, unknown>>)[0] = {
      competitor: "RivalCo",
      evidence_quote: "usage-based API pricing billed per 1,000 calls",
    };
    expect(parseMonetizationGapsArtifact(gapsOutput(gaps), COMPETITOR_ITEMS)).toBeNull();
  });

  it("rejects the whole parse on an unresearched competitor or a citation-free gap", () => {
    const unknownCompetitor = gapRows();
    (unknownCompetitor[0].competitors as Array<Record<string, unknown>>)[0].competitor = "MadeUpCo";
    expect(parseMonetizationGapsArtifact(gapsOutput(unknownCompetitor), COMPETITOR_ITEMS)).toBeNull();

    const uncited = gapRows();
    uncited[0].competitors = [];
    expect(parseMonetizationGapsArtifact(gapsOutput(uncited), COMPETITOR_ITEMS)).toBeNull();
  });

  it("rejects the whole parse on missing fields, missing body_md, or non-JSON", () => {
    const missingExperiment = gapRows();
    delete missingExperiment[0].first_experiment;
    expect(parseMonetizationGapsArtifact(gapsOutput(missingExperiment), COMPETITOR_ITEMS)).toBeNull();
    expect(parseMonetizationGapsArtifact(JSON.stringify({ gaps: gapRows() }), COMPETITOR_ITEMS)).toBeNull();
    expect(parseMonetizationGapsArtifact("not json at all", COMPETITOR_ITEMS)).toBeNull();
  });

  it("keeps the first (highest-ranked) occurrence of a repeated model", () => {
    const gaps = gapRows();
    gaps.push({ ...gapRows()[0], model: "transaction fees" });
    const parsed = parseMonetizationGapsArtifact(gapsOutput(gaps), COMPETITOR_ITEMS);
    expect(parsed?.gaps.map((gap) => gap.model)).toEqual(["Transaction fees", "Usage-based API pricing"]);
  });
});
