import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import {
  parseSinglePointScanArtifact,
  runSinglePointScan,
} from "../../jobs/skills/single-point-scan.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient } from "./harness.js";

const ALLOWED_ITEMS = [
  "Lead engineer Maria owns the entire ML pipeline",
  "Proprietary training dataset hosted on AWS S3",
  "Exclusive fabrication deal with a single Taiwan foundry",
];

function scanOutput(): string {
  return JSON.stringify({
    risks: [{
      item: "Lead engineer Maria owns the entire ML pipeline",
      risk_class: "key_person",
      severity: 5,
      exposure: "If Maria leaves, model releases stop until a replacement ramps up.",
      mitigation_first_step: "Pair a second engineer with Maria on the next two pipeline changes and document the runbook.",
    }, {
      item: "Exclusive fabrication deal with a single Taiwan foundry",
      risk_class: "single_supplier",
      severity: 4,
      exposure: "A foundry disruption halts all hardware shipments with no fallback line.",
      mitigation_first_step: "Qualify one alternate foundry to prototype stage this quarter.",
    }, {
      item: "Proprietary training dataset hosted on AWS S3",
      risk_class: "platform_dependency",
      severity: 3,
      exposure: "An AWS account or pricing change interrupts retraining until data is restored elsewhere.",
      mitigation_first_step: "Set up a monthly encrypted off-cloud backup of the dataset.",
    }],
    body_md: "## Single-point-of-failure scan\nMaria and the single foundry are the two severe concentrations.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addOwnSection("key_resources", [
    { text: "Lead engineer Maria owns the entire ML pipeline", evidence_ids: ["ev-res-1"] },
    { text: "Proprietary training dataset hosted on AWS S3", evidence_ids: ["ev-res-2", "ev-res-1"] },
  ]);
  client.addOwnSection("key_partners", [
    { text: "Exclusive fabrication deal with a single Taiwan foundry", evidence_ids: ["ev-part-1"] },
  ]);
  client.addOwnSection("key_activities", [
    { text: "Weekly model retraining runs", evidence_ids: ["ev-act-1"] },
  ]);
}

function makeHandler(client: SkillFakeClient, runner: ScriptedSkillRunner): SkillRunHandler {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner,
    feedRunner: makeFakeFeedRunner({}),
  });
}

