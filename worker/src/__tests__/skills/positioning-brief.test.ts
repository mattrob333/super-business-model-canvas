import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { parsePositioningBriefArtifact, runPositioningBrief } from "../../jobs/skills/positioning-brief.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient } from "./harness.js";

const OWN_CLAIM = "Only platform with evidence-cited canvases";
const OWN_ASSUMPTION = "Assumption: fastest onboarding in the category";

function seedRequiredSections(client: SkillFakeClient): void {
  client.addOwnSection("value_propositions", [
    { text: OWN_CLAIM, evidence_ids: ["ev-own-vp"] },
    { text: OWN_ASSUMPTION, evidence_ids: [] },
  ]);
  client.addOwnSection("customer_segments", [
    { text: "Seed-stage SaaS founders", evidence_ids: ["ev-own-segment"] },
  ]);
}

function makeHandler(client: SkillFakeClient, runner: ScriptedSkillRunner): SkillRunHandler {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner,
    feedRunner: makeFakeFeedRunner({}),
  });
}

function briefOutput(): string {
  return JSON.stringify({
    statement: {
      for_segment: "Seed-stage SaaS founders",
      who_need: "need strategy work that turns competitor noise into a next move",
      category: "AI business-model canvas platform",
      key_differentiator: "evidence-cited canvases",
      unlike_alternative: "unlike blank-page strategy docs",
      because_proof: `grounded in "${OWN_CLAIM}"; onboarding speed remains unproven`,
    },
    pillars: [{
      pillar: "Proof over opinion",
      grounded_in: OWN_CLAIM,
      segment_language: "I can show investors where every claim comes from.",
    }, {
      // Not a verbatim canvas claim — the parser must drop this pillar.
      pillar: "Invented pillar",
      grounded_in: "A claim the canvas never made",
      segment_language: "Sounds great but nobody said it.",
    }],
    tone_notes: "Confident, evidence-first, no hype.",
    body_md: "## Positioning brief\nFor seed-stage SaaS founders who need proof before buying...",
  });
}

describe("forge.positioning_brief", () => {
  it("writes a grounded positioning brief with typed payload and completes the run", async () => {
    const client = new SkillFakeClient();
    seedRequiredSections(client);
    const runner = new ScriptedSkillRunner(briefOutput(), "{}");
    const handler = makeHandler(client, runner);
    await handler.runSkillModule(runPositioningBrief, makeSkillJob("forge.positioning_brief"));

    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "forge.positioning_brief",
      title: "Positioning brief — Acme Robotics",
      evidence_ids: ["ev-own-vp"],
    });
    const payload = artifact?.values.payload as Record<string, unknown>;
    expect(payload.statement).toMatchObject({
      for_segment: "Seed-stage SaaS founders",
      category: "AI business-model canvas platform",
    });
    // The invented pillar is dropped; only the verbatim-grounded one ships.
    expect(payload.pillars).toEqual([expect.objectContaining({ grounded_in: OWN_CLAIM })]);
    expect(payload.tone_notes).toBe("Confident, evidence-first, no hype.");
    expect(payload.verification).toBe("parser_grounded_pillars");
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({ status: "completed" });
  });

  it("never feeds the previous company's rows into the prompt", async () => {
    const client = new SkillFakeClient();
    seedRequiredSections(client);
    client.addTrapRow("value_propositions", "Stale old-company text");
    const runner = new ScriptedSkillRunner(briefOutput(), "{}");
    const handler = makeHandler(client, runner);
    await handler.runSkillModule(runPositioningBrief, makeSkillJob("forge.positioning_brief"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain(OWN_CLAIM);
    expect(mainPrompt).not.toContain("Stale old-company text");
  });

  it("fails honestly without our Value Propositions items", async () => {
    const client = new SkillFakeClient();
    client.addOwnSection("customer_segments", [{ text: "Seed-stage SaaS founders", evidence_ids: [] }]);
    const handler = makeHandler(client, new ScriptedSkillRunner(briefOutput(), "{}"));
    await expect(handler.runSkillModule(runPositioningBrief, makeSkillJob("forge.positioning_brief")))
      .rejects.toThrow(/requires our Value Propositions canvas items first/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("fails honestly without Customer Segments items", async () => {
    const client = new SkillFakeClient();
    client.addOwnSection("value_propositions", [{ text: OWN_CLAIM, evidence_ids: ["ev-own-vp"] }]);
    const handler = makeHandler(client, new ScriptedSkillRunner(briefOutput(), "{}"));
    await expect(handler.runSkillModule(runPositioningBrief, makeSkillJob("forge.positioning_brief")))
      .rejects.toThrow(/requires Customer Segments canvas items first/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("refuses to write an artifact when every pillar is invented", async () => {
    const client = new SkillFakeClient();
    seedRequiredSections(client);
    const invented = JSON.stringify({
      statement: {
        for_segment: "s", who_need: "n", category: "c",
        key_differentiator: "d", unlike_alternative: "u", because_proof: "p",
      },
      pillars: [{ pillar: "Made up", grounded_in: "A claim the canvas never made", segment_language: "x" }],
      tone_notes: "t",
      body_md: "## Positioning brief\n...",
    });
    const handler = makeHandler(client, new ScriptedSkillRunner(invented, "{}"));
    await expect(handler.runSkillModule(runPositioningBrief, makeSkillJob("forge.positioning_brief")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("parsePositioningBriefArtifact", () => {
  const allowed = [OWN_CLAIM, OWN_ASSUMPTION];

  it("parses a valid brief and drops non-verbatim pillars", () => {
    const parsed = parsePositioningBriefArtifact(briefOutput(), allowed);
    expect(parsed?.pillars).toHaveLength(1);
    expect(parsed?.pillars[0]).toMatchObject({ grounded_in: OWN_CLAIM });
    expect(parsed?.statement.because_proof).toContain("unproven");
    expect(parsed?.toneNotes).toBe("Confident, evidence-first, no hype.");
  });

  it("returns null when a statement slot is blank", () => {
    const output = JSON.parse(briefOutput()) as Record<string, unknown>;
    (output.statement as Record<string, unknown>).because_proof = "";
    expect(parsePositioningBriefArtifact(JSON.stringify(output), allowed)).toBeNull();
  });

  it("returns null when no pillar survives grounding or output is not JSON", () => {
    expect(parsePositioningBriefArtifact(briefOutput(), ["some other claim"])).toBeNull();
    expect(parsePositioningBriefArtifact("not json", allowed)).toBeNull();
  });
});
