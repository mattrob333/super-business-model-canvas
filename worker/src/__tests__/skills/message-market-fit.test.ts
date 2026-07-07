import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import {
  messageMarketFitPrompt,
  parseMessageMarketFitArtifact,
  runMessageMarketFit,
} from "../../jobs/skills/message-market-fit.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient } from "./harness.js";

const VP_LINE_ONE = "Evidence-cited canvases eliminate strategy guesswork";
const VP_LINE_TWO = "Enterprise-grade orchestration for solo founders";

function seedRequiredSections(client: SkillFakeClient): void {
  client.addOwnSection("value_propositions", [
    { text: VP_LINE_ONE, evidence_ids: ["ev-own-vp"] },
    { text: VP_LINE_TWO, evidence_ids: [] },
  ]);
  client.addOwnSection("customer_segments", [
    { text: "Seed-stage SaaS founders who say 'I'm drowning in competitor noise'", evidence_ids: ["ev-own-segment"] },
  ]);
}

function makeHandler(client: SkillFakeClient, runner: ScriptedSkillRunner): SkillRunHandler {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner,
    feedRunner: makeFakeFeedRunner({}),
  });
}

function fitOutput(): string {
  return JSON.stringify({
    rows: [
      {
        your_line: VP_LINE_ONE,
        their_words: "I can finally show investors where every claim comes from instead of drowning in competitor noise.",
        why_it_lands: "It reuses the segment's own 'drowning in competitor noise' framing instead of our feature language.",
        status: "rewritten",
      },
      {
        your_line: VP_LINE_TWO,
        their_words: null,
        why_it_lands: "No segment language about orchestration exists in the canvas or prior research — run avatar refinement to capture how they describe this.",
        status: "unknown",
      },
    ],
    body_md: "## Message-market fit\n| Your line | Their words | Why it lands |\n|---|---|---|\n...",
  });
}

