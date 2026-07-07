import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { parsePositioningBriefArtifact, positioningBriefPrompt, runPositioningBrief } from "../../jobs/skills/positioning-brief.js";
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

  it("refuses to write an artifact when any pillar is invented", async () => {
    const client = new SkillFakeClient();
    seedRequiredSections(client);
    const output = JSON.parse(briefOutput()) as Record<string, unknown>;
    // One grounded pillar plus one invented one: the whole parse must fail —
    // dropping the invented pillar would still leave its claim in body_md.
    (output.pillars as unknown[]).push({
      pillar: "Invented pillar",
      grounded_in: "A claim the canvas never made",
      segment_language: "Sounds great but nobody said it.",
    });
    const invented = JSON.stringify(output);
    const handler = makeHandler(client, new ScriptedSkillRunner(invented, "{}"));
    await expect(handler.runSkillModule(runPositioningBrief, makeSkillJob("forge.positioning_brief")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("positioningBriefPrompt", () => {
  const ownClaims = [{ sectionKey: "value_propositions" as const, text: OWN_CLAIM, evidenceIds: [] }];
  const segments = [{ sectionKey: "customer_segments" as const, text: "Seed-stage SaaS founders", evidenceIds: [] }];
  const differentiatorAudit = {
    title: "Differentiator audit — Acme Robotics",
    body_md: "## Audit",
    payload: { defensible_claims: ["evidence-cited canvases"] },
  };
  const avatarRefinement = {
    title: "Avatar refinement — Acme Robotics",
    body_md: "## Avatar",
    payload: { segment_voice: "show me the receipts" },
  };

  it("includes prior artifacts labeled as prior analyses, each under its own skill's label", () => {
    const prompt = positioningBriefPrompt("Acme Robotics", ownClaims, segments, differentiatorAudit, avatarRefinement);
    expect(prompt).toContain(
      `Prior analysis — differentiator audit (${differentiatorAudit.title}):\n${JSON.stringify(differentiatorAudit.payload)}`,
    );
    expect(prompt).toContain(
      `Prior analysis — avatar refinement (${avatarRefinement.title}):\n${JSON.stringify(avatarRefinement.payload)}`,
    );
    expect(prompt).not.toContain("No prior analyses available yet.");
  });

  it("includes only the prior artifact that exists", () => {
    const prompt = positioningBriefPrompt("Acme Robotics", ownClaims, segments, null, avatarRefinement);
    expect(prompt).toContain("Prior analysis — avatar refinement");
    expect(prompt).not.toContain("Prior analysis — differentiator audit");
    expect(prompt).not.toContain("No prior analyses available yet.");
  });

  it("says no prior analyses are available when both are null", () => {
    const prompt = positioningBriefPrompt("Acme Robotics", ownClaims, segments, null, null);
    expect(prompt).toContain("No prior analyses available yet.");
    expect(prompt).not.toContain("Prior analysis —");
  });
});

describe("parsePositioningBriefArtifact", () => {
  const allowed = [OWN_CLAIM, OWN_ASSUMPTION];

  it("parses a valid brief", () => {
    const parsed = parsePositioningBriefArtifact(briefOutput(), allowed);
    expect(parsed?.pillars).toHaveLength(1);
    expect(parsed?.pillars[0]).toMatchObject({ grounded_in: OWN_CLAIM });
    expect(parsed?.statement.because_proof).toContain("unproven");
    expect(parsed?.toneNotes).toBe("Confident, evidence-first, no hype.");
  });

  it("returns null when any pillar is not a verbatim canvas claim", () => {
    const output = JSON.parse(briefOutput()) as Record<string, unknown>;
    (output.pillars as unknown[]).push({
      pillar: "Invented pillar",
      grounded_in: "A claim the canvas never made",
      segment_language: "x",
    });
    expect(parsePositioningBriefArtifact(JSON.stringify(output), allowed)).toBeNull();
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
