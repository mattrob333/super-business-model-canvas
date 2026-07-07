import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import {
  COST_CATEGORIES,
  parseCostBenchmarkArtifact,
  runCostBenchmark,
} from "../../jobs/skills/cost-benchmark.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient } from "./harness.js";

const CANVAS_TEXTS = [
  "Hardware components at $1,200 per robot unit",
  "Paid ads spend of $2,000 per new customer",
  "Cloud hosting at $8,000 per month",
];

function benchmarkOutput(): string {
  return JSON.stringify({
    archetype: "hardware robotics OEM",
    rows: [{
      category: "cogs_or_delivery",
      archetype_norm: "Typical for the archetype: COGS runs 50-65% of revenue, dominated by components.",
      status: "canvas",
      canvas_quote: "$1,200 per robot unit",
      own_read: "Component cost per unit is on the canvas at $1,200.",
      comparison: "Whether this sits inside the archetype's COGS band depends on unit price, which the canvas does state elsewhere.",
      owner_input_needed: null,
    }, {
      category: "sales_and_marketing",
      archetype_norm: "Typical for the archetype: S&M is 15-25% of revenue, mostly channel and trade shows.",
      status: "canvas",
      canvas_quote: "$2,000 per new customer",
      own_read: "Acquisition spend is on the canvas at $2,000 per new customer.",
      comparison: "Per-customer paid spend is unusual for the archetype, which leans on channel partners.",
      owner_input_needed: null,
    }, {
      category: "research_and_development",
      archetype_norm: "Typical for the archetype: R&D runs 10-20% of revenue during product buildout.",
      status: "gap",
      canvas_quote: null,
      own_read: null,
      comparison: "The canvas is silent on engineering spend, the archetype's second-largest line.",
      owner_input_needed: "Share the monthly engineering payroll and prototyping spend.",
    }, {
      category: "general_and_administrative",
      archetype_norm: "Typical for the archetype: G&A settles near 10% of revenue at scale.",
      status: "gap",
      canvas_quote: null,
      own_read: null,
      comparison: "No admin, finance, or legal costs appear on the canvas.",
      owner_input_needed: null,
    }, {
      category: "infrastructure_and_operations",
      archetype_norm: "Typical for the archetype: fleet telemetry and hosting stay under 5% of revenue.",
      status: "canvas",
      canvas_quote: "Cloud hosting at $8,000 per month",
      own_read: "Hosting is on the canvas at $8,000 per month.",
      comparison: "A fixed hosting line is in the archetype's expected shape.",
      owner_input_needed: null,
    }],
    body_md: "## Cost benchmark\nComponents, acquisition, and hosting are on the canvas; R&D and G&A are owner inputs.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addOwnSection("cost_structure", [
    { text: "Hardware components at $1,200 per robot unit", evidence_ids: ["ev-own-cost-1"] },
    { text: "Paid ads spend of $2,000 per new customer", evidence_ids: ["ev-own-cost-2", "ev-own-cost-1"] },
    { text: "Cloud hosting at $8,000 per month", evidence_ids: [] },
  ]);
}

function makeHandler(client: SkillFakeClient, runner: ScriptedSkillRunner): SkillRunHandler {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner,
    feedRunner: makeFakeFeedRunner({}),
  });
}

