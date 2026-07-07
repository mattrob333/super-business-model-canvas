import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { LIFECYCLE_STAGES, parseLifecycleMapArtifact, runLifecycleMap } from "../../jobs/skills/lifecycle-map.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient } from "./harness.js";

const COMPETITORS = ["RivalCo"];

function lifecycleStages(): Array<Record<string, unknown>> {
  return [{
    stage: "discover",
    your_motion: "none recorded",
    competitor_motions: [],
    gap: false,
    recommendation: "Add a discover-stage nurture sequence to founder-led outbound.",
  }, {
    stage: "evaluate",
    your_motion: "none recorded",
    competitor_motions: [{ competitor: "RivalCo", motion: "RivalCo runs weekly live demos for evaluators." }],
    gap: true,
    recommendation: "Pilot a weekly live demo for evaluating accounts.",
  }, {
    stage: "onboard",
    your_motion: "Self-serve help center",
    competitor_motions: [{ competitor: "RivalCo", motion: "RivalCo assigns a dedicated onboarding manager for the first 90 days." }],
    gap: true,
    recommendation: "Offer a guided onboarding call to every new account.",
  }, {
    stage: "adopt",
    your_motion: "Self-serve help center",
    competitor_motions: [],
    gap: false,
    recommendation: "Track help-center usage per account to spot stalled adoption.",
  }, {
    stage: "expand",
    your_motion: "Founder-led quarterly check-ins",
    competitor_motions: [],
    gap: false,
    recommendation: "Add an expansion prompt to the quarterly check-in agenda.",
  }, {
    stage: "renew",
    your_motion: "Founder-led quarterly check-ins",
    competitor_motions: [],
    gap: false,
    recommendation: "Move renewal conversations into the quarterly check-in.",
  }];
}

function lifecycleOutput(stages: Array<Record<string, unknown>> = lifecycleStages()): string {
  return JSON.stringify({
    stages,
    body_md: "## Lifecycle map\nEvaluate and onboard are the open stages.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addOwnSection("customer_relationships", [
    { text: "Self-serve help center", evidence_ids: ["ev-own-cr-1"] },
    { text: "Founder-led quarterly check-ins", evidence_ids: ["ev-own-cr-2"] },
  ]);
  client.addOwnSection("channels", [
    { text: "Founder-led outbound", evidence_ids: ["ev-own-channel"] },
  ]);
  client.addCompetitorSection("customer_relationships", "RivalCo", [
    { text: "RivalCo runs weekly live demos for evaluators.", evidence_ids: ["ev-competitor-cr-1"] },
    { text: "RivalCo assigns a dedicated onboarding manager for the first 90 days.", evidence_ids: ["ev-competitor-cr-2", "ev-competitor-cr-1"] },
  ]);
}

function makeHandler(client: SkillFakeClient, runner: ScriptedSkillRunner): SkillRunHandler {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner,
    feedRunner: makeFakeFeedRunner({}),
  });
}