describe("vault.single_point_scan", () => {
  it("writes a typed risk register stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(scanOutput(), "{}");
    await makeHandler(client, runner).runSkillModule(runSinglePointScan, makeSkillJob("vault.single_point_scan"));

    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "vault.single_point_scan",
      title: "Single-point-of-failure scan — 3 risks, 2 severe (4+)",
    });
    const payload = artifact?.values.payload as {
      risks: Array<Record<string, unknown>>;
      gaps_opened: number;
      verification: string;
    };
    expect(payload.verification).toBe("parser_grounded_rows");
    expect(payload.gaps_opened).toBe(2);
    expect(payload.risks).toHaveLength(3);
    expect(payload.risks[0]).toMatchObject({
      item: "Lead engineer Maria owns the entire ML pipeline",
      risk_class: "key_person",
      severity: 5,
    });
    // Evidence links are the OWN resources + partners + activities ids, deduped.
    expect(artifact?.values.evidence_ids).toEqual(["ev-res-1", "ev-res-2", "ev-part-1", "ev-act-1"]);
    expect(artifact?.values.inputs).toEqual({ sections: ["key_resources", "key_partners", "key_activities"] });
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({
        status: "completed",
        output: { skill_key: "vault.single_point_scan", risks: 3, severe: 2, gaps_opened: 2 },
      });
  });

  it("opens one register row per severity-4+ risk, stamped to the active company, after superseding prior open rows", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(scanOutput(), "{}");
    await makeHandler(client, runner).runSkillModule(runSinglePointScan, makeSkillJob("vault.single_point_scan"));

    // Idempotency: prior open resilience-risk gaps superseded before the insert.
    const supersede = client.updates.find((update) => update.table === "gaps");
    expect(supersede?.values).toMatchObject({ status: "superseded" });

    const gapInsert = client.inserts.find((entry) => entry.table === "gaps");
    const gapRows = gapInsert?.values as unknown as Array<Record<string, unknown>>;
    expect(gapRows).toHaveLength(2);
    expect(gapRows.map((row) => row.title)).toEqual([
      "Resilience risk: Lead engineer Maria owns the entire ML pipeline",
      "Resilience risk: Exclusive fabrication deal with a single Taiwan foundry",
    ]);
    // Severity 5 maps to critical, 4 to high.
    expect(gapRows.map((row) => row.severity)).toEqual(["critical", "high"]);
    // Each gap points at the section its named item actually lives in:
    // Maria is a Key Resources item, the foundry deal is a Key Partners item.
    expect(gapRows.map((row) => row.affected_sections)).toEqual([
      ["key_resources"],
      ["key_partners"],
    ]);
    for (const row of gapRows) {
      expect(row).toMatchObject({
        account_id: "account-1",
        business_context_version_id: "ctx-1",
        gap_type: "missing_data",
        created_by_agent_run_id: "run-1",
      });
    }
    expect(gapRows[1].recommended_action).toBe("Qualify one alternate foundry to prototype stage this quarter.");
    expect(gapRows[0].description).toContain("If Maria leaves");
  });

  it("still supersedes prior rows when no risk is severe anymore — and inserts nothing", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const output = JSON.parse(scanOutput()) as { risks: Array<Record<string, unknown>>; body_md: string };
    for (const risk of output.risks) risk.severity = 2;
    const runner = new ScriptedSkillRunner(JSON.stringify(output), "{}");
    await makeHandler(client, runner).runSkillModule(runSinglePointScan, makeSkillJob("vault.single_point_scan"));

    expect(client.updates.find((update) => update.table === "gaps")?.values).toMatchObject({ status: "superseded" });
    expect(client.inserts.filter((entry) => entry.table === "gaps")).toHaveLength(0);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect((artifact?.values.payload as { gaps_opened: number }).gaps_opened).toBe(0);
    expect(artifact?.values.title).toBe("Single-point-of-failure scan — 3 risks, 0 severe (4+)");
  });

  it("never lets the previous company's key resources reach the prompt", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER key_resources row from the ctx-0 era.
    client.addTrapRow("key_resources", "Stale old-company text");
    const runner = new ScriptedSkillRunner(scanOutput(), "{}");
    await makeHandler(client, runner).runSkillModule(runSinglePointScan, makeSkillJob("vault.single_point_scan"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain("Lead engineer Maria owns the entire ML pipeline");
    expect(mainPrompt).toContain("Exclusive fabrication deal with a single Taiwan foundry");
    expect(mainPrompt).not.toContain("Stale old-company text");
  });

  it("fails honestly when Key Resources is empty — no artifact, no model call", async () => {
    const client = new SkillFakeClient();
    client.addOwnSection("key_partners", [
      { text: "Exclusive fabrication deal with a single Taiwan foundry", evidence_ids: [] },
    ]);
    const runner = new ScriptedSkillRunner(scanOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runSinglePointScan, makeSkillJob("vault.single_point_scan")))
      .rejects.toThrow("single_point_scan requires our Key Resources canvas items first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("runs without partners or activities — they are context, not requirements", async () => {
    const client = new SkillFakeClient();
    client.addOwnSection("key_resources", [
      { text: "Lead engineer Maria owns the entire ML pipeline", evidence_ids: ["ev-res-1"] },
      { text: "Proprietary training dataset hosted on AWS S3", evidence_ids: [] },
    ]);
    const output = JSON.parse(scanOutput()) as { risks: Array<Record<string, unknown>>; body_md: string };
    // Drop the partner-grounded row — that item is not on this canvas.
    output.risks = output.risks.filter((risk) => risk.risk_class !== "single_supplier");
    const runner = new ScriptedSkillRunner(JSON.stringify(output), "{}");
    await makeHandler(client, runner).runSkillModule(runSinglePointScan, makeSkillJob("vault.single_point_scan"));

    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values.title).toBe("Single-point-of-failure scan — 2 risks, 1 severe (4+)");
  });

  it("refuses to write an artifact or open gaps when a row names an invented dependency", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const output = JSON.parse(scanOutput()) as { risks: Array<Record<string, unknown>>; body_md: string };
    output.risks[1] = { ...output.risks[1], item: "Sole reliance on a Shenzhen components broker" };
    const runner = new ScriptedSkillRunner(JSON.stringify(output), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runSinglePointScan, makeSkillJob("vault.single_point_scan")))
      .rejects.toThrow("single_point_scan produced unparseable output; refusing to write an artifact");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(client.inserts.filter((entry) => entry.table === "gaps")).toHaveLength(0);
    expect(client.updates.filter((update) => update.table === "gaps")).toHaveLength(0);
  });
});