describe("ledger.cost_benchmark", () => {
  it("benchmarks all five categories and writes a typed artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(benchmarkOutput(), "{}");
    await makeHandler(client, runner).runSkillModule(runCostBenchmark, makeSkillJob("ledger.cost_benchmark"));

    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "ledger.cost_benchmark",
      title: "Cost benchmark — 3 of 5 categories grounded, 2 owner inputs needed",
    });
    const payload = artifact?.values.payload as {
      archetype: string;
      rows: Array<Record<string, unknown>>;
      gaps_opened: number;
      archetype_norm_source: string;
      verification: string;
    };
    expect(payload.archetype).toBe("hardware robotics OEM");
    // Archetype norms travel labeled as model knowledge, never as evidence.
    expect(payload.archetype_norm_source).toBe("model_knowledge");
    expect(payload.verification).toBe("parser_quote_gated_own_claims");
    expect(payload.gaps_opened).toBe(2);
    expect(payload.rows.map((row) => row.category)).toEqual([...COST_CATEGORIES]);
    expect(payload.rows[0]).toMatchObject({ category: "cogs_or_delivery", status: "canvas", canvas_quote: "$1,200 per robot unit" });
    expect(payload.rows[2]).toMatchObject({ category: "research_and_development", status: "gap", canvas_quote: null, own_read: null });
    // Evidence links are the OWN cost items' ids, deduped.
    expect(artifact?.values.evidence_ids).toEqual(["ev-own-cost-1", "ev-own-cost-2"]);
    expect(artifact?.values.inputs).toEqual({ sections: ["cost_structure"], company: "Acme Robotics" });
    // The company brief reaches the prompt so the archetype is the analyzed company's.
    expect(runner.requests[0]?.prompt).toContain("Acme Robotics");
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({ status: "completed", output: { skill_key: "ledger.cost_benchmark", archetype: "hardware robotics OEM", grounded: 3, gaps: 2 } });
  });

  it("opens a register row per ungrounded category, stamped to the active company, after superseding prior open rows", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(benchmarkOutput(), "{}");
    await makeHandler(client, runner).runSkillModule(runCostBenchmark, makeSkillJob("ledger.cost_benchmark"));

    // Idempotency: prior open cost-input gaps superseded before the insert.
    const supersede = client.updates.find((update) => update.table === "gaps");
    expect(supersede?.values).toMatchObject({ status: "superseded" });

    const gapInsert = client.inserts.find((entry) => entry.table === "gaps");
    const gapRows = gapInsert?.values as unknown as Array<Record<string, unknown>>;
    expect(gapRows).toHaveLength(2);
    expect(gapRows.map((row) => row.title)).toEqual([
      "Cost input: research_and_development",
      "Cost input: general_and_administrative",
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
    // The model's own ask wins; a missing ask falls back to the default.
    expect(gapRows[0].description).toBe("Share the monthly engineering payroll and prototyping spend.");
    expect(gapRows[1].description).toBe("Provide our monthly G&A spend (admin, finance, legal, office).");
  });

  it("still supersedes prior open rows when every category is grounded — and inserts nothing", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const output = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    // The owner has since filled every category — R&D and G&A now quote the canvas.
    output.rows[2] = {
      ...output.rows[2],
      status: "canvas",
      canvas_quote: "$8,000 per month",
      own_read: "Engineering spend rides the hosting line per the canvas.",
      owner_input_needed: null,
    };
    output.rows[3] = {
      ...output.rows[3],
      status: "canvas",
      canvas_quote: "Paid ads spend",
      own_read: "Overhead is folded into the acquisition line per the canvas.",
      owner_input_needed: null,
    };
    const runner = new ScriptedSkillRunner(JSON.stringify(output), "{}");
    await makeHandler(client, runner).runSkillModule(runCostBenchmark, makeSkillJob("ledger.cost_benchmark"));

    // Stale "Cost input:" rows from the previous run must still close.
    expect(client.updates.find((update) => update.table === "gaps")?.values).toMatchObject({ status: "superseded" });
    expect(client.inserts.filter((entry) => entry.table === "gaps")).toHaveLength(0);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values.title).toBe("Cost benchmark — 5 of 5 categories grounded, 0 owner inputs needed");
    expect((artifact?.values.payload as { gaps_opened: number }).gaps_opened).toBe(0);
  });

  it("never lets the previous company's cost structure reach the prompt", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER cost_structure row from the ctx-0 era.
    client.addTrapRow("cost_structure", "Stale old-company text");
    const runner = new ScriptedSkillRunner(benchmarkOutput(), "{}");
    await makeHandler(client, runner).runSkillModule(runCostBenchmark, makeSkillJob("ledger.cost_benchmark"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain("Hardware components at $1,200 per robot unit");
    expect(mainPrompt).not.toContain("Stale old-company text");
  });

  it("fails honestly when Cost Structure is empty — no artifact, no model call", async () => {
    const client = new SkillFakeClient();
    const runner = new ScriptedSkillRunner(benchmarkOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runCostBenchmark, makeSkillJob("ledger.cost_benchmark")))
      .rejects.toThrow("cost_benchmark requires our Cost Structure canvas items first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(client.inserts.filter((entry) => entry.table === "gaps")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact when a canvas claim's quote is not on our canvas", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const output = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    // The model asserts an S&M figure the canvas never wrote down.
    output.rows[1] = {
      ...output.rows[1],
      canvas_quote: "industry-standard S&M of 40% of revenue",
      own_read: "S&M runs 40% of revenue.",
    };
    const runner = new ScriptedSkillRunner(JSON.stringify(output), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runCostBenchmark, makeSkillJob("ledger.cost_benchmark")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    // A rejected parse must not touch the register either.
    expect(client.inserts.filter((entry) => entry.table === "gaps")).toHaveLength(0);
    expect(client.updates.filter((update) => update.table === "gaps")).toHaveLength(0);
  });
});

