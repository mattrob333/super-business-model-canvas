import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import {
  parseUnitEconomicsFrameArtifact,
  runUnitEconomicsFrame,
  UNIT_ECONOMICS_VARIABLES,
} from "../../jobs/skills/unit-economics-frame.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient } from "./harness.js";

const CANVAS_TEXTS = [
  "Subscription at $500/mo per customer",
  "Paid ads spend of $2,000 per new customer",
];

function frameOutput(): string {
  return JSON.stringify({
    variables: [{
      variable: "cac",
      status: "known",
      value_or_range: "$2,000",
      canvas_quote: "$2,000 per new customer",
      basis: "The Cost Structure item states the per-customer acquisition spend.",
      owner_input_needed: null,
    }, {
      variable: "acv_or_arpa",
      status: "known",
      value_or_range: "$500/mo",
      canvas_quote: "$500/mo per customer",
      basis: "The Revenue Streams item states the subscription price per customer.",
      owner_input_needed: null,
    }, {
      variable: "gross_margin",
      status: "unknown",
      value_or_range: null,
      canvas_quote: null,
      basis: "No canvas item mentions cost of goods or margin.",
      owner_input_needed: "Share the gross margin percentage from the books.",
    }, {
      variable: "retention_or_churn",
      status: "unknown",
      value_or_range: null,
      canvas_quote: null,
      basis: "No canvas item mentions retention or churn.",
      owner_input_needed: "Share the monthly customer churn rate.",
    }, {
      variable: "payback_months",
      status: "estimated_from_canvas",
      value_or_range: "~4 months",
      canvas_quote: "$2,000 per new customer",
      basis: "$2,000 CAC divided by $500/mo revenue is 4 months, before margin.",
      owner_input_needed: null,
    }, {
      variable: "ltv",
      status: "unknown",
      value_or_range: null,
      canvas_quote: null,
      basis: "LTV needs retention and margin, neither of which the canvas states.",
      owner_input_needed: "Share average customer lifetime in months so LTV can be derived.",
    }],
    body_md: "## Unit economics frame\nCAC and price are on the canvas; margin, churn, and LTV are owner inputs.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addOwnSection("revenue_streams", [
    { text: "Subscription at $500/mo per customer", evidence_ids: ["ev-own-rev"] },
  ]);
  client.addOwnSection("cost_structure", [
    { text: "Paid ads spend of $2,000 per new customer", evidence_ids: ["ev-own-cost", "ev-own-rev"] },
  ]);
  client.addOwnSection("customer_segments", [
    { text: "Seed-stage SaaS founders", evidence_ids: [] },
  ]);
}

function makeHandler(client: SkillFakeClient, runner: ScriptedSkillRunner): SkillRunHandler {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner,
    feedRunner: makeFakeFeedRunner({}),
  });
}

