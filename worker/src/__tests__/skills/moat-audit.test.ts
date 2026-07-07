import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { parseMoatAuditArtifact, runMoatAudit } from "../../jobs/skills/moat-audit.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient } from "./harness.js";

const RESOURCES = ["Proprietary evidence graph", "AI workflow engine"];

function moatOutput(): string {
  return JSON.stringify({
    rows: [{
      resource: "Proprietary evidence graph",
      moat_class: "proprietary_data_or_tech",
      durability: 4,
      basis: "Accumulated evidence links are not purchasable off the shelf.",
    }, {
      resource: "AI workflow engine",
      moat_class: "none",
      durability: 2,
      basis: "Any funded competitor can assemble a comparable engine from model APIs.",
    }],
    body_md: "## Moat read\nThe evidence graph is the only durable asset.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addOwnSection("key_resources", [
    { text: "Proprietary evidence graph", evidence_ids: ["ev-own-kr-1"] },
    { text: "AI workflow engine", evidence_ids: ["ev-own-kr-2", "ev-own-kr-1"] },
  ]);
  client.addOwnSection("value_propositions", [
    { text: "Only platform with evidence-cited canvases", evidence_ids: ["ev-own-vp"] },
  ]);
  client.addCompetitorSection("key_resources", "RivalCo", [
    { text: "RivalCo runs a generic AI workflow engine.", evidence_ids: ["ev-competitor-kr"] },
  ]);
}

function makeHandler(client: SkillFakeClient, runner: ScriptedSkillRunner): SkillRunHandler {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner,
    feedRunner: makeFakeFeedRunner({}),
  });
}

describe("vault.moat_audit", () => {
  it("classifies every resource and writes a typed artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(moatOutput(), "{}");
    await makeHandler(client, runner).runSkillModule(runMoatAudit, makeSkillJob("vault.moat_audit"));

    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "vault.moat_audit",
      title: "Moat audit — 2 resources, 1 durable (4+)",
    });
    const payload = artifact?.values.payload as { rows: Array<Record<string, unknown>>; verification: string };
    expect(payload.verification).toBe("parser_strict_all_rows");
    expect(payload.rows).toHaveLength(2);
    expect(payload.rows[0]).toMatchObject({ resource: "Proprietary evidence graph", moat_class: "proprietary_data_or_tech", durability: 4 });
    expect(payload.rows[1]).toMatchObject({ resource: "AI workflow engine", moat_class: "none", durability: 2 });
    // Evidence links are the OWN items' ids, deduped.
    expect(artifact?.values.evidence_ids).toEqual(["ev-own-kr-1", "ev-own-kr-2"]);
    expect(artifact?.values.inputs).toEqual({ sections: ["key_resources"] });
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({ status: "completed", output: { skill_key: "vault.moat_audit", resources: 2, durable: 1 } });
  });

  it("never lets the previous company's key resources reach the prompt", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER key_resources row from the ctx-0 era.
    client.addTrapRow("key_resources", "Stale old-company text");
    const runner = new ScriptedSkillRunner(moatOutput(), "{}");
    await makeHandler(client, runner).runSkillModule(runMoatAudit, makeSkillJob("vault.moat_audit"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain("Proprietary evidence graph");
    expect(mainPrompt).not.toContain("Stale old-company text");
  });

  it("fails honestly when the Key Resources section is empty — no artifact, no model call", async () => {
    const client = new SkillFakeClient();
    const runner = new ScriptedSkillRunner(moatOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runMoatAudit, makeSkillJob("vault.moat_audit")))
      .rejects.toThrow(/requires our Key Resources canvas items first/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact from invented model output", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(JSON.stringify({
      rows: [{ resource: "Invented data flywheel", moat_class: "network_effects", durability: 5, basis: "b" }],
      body_md: "## Moat read",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runMoatAudit, makeSkillJob("vault.moat_audit")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("parseMoatAuditArtifact", () => {
  it("parses a complete audit and returns rows in canvas order", () => {
    const parsed = parseMoatAuditArtifact(moatOutput(), RESOURCES);
    expect(parsed?.rows.map((row) => row.resource)).toEqual(RESOURCES);
    expect(parsed?.bodyMd).toContain("Moat read");
  });

  it("returns null when an invalid moat_class leaves a resource unclassified", () => {
    expect(parseMoatAuditArtifact(JSON.stringify({
      rows: [
        { resource: RESOURCES[0], moat_class: "proprietary_data_or_tech", durability: 4, basis: "b" },
        { resource: RESOURCES[1], moat_class: "totally_made_up_moat", durability: 5, basis: "b" },
      ],
      body_md: "## Moat read",
    }), RESOURCES)).toBeNull();
  });

  it("returns null on a partial audit, an invented resource, or non-JSON", () => {
    // One classified row out of two — a partial audit hides resources.
    expect(parseMoatAuditArtifact(JSON.stringify({
      rows: [{ resource: RESOURCES[0], moat_class: "brand", durability: 3, basis: "b" }],
      body_md: "## Moat read",
    }), RESOURCES)).toBeNull();
    // Paraphrased resource text is not our canvas item.
    expect(parseMoatAuditArtifact(JSON.stringify({
      rows: [
        { resource: "The evidence graph", moat_class: "brand", durability: 3, basis: "b" },
        { resource: RESOURCES[1], moat_class: "none", durability: 2, basis: "b" },
      ],
      body_md: "## Moat read",
    }), RESOURCES)).toBeNull();
    expect(parseMoatAuditArtifact("not json at all", RESOURCES)).toBeNull();
  });

  it("clamps durability to 1-5 and defaults non-numeric scores to 1", () => {
    const parsed = parseMoatAuditArtifact(JSON.stringify({
      rows: [
        { resource: RESOURCES[0], moat_class: "switching_costs", durability: 9, basis: "b" },
        { resource: RESOURCES[1], moat_class: "none", durability: "high", basis: "b" },
      ],
      body_md: "## Moat read",
    }), RESOURCES);
    expect(parsed?.rows[0]?.durability).toBe(5);
    expect(parsed?.rows[1]?.durability).toBe(1);
  });
});