describe("parseCostBenchmarkArtifact", () => {
  it("parses a complete benchmark and returns rows in the fixed category order", () => {
    const parsed = parseCostBenchmarkArtifact(benchmarkOutput(), CANVAS_TEXTS);
    expect(parsed?.archetype).toBe("hardware robotics OEM");
    expect(parsed?.rows.map((row) => row.category)).toEqual([...COST_CATEGORIES]);
    expect(parsed?.rows[4]).toMatchObject({ category: "infrastructure_and_operations", status: "canvas", canvas_quote: "Cloud hosting at $8,000 per month" });
    expect(parsed?.bodyMd).toContain("Cost benchmark");
  });

  it("rejects the WHOLE parse when a canvas row's quote is not a verbatim substring of any own item", () => {
    const output = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    output.rows[0] = { ...output.rows[0], canvas_quote: "components at roughly $1,200" };
    expect(parseCostBenchmarkArtifact(JSON.stringify(output), CANVAS_TEXTS)).toBeNull();

    // Same for a canvas row missing its quote or own_read entirely.
    const noQuote = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    noQuote.rows[0] = { ...noQuote.rows[0], canvas_quote: null };
    expect(parseCostBenchmarkArtifact(JSON.stringify(noQuote), CANVAS_TEXTS)).toBeNull();
    const noRead = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    noRead.rows[0] = { ...noRead.rows[0], own_read: null };
    expect(parseCostBenchmarkArtifact(JSON.stringify(noRead), CANVAS_TEXTS)).toBeNull();
  });

  it("returns null when a category is missing, invented, or the status is unrecognized", () => {
    const partial = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    partial.rows = partial.rows.slice(0, 4);
    expect(parseCostBenchmarkArtifact(JSON.stringify(partial), CANVAS_TEXTS)).toBeNull();

    const invented = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    invented.rows[4] = { ...invented.rows[4], category: "vibes_and_snacks" };
    expect(parseCostBenchmarkArtifact(JSON.stringify(invented), CANVAS_TEXTS)).toBeNull();

    const badStatus = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    badStatus.rows[2] = { ...badStatus.rows[2], status: "estimated" };
    expect(parseCostBenchmarkArtifact(JSON.stringify(badStatus), CANVAS_TEXTS)).toBeNull();
  });

  it("returns null when the archetype, a norm, a comparison, or body_md is missing — or the text is not JSON", () => {
    const noArchetype = JSON.parse(benchmarkOutput()) as { archetype?: string };
    delete noArchetype.archetype;
    expect(parseCostBenchmarkArtifact(JSON.stringify(noArchetype), CANVAS_TEXTS)).toBeNull();

    const noNorm = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    noNorm.rows[1] = { ...noNorm.rows[1], archetype_norm: null };
    expect(parseCostBenchmarkArtifact(JSON.stringify(noNorm), CANVAS_TEXTS)).toBeNull();

    const noComparison = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    noComparison.rows[3] = { ...noComparison.rows[3], comparison: null };
    expect(parseCostBenchmarkArtifact(JSON.stringify(noComparison), CANVAS_TEXTS)).toBeNull();

    const noBody = JSON.parse(benchmarkOutput()) as { body_md?: string };
    delete noBody.body_md;
    expect(parseCostBenchmarkArtifact(JSON.stringify(noBody), CANVAS_TEXTS)).toBeNull();

    expect(parseCostBenchmarkArtifact("not json at all", CANVAS_TEXTS)).toBeNull();
  });

  it("keeps gap rows honest: stray quotes are discarded and a missing owner ask falls back to the default", () => {
    const output = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    // A gap row that still carries a quote makes no claim about our costs —
    // the quote is discarded rather than shipped.
    output.rows[2] = { ...output.rows[2], canvas_quote: "$1,200 per robot unit", owner_input_needed: null };
    const parsed = parseCostBenchmarkArtifact(JSON.stringify(output), CANVAS_TEXTS);
    expect(parsed?.rows[2]).toMatchObject({
      category: "research_and_development",
      status: "gap",
      canvas_quote: null,
      own_read: null,
    });
    expect(parsed?.rows[2]?.owner_input_needed).toMatch(/R&D \/ product development spend/);
    // The gap in the fixture keeps its default ask too (owner_input_needed was null).
    expect(parsed?.rows[3]?.owner_input_needed).toBe("Provide our monthly G&A spend (admin, finance, legal, office).");
  });

  it("keeps the first row when a category is duplicated, as long as the frame stays complete", () => {
    const output = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    output.rows.push({ ...output.rows[0], own_read: "A second conflicting read." });
    const parsed = parseCostBenchmarkArtifact(JSON.stringify(output), CANVAS_TEXTS);
    expect(parsed?.rows).toHaveLength(5);
    expect(parsed?.rows[0]?.own_read).toBe("Component cost per unit is on the canvas at $1,200.");
  });

  it("rejects the WHOLE parse when a duplicated canvas row carries an ungrounded quote — dropping it would still ship the invented number in body_md", () => {
    const output = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>>; body_md: string };
    // A second cogs_or_delivery row inventing a figure the canvas never wrote
    // down — and body_md repeating it, as the model naturally would.
    output.rows.push({
      ...output.rows[0],
      canvas_quote: "industry-standard COGS of $9,999 per unit",
      own_read: "COGS runs $9,999 per unit.",
    });
    output.body_md += "\nCOGS runs an industry-standard $9,999 per unit.";
    expect(parseCostBenchmarkArtifact(JSON.stringify(output), CANVAS_TEXTS)).toBeNull();

    // Same when the duplicate is missing its quote or own_read entirely.
    const noQuote = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    noQuote.rows.push({ ...noQuote.rows[0], canvas_quote: null });
    expect(parseCostBenchmarkArtifact(JSON.stringify(noQuote), CANVAS_TEXTS)).toBeNull();
  });
});