describe("ledger.unit_economics_frame", () => {
  it("fills all six variables and writes a typed artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(frameOutput(), "{}");
    await makeHandler(client, runner).runSkillModule(runUnitEconomicsFrame, makeSkillJob("ledger.unit_economics_frame"));

    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "ledger.unit_economics_frame",
      title: "Unit economics frame — 3 known, 3 owner inputs needed",
    });
    const payload = artifact?.values.payload as {
      variables: Array<Record<string, unknown>>;
      gaps_opened: number;
      verification: string;
    };
    expect(payload.verification).toBe("parser_quote_gated");
    expect(payload.gaps_opened).toBe(3);
    expect(payload.variables.map((row) => row.variable)).toEqual([...UNIT_ECONOMICS_VARIABLES]);
    expect(payload.variables[0]).toMatchObject({ variable: "cac", status: "known", value_or_range: "$2,000" });
    expect(payload.variables[2]).toMatchObject({ variable: "gross_margin", status: "unknown", value_or_range: null });
    // Evidence links are the OWN revenue + cost items' ids, deduped.
    expect(artifact?.values.evidence_ids).toEqual(["ev-own-rev", "ev-own-cost"]);
    expect(artifact?.values.inputs).toEqual({ sections: ["revenue_streams", "cost_structure", "customer_segments"] });
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({ status: "completed", output: { skill_key: "ledger.unit_economics_frame", known: 3, unknown: 3 } });
  });

  it("opens a register row per unknown, stamped to the active company, after superseding prior open rows", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(frameOutput(), "{}");
    await makeHandler(client, runner).runSkillModule(runUnitEconomicsFrame, makeSkillJob("ledger.unit_economics_frame"));

    // Idempotency: prior open unit-economics gaps superseded before the insert.
    const supersede = client.updates.find((update) => update.table === "gaps");
    expect(supersede?.values).toMatchObject({ status: "superseded" });

    const gapInsert = client.inserts.find((entry) => entry.table === "gaps");
    const gapRows = gapInsert?.values as unknown as Array<Record<string, unknown>>;
    expect(gapRows).toHaveLength(3);
    expect(gapRows.map((row) => row.title)).toEqual([
      "Unit economics input: gross_margin",
      "Unit economics input: retention_or_churn",
      "Unit economics input: ltv",
    ]);
    for (const row of gapRows) {
      expect(row).toMatchObject({
        account_id: "account-1",
        business_context_version_id: "ctx-1",
        gap_type: "missing_data",
        severity: "medium",
        affected_sections: ["cost_structure"],
        created_by_agent_run_id: "run-1",
      });
    }
    expect(gapRows[0].description).toBe("Share the gross margin percentage from the books.");
  });

  it("never lets the previous company's revenue streams reach the prompt", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER revenue_streams row from the ctx-0 era.
    client.addTrapRow("revenue_streams", "Stale old-company text");
    const runner = new ScriptedSkillRunner(frameOutput(), "{}");
    await makeHandler(client, runner).runSkillModule(runUnitEconomicsFrame, makeSkillJob("ledger.unit_economics_frame"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain("Subscription at $500/mo per customer");
    expect(mainPrompt).not.toContain("Stale old-company text");
  });

  it("fails honestly when Revenue Streams is empty — no artifact, no model call", async () => {
    const client = new SkillFakeClient();
    client.addOwnSection("cost_structure", [{ text: "Paid ads spend of $2,000 per new customer", evidence_ids: [] }]);
    const runner = new ScriptedSkillRunner(frameOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runUnitEconomicsFrame, makeSkillJob("ledger.unit_economics_frame")))
      .rejects.toThrow(/requires our Revenue Streams canvas items first/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when Cost Structure is empty — its own message, no artifact", async () => {
    const client = new SkillFakeClient();
    client.addOwnSection("revenue_streams", [{ text: "Subscription at $500/mo per customer", evidence_ids: [] }]);
    const runner = new ScriptedSkillRunner(frameOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runUnitEconomicsFrame, makeSkillJob("ledger.unit_economics_frame")))
      .rejects.toThrow(/requires our Cost Structure canvas items first/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact from invented or garbage model output", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Five of six variables plus one invented variable name — the frame is
    // incomplete after the drop, so the parse must be null.
    const runner = new ScriptedSkillRunner(JSON.stringify({
      variables: [{ variable: "burn_rate", status: "known", value_or_range: "$50k", canvas_quote: null, basis: "b", owner_input_needed: null }],
      body_md: "## Unit economics frame",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runUnitEconomicsFrame, makeSkillJob("ledger.unit_economics_frame")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(client.inserts.filter((entry) => entry.table === "gaps")).toHaveLength(0);
  });
});

describe("parseUnitEconomicsFrameArtifact", () => {
  it("parses a complete frame and returns rows in the fixed variable order", () => {
    const parsed = parseUnitEconomicsFrameArtifact(frameOutput(), CANVAS_TEXTS);
    expect(parsed?.variables.map((row) => row.variable)).toEqual([...UNIT_ECONOMICS_VARIABLES]);
    expect(parsed?.variables[4]).toMatchObject({ variable: "payback_months", status: "estimated_from_canvas" });
    expect(parsed?.bodyMd).toContain("Unit economics frame");
  });

  it("downgrades a known row without a verbatim canvas quote to unknown instead of dropping it", () => {
    const output = JSON.parse(frameOutput()) as { variables: Array<Record<string, unknown>>; body_md: string };
    // The model asserts a CAC the canvas never wrote down.
    output.variables[0] = {
      variable: "cac",
      status: "known",
      value_or_range: "$1,200",
      canvas_quote: "industry benchmark CAC of $1,200",
      basis: "Typical for the category.",
      owner_input_needed: null,
    };
    const parsed = parseUnitEconomicsFrameArtifact(JSON.stringify(output), CANVAS_TEXTS);
    expect(parsed?.variables[0]).toMatchObject({
      variable: "cac",
      status: "unknown",
      value_or_range: null,
      canvas_quote: null,
    });
    // The downgraded row still tells the owner what to supply.
    expect(parsed?.variables[0]?.owner_input_needed).toMatch(/acquisition cost/);
  });

  it("downgrades an estimated row whose quote is missing entirely", () => {
    const output = JSON.parse(frameOutput()) as { variables: Array<Record<string, unknown>>; body_md: string };
    output.variables[4] = {
      variable: "payback_months",
      status: "estimated_from_canvas",
      value_or_range: "~4 months",
      canvas_quote: null,
      basis: "Derived from CAC and price.",
      owner_input_needed: null,
    };
    const parsed = parseUnitEconomicsFrameArtifact(JSON.stringify(output), CANVAS_TEXTS);
    expect(parsed?.variables[4]).toMatchObject({ variable: "payback_months", status: "unknown", value_or_range: null });
  });

  it("returns null when a variable is missing, invented, or the text is not JSON", () => {
    const partial = JSON.parse(frameOutput()) as { variables: Array<Record<string, unknown>>; body_md: string };
    partial.variables = partial.variables.slice(0, 5);
    expect(parseUnitEconomicsFrameArtifact(JSON.stringify(partial), CANVAS_TEXTS)).toBeNull();

    const invented = JSON.parse(frameOutput()) as { variables: Array<Record<string, unknown>>; body_md: string };
    invented.variables[5] = { ...invented.variables[5], variable: "magic_number" };
    expect(parseUnitEconomicsFrameArtifact(JSON.stringify(invented), CANVAS_TEXTS)).toBeNull();

    expect(parseUnitEconomicsFrameArtifact("not json at all", CANVAS_TEXTS)).toBeNull();
  });

  it("returns null when body_md is missing", () => {
    const output = JSON.parse(frameOutput()) as { variables: Array<Record<string, unknown>>; body_md?: string };
    delete output.body_md;
    expect(parseUnitEconomicsFrameArtifact(JSON.stringify(output), CANVAS_TEXTS)).toBeNull();
  });
});