describe("parseSinglePointScanArtifact", () => {
  it("parses grounded rows with bounded severities", () => {
    const parsed = parseSinglePointScanArtifact(scanOutput(), ALLOWED_ITEMS);
    expect(parsed?.risks).toHaveLength(3);
    expect(parsed?.risks[1]).toMatchObject({
      item: "Exclusive fabrication deal with a single Taiwan foundry",
      risk_class: "single_supplier",
      severity: 4,
    });
    expect(parsed?.bodyMd).toContain("Single-point-of-failure scan");
  });

  it("clamps out-of-range severities into 1..5", () => {
    const output = JSON.parse(scanOutput()) as { risks: Array<Record<string, unknown>>; body_md: string };
    output.risks[0] = { ...output.risks[0], severity: 9 };
    output.risks[2] = { ...output.risks[2], severity: -3 };
    const parsed = parseSinglePointScanArtifact(JSON.stringify(output), ALLOWED_ITEMS);
    expect(parsed?.risks[0]?.severity).toBe(5);
    expect(parsed?.risks[2]?.severity).toBe(1);
  });

  it("rejects the whole parse when severity is missing or non-numeric — never coerces to 1", () => {
    // A fabricated severity of 1 would suppress the severity-4+ gap row the
    // model's row was owed and understate the title's severe count.
    const noSeverity = JSON.parse(scanOutput()) as { risks: Array<Record<string, unknown>>; body_md: string };
    delete noSeverity.risks[0].severity;
    expect(parseSinglePointScanArtifact(JSON.stringify(noSeverity), ALLOWED_ITEMS)).toBeNull();

    const wordSeverity = JSON.parse(scanOutput()) as { risks: Array<Record<string, unknown>>; body_md: string };
    wordSeverity.risks[1] = { ...wordSeverity.risks[1], severity: "critical" };
    expect(parseSinglePointScanArtifact(JSON.stringify(wordSeverity), ALLOWED_ITEMS)).toBeNull();
  });

  it("rejects the whole parse when one row is ungrounded — even a paraphrase", () => {
    const output = JSON.parse(scanOutput()) as { risks: Array<Record<string, unknown>>; body_md: string };
    output.risks[0] = { ...output.risks[0], item: "Maria owns the ML pipeline" };
    expect(parseSinglePointScanArtifact(JSON.stringify(output), ALLOWED_ITEMS)).toBeNull();
  });

  it("rejects the whole parse on an unrecognized risk class or a missing field", () => {
    const badClass = JSON.parse(scanOutput()) as { risks: Array<Record<string, unknown>>; body_md: string };
    badClass.risks[1] = { ...badClass.risks[1], risk_class: "regulatory" };
    expect(parseSinglePointScanArtifact(JSON.stringify(badClass), ALLOWED_ITEMS)).toBeNull();

    const noMitigation = JSON.parse(scanOutput()) as { risks: Array<Record<string, unknown>>; body_md: string };
    delete noMitigation.risks[2].mitigation_first_step;
    expect(parseSinglePointScanArtifact(JSON.stringify(noMitigation), ALLOWED_ITEMS)).toBeNull();
  });

  it("collapses duplicate item+class rows instead of double-counting a risk", () => {
    const output = JSON.parse(scanOutput()) as { risks: Array<Record<string, unknown>>; body_md: string };
    output.risks.push({ ...output.risks[0], severity: 2 });
    const parsed = parseSinglePointScanArtifact(JSON.stringify(output), ALLOWED_ITEMS);
    expect(parsed?.risks).toHaveLength(3);
    // The first occurrence wins.
    expect(parsed?.risks[0]?.severity).toBe(5);
  });

  it("accepts an empty register — zero risks is a legitimate finding", () => {
    const parsed = parseSinglePointScanArtifact(
      JSON.stringify({ risks: [], body_md: "## Single-point-of-failure scan\nNo concentration found." }),
      ALLOWED_ITEMS,
    );
    expect(parsed?.risks).toEqual([]);
    expect(parsed?.bodyMd).toContain("No concentration found");
  });

  it("returns null on garbage: not JSON, risks not an array, or missing body_md", () => {
    expect(parseSinglePointScanArtifact("not json at all", ALLOWED_ITEMS)).toBeNull();
    expect(parseSinglePointScanArtifact(JSON.stringify({ risks: "none", body_md: "## x" }), ALLOWED_ITEMS)).toBeNull();

    const noBody = JSON.parse(scanOutput()) as { risks: Array<Record<string, unknown>>; body_md?: string };
    delete noBody.body_md;
    expect(parseSinglePointScanArtifact(JSON.stringify(noBody), ALLOWED_ITEMS)).toBeNull();
  });
});