describe("anchor.lifecycle_map", () => {
  it("maps all six stages, spot-checks competitor motions, and writes a typed artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(lifecycleOutput(), JSON.stringify({ status: "confirmed", reason: "competitor text matches" }));
    await makeHandler(client, runner).runSkillModule(runLifecycleMap, makeSkillJob("anchor.lifecycle_map"));

    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "anchor.lifecycle_map",
      title: "Lifecycle map — 2 stage gaps",
    });
    const payload = artifact?.values.payload as { stages: Array<Record<string, unknown>>; spot_check: Record<string, unknown> };
    expect(payload.stages).toHaveLength(6);
    expect(payload.stages.map((row) => row.stage)).toEqual([...LIFECYCLE_STAGES]);
    expect(payload.stages[1]).toMatchObject({
      stage: "evaluate",
      your_motion: "none recorded",
      gap: true,
      competitor_motions: [{ competitor: "RivalCo", motion: "RivalCo runs weekly live demos for evaluators." }],
    });
    // Both competitor motions were verifiable and verified.
    expect(payload.spot_check).toEqual({ checked: 2, confirmed: 2 });
    // Evidence links are the COMPETITOR items' ids, deduped.
    expect(artifact?.values.evidence_ids).toEqual(["ev-competitor-cr-1", "ev-competitor-cr-2"]);
    expect(artifact?.values.inputs).toEqual({ sections: ["customer_relationships", "channels"], competitor_items: 2 });
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({ status: "completed", output: { skill_key: "anchor.lifecycle_map", stage_gaps: 2, spot_check_confirmed: 2 } });
  });

  it("never lets the previous company's relationship items reach the prompt", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER customer_relationships row from the ctx-0 era.
    client.addTrapRow("customer_relationships", "Stale old-company text");
    const runner = new ScriptedSkillRunner(lifecycleOutput(), JSON.stringify({ status: "confirmed", reason: "ok" }));
    await makeHandler(client, runner).runSkillModule(runLifecycleMap, makeSkillJob("anchor.lifecycle_map"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain("Self-serve help center");
    expect(mainPrompt).not.toContain("Stale old-company text");
  });

  it("fails honestly when our Customer Relationships section is empty — no artifact, no model call", async () => {
    const client = new SkillFakeClient();
    const runner = new ScriptedSkillRunner(lifecycleOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runLifecycleMap, makeSkillJob("anchor.lifecycle_map")))
      .rejects.toThrow(/requires our Customer Relationships canvas items first/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly without competitor Customer Relationships research", async () => {
    const client = new SkillFakeClient();
    client.addOwnSection("customer_relationships", [
      { text: "Self-serve help center", evidence_ids: ["ev-own-cr-1"] },
    ]);
    const runner = new ScriptedSkillRunner(lifecycleOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runLifecycleMap, makeSkillJob("anchor.lifecycle_map")))
      .rejects.toThrow(/requires competitor Customer Relationships research first/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact from invented model output", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // A map missing five of the six stages is not a lifecycle map.
    const runner = new ScriptedSkillRunner(lifecycleOutput(lifecycleStages().slice(0, 1)), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runLifecycleMap, makeSkillJob("anchor.lifecycle_map")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("parseLifecycleMapArtifact", () => {
  it("parses a complete map with all six stages in order", () => {
    const parsed = parseLifecycleMapArtifact(lifecycleOutput(), COMPETITORS);
    expect(parsed?.stages.map((row) => row.stage)).toEqual([...LIFECYCLE_STAGES]);
    expect(parsed?.bodyMd).toContain("Lifecycle map");
  });

  it("drops motions naming an unresearched competitor but keeps the stage with zero motions", () => {
    const stages = lifecycleStages();
    stages[1].competitor_motions = [{ competitor: "MadeUpCo", motion: "MadeUpCo does invented things." }];
    const parsed = parseLifecycleMapArtifact(lifecycleOutput(stages), COMPETITORS);
    expect(parsed?.stages[1]?.competitor_motions).toEqual([]);
    expect(parsed?.stages[2]?.competitor_motions).toHaveLength(1);
  });

  it("returns null when a stage is missing or shuffled", () => {
    expect(parseLifecycleMapArtifact(lifecycleOutput(lifecycleStages().slice(1)), COMPETITORS)).toBeNull();
    const shuffled = lifecycleStages();
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    expect(parseLifecycleMapArtifact(lifecycleOutput(shuffled), COMPETITORS)).toBeNull();
  });

  it("returns null on a non-boolean gap, an invented stage name, or non-JSON", () => {
    const nonBoolean = lifecycleStages();
    nonBoolean[3].gap = "yes";
    expect(parseLifecycleMapArtifact(lifecycleOutput(nonBoolean), COMPETITORS)).toBeNull();
    const invented = lifecycleStages();
    invented[5].stage = "churn_rescue";
    expect(parseLifecycleMapArtifact(lifecycleOutput(invented), COMPETITORS)).toBeNull();
    expect(parseLifecycleMapArtifact("not json at all", COMPETITORS)).toBeNull();
  });

  it("returns null when body_md or a stage's your_motion is missing", () => {
    expect(parseLifecycleMapArtifact(JSON.stringify({ stages: lifecycleStages() }), COMPETITORS)).toBeNull();
    const blankMotion = lifecycleStages();
    blankMotion[0].your_motion = "";
    expect(parseLifecycleMapArtifact(lifecycleOutput(blankMotion), COMPETITORS)).toBeNull();
  });
});