describe("compass.message_market_fit", () => {
  it("writes a grounded before/after table with typed payload and completes the run", async () => {
    const client = new SkillFakeClient();
    seedRequiredSections(client);
    const runner = new ScriptedSkillRunner(fitOutput(), "{}");
    const handler = makeHandler(client, runner);
    await handler.runSkillModule(runMessageMarketFit, makeSkillJob("compass.message_market_fit"));

    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "compass.message_market_fit",
      title: "Message-market fit — 1 of 2 lines rewritten in segment language",
      evidence_ids: ["ev-own-vp", "ev-own-segment"],
    });
    const payload = artifact?.values.payload as Record<string, unknown>;
    expect(payload.rows).toEqual([
      expect.objectContaining({ your_line: VP_LINE_ONE, status: "rewritten" }),
      expect.objectContaining({ your_line: VP_LINE_TWO, status: "unknown", their_words: null }),
    ]);
    expect(payload.verification).toBe("parser_grounded_rows");
    expect(artifact?.values.inputs).toMatchObject({
      sections: ["value_propositions", "customer_segments"],
    });
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({ status: "completed" });
  });

  it("never feeds the previous company's rows into the prompt", async () => {
    const client = new SkillFakeClient();
    seedRequiredSections(client);
    client.addTrapRow("value_propositions", "Stale old-company value prop");
    client.addTrapRow("customer_segments", "Stale old-company segment");
    const runner = new ScriptedSkillRunner(fitOutput(), "{}");
    const handler = makeHandler(client, runner);
    await handler.runSkillModule(runMessageMarketFit, makeSkillJob("compass.message_market_fit"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain(VP_LINE_ONE);
    expect(mainPrompt).toContain("Seed-stage SaaS founders");
    expect(mainPrompt).not.toContain("Stale old-company value prop");
    expect(mainPrompt).not.toContain("Stale old-company segment");
  });

  it("fails honestly without our Value Propositions items", async () => {
    const client = new SkillFakeClient();
    client.addOwnSection("customer_segments", [{ text: "Seed-stage SaaS founders", evidence_ids: [] }]);
    const runner = new ScriptedSkillRunner(fitOutput(), "{}");
    const handler = makeHandler(client, runner);
    await expect(handler.runSkillModule(runMessageMarketFit, makeSkillJob("compass.message_market_fit")))
      .rejects.toThrow("message_market_fit requires our Value Propositions canvas items first");
    expect(runner.requests).toHaveLength(0);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("fails honestly without Customer Segments items", async () => {
    const client = new SkillFakeClient();
    client.addOwnSection("value_propositions", [{ text: VP_LINE_ONE, evidence_ids: ["ev-own-vp"] }]);
    const runner = new ScriptedSkillRunner(fitOutput(), "{}");
    const handler = makeHandler(client, runner);
    await expect(handler.runSkillModule(runMessageMarketFit, makeSkillJob("compass.message_market_fit")))
      .rejects.toThrow("message_market_fit requires Customer Segments canvas items first");
    expect(runner.requests).toHaveLength(0);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("refuses to write an artifact when any row's your_line is not verbatim canvas text", async () => {
    const client = new SkillFakeClient();
    seedRequiredSections(client);
    const output = JSON.parse(fitOutput()) as Record<string, unknown>;
    // Paraphrasing our own line is still inventing — the whole parse must
    // fail, not just drop the row.
    (output.rows as Array<Record<string, unknown>>)[0].your_line = "Evidence-backed canvases remove guesswork";
    const handler = makeHandler(client, new ScriptedSkillRunner(JSON.stringify(output), "{}"));
    await expect(handler.runSkillModule(runMessageMarketFit, makeSkillJob("compass.message_market_fit")))
      .rejects.toThrow("message_market_fit produced unparseable output; refusing to write an artifact");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("messageMarketFitPrompt", () => {
  const valueProps = [
    { sectionKey: "value_propositions" as const, text: VP_LINE_ONE, evidenceIds: [] },
    { sectionKey: "value_propositions" as const, text: VP_LINE_TWO, evidenceIds: [] },
  ];
  const segments = [
    { sectionKey: "customer_segments" as const, text: "Seed-stage SaaS founders", evidenceIds: [] },
  ];
  const avatarRefinement = {
    title: "Avatar refinement — Acme Robotics",
    body_md: "## Avatar",
    payload: { pain_quotes: ["I'm drowning in competitor noise"] },
  };

  it("includes both sections and labels the avatar refinement as segment language", () => {
    const prompt = messageMarketFitPrompt("Acme Robotics", valueProps, segments, avatarRefinement);
    expect(prompt).toContain(VP_LINE_ONE);
    expect(prompt).toContain(VP_LINE_TWO);
    expect(prompt).toContain("Seed-stage SaaS founders");
    expect(prompt).toContain(
      `Prior analysis — avatar refinement (${avatarRefinement.title}); its pain quotes are the segment's own language`,
    );
    expect(prompt).toContain(JSON.stringify(avatarRefinement.payload));
    expect(prompt).not.toContain("No prior avatar research available");
  });

  it("says honestly when no prior avatar research exists", () => {
    const prompt = messageMarketFitPrompt("Acme Robotics", valueProps, segments, null);
    expect(prompt).toContain("No prior avatar research available");
    expect(prompt).not.toContain("Prior analysis — avatar refinement");
  });
});

describe("parseMessageMarketFitArtifact", () => {
  const allowed = [VP_LINE_ONE, VP_LINE_TWO];

  it("parses a complete table preserving canvas order", () => {
    const parsed = parseMessageMarketFitArtifact(fitOutput(), allowed);
    expect(parsed?.rows).toHaveLength(2);
    expect(parsed?.rows[0]).toMatchObject({ your_line: VP_LINE_ONE, status: "rewritten" });
    expect(parsed?.rows[0].their_words).toContain("drowning in competitor noise");
    expect(parsed?.rows[1]).toMatchObject({ your_line: VP_LINE_TWO, status: "unknown", their_words: null });
    expect(parsed?.bodyMd).toContain("Message-market fit");
  });

  it("returns null when a row is not a verbatim canvas line", () => {
    const output = JSON.parse(fitOutput()) as Record<string, unknown>;
    (output.rows as Array<Record<string, unknown>>)[1].your_line = "A line the canvas never wrote";
    expect(parseMessageMarketFitArtifact(JSON.stringify(output), allowed)).toBeNull();
  });

  it("returns null when a canvas line is missing from the table", () => {
    const output = JSON.parse(fitOutput()) as Record<string, unknown>;
    output.rows = (output.rows as unknown[]).slice(0, 1);
    expect(parseMessageMarketFitArtifact(JSON.stringify(output), allowed)).toBeNull();
  });

  it("returns null when a canvas line appears twice", () => {
    const output = JSON.parse(fitOutput()) as Record<string, unknown>;
    const rows = output.rows as Array<Record<string, unknown>>;
    output.rows = [rows[0], { ...rows[0] }];
    expect(parseMessageMarketFitArtifact(JSON.stringify(output), allowed)).toBeNull();
  });

  it("returns null when a rewritten row has no their_words", () => {
    const output = JSON.parse(fitOutput()) as Record<string, unknown>;
    (output.rows as Array<Record<string, unknown>>)[0].their_words = null;
    expect(parseMessageMarketFitArtifact(JSON.stringify(output), allowed)).toBeNull();
  });

  it("returns null when an unknown row carries an invented rewrite", () => {
    const output = JSON.parse(fitOutput()) as Record<string, unknown>;
    (output.rows as Array<Record<string, unknown>>)[1].their_words = "Sounds great but nobody said it";
    expect(parseMessageMarketFitArtifact(JSON.stringify(output), allowed)).toBeNull();
  });

  it("returns null on an unrecognized status, missing body_md, or non-JSON output", () => {
    const badStatus = JSON.parse(fitOutput()) as Record<string, unknown>;
    (badStatus.rows as Array<Record<string, unknown>>)[0].status = "improvised";
    expect(parseMessageMarketFitArtifact(JSON.stringify(badStatus), allowed)).toBeNull();

    const noBody = JSON.parse(fitOutput()) as Record<string, unknown>;
    delete noBody.body_md;
    expect(parseMessageMarketFitArtifact(JSON.stringify(noBody), allowed)).toBeNull();

    expect(parseMessageMarketFitArtifact("not json", allowed)).toBeNull();
  });
});
