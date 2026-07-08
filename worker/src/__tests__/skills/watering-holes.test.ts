import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { parseWateringHolesArtifact, runWateringHoles, wateringHolesPrompt } from "../../jobs/skills/watering-holes.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient } from "./harness.js";

const SEGMENTS = [
  "Mid-market factory operations managers",
  "Robotics system integrators",
];

const EXCERPTS = [
  "Mid-market factory operations managers swap automation war stories in the r/PLC subreddit and meet yearly at the Automate trade show.",
  "Robotics integrators hang out on the ROS Discourse forum, where vendor self-promotion gets flagged unless you share working code first.",
];

function feedFixtures() {
  return makeFakeFeedRunner({
    "watering_holes:": [{
      title: "Where factory ops managers hang out",
      excerpt: EXCERPTS[0],
      sourceType: "social",
      sourceName: "Web Search",
      sourceUrl: "https://community.example/factory-ops",
    }, {
      title: "Robotics integrator communities",
      excerpt: EXCERPTS[1],
      sourceType: "social",
      sourceName: "Web Search",
      // No sourceUrl — the skill must fall back to the feed name.
    }],
  });
}

function holesOutput(): string {
  return JSON.stringify({
    holes: [{
      name: "r/PLC subreddit",
      segment: SEGMENTS[0],
      evidence_quote: "swap automation war stories in the r/PLC subreddit",
      entry_strategy: "Answer troubleshooting threads for a month before ever mentioning the product.",
    }, {
      name: "ROS Discourse forum",
      segment: SEGMENTS[1],
      evidence_quote: "vendor self-promotion gets flagged unless you share working code first",
      entry_strategy: "Publish an open-source integration example and share it as a code-first post.",
    }],
    body_md: "## Watering holes\nStart with r/PLC — highest segment concentration.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addOwnSection("customer_segments", [
    { text: SEGMENTS[0], evidence_ids: ["ev-own-cs"] },
    { text: SEGMENTS[1], evidence_ids: [] },
  ]);
  client.addOwnSection("channels", [
    { text: "Outbound sales to plant managers", evidence_ids: [] },
  ]);
}

function makeHandler(client: SkillFakeClient, runner: ScriptedSkillRunner): SkillRunHandler {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner,
    feedRunner: feedFixtures(),
  });
}

describe("relay.watering_holes", () => {
  it("maps ranked holes from feed evidence and writes a verified artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(holesOutput(), JSON.stringify({ status: "confirmed", reason: "excerpt names the community" }));
    await makeHandler(client, runner).runSkillModule(runWateringHoles, makeSkillJob("relay.watering_holes"));

    // Every excerpt fed to the model landed on the evidence ledger first.
    expect(client.inserts.filter((entry) => entry.table === "evidence_items")).toHaveLength(2);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "relay.watering_holes",
      title: "Watering holes — 2 holes across 2 segments",
      evidence_ids: ["evidence-1"],
    });
    const payload = artifact?.values.payload as {
      holes: Array<Record<string, unknown>>;
      spot_check: Record<string, unknown>;
    };
    expect(payload.holes).toHaveLength(2);
    expect(payload.holes[0]).toMatchObject({ rank: 1, name: "r/PLC subreddit", segment: SEGMENTS[0] });
    expect(payload.holes[1]).toMatchObject({ rank: 2, name: "ROS Discourse forum", segment: SEGMENTS[1] });
    expect(payload.spot_check).toEqual({ checked: 2, confirmed: 2 });
    // Segments drive the prompt; own Channels items ride along as context.
    expect(runner.requests[0]?.prompt).toContain(SEGMENTS[0]);
    expect(runner.requests[0]?.prompt).toContain("Outbound sales to plant managers");
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({ status: "completed", output: { skill_key: "relay.watering_holes", holes: 2, spot_check_confirmed: 2 } });
  });

  it("scopes the feed cache key to the analyzed company so a re-analyzed account never reuses stale excerpts", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(holesOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    const seen: Array<{ cacheKey: string; query: string }> = [];
    const inner = feedFixtures() as { refresh(request: { cacheKey?: string; feedKey: string; query?: string }): Promise<unknown> };
    const spyingFeedRunner = {
      async refresh(request: { cacheKey?: string; feedKey: string; query?: string }) {
        seen.push({ cacheKey: request.cacheKey ?? "", query: request.query ?? "" });
        return inner.refresh(request);
      },
    } as never;
    const handler = new SkillRunHandler({ client: client.asSupabase(), runner, feedRunner: spyingFeedRunner });
    await handler.runSkillModule(runWateringHoles, makeSkillJob("relay.watering_holes"));
    // Without the company slug, switching companies within the feed TTL would
    // serve the previous company's cached community excerpts.
    expect(seen.map((request) => request.cacheKey)).toEqual(["watering_holes:account-1:acme-robotics"]);
    // The segments themselves are the search query.
    expect(seen[0]?.query).toContain(SEGMENTS[0]);
    expect(seen[0]?.query).toContain("online communities forums events where they discuss");
  });

  it("never lets the previous company's segments reach the prompt or the search query", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER customer_segments row from the ctx-0 era.
    client.addTrapRow("customer_segments", "Stale old-company segment");
    const runner = new ScriptedSkillRunner(holesOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    await makeHandler(client, runner).runSkillModule(runWateringHoles, makeSkillJob("relay.watering_holes"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain(SEGMENTS[0]);
    expect(mainPrompt).not.toContain("Stale old-company segment");
  });

  it("fails honestly when no company has been analyzed — no artifact, no model call", async () => {
    const client = new SkillFakeClient();
    // No contexts at all: scope.companyName resolves to null.
    client.contexts = [];
    const runner = new ScriptedSkillRunner(holesOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runWateringHoles, makeSkillJob("relay.watering_holes")))
      .rejects.toThrow(/requires an analyzed company first/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when Customer Segments is empty — the exact owner-facing message, before any model call", async () => {
    const client = new SkillFakeClient();
    // Channels alone are not enough — the segments ARE the search.
    client.addOwnSection("channels", [{ text: "Outbound sales to plant managers", evidence_ids: [] }]);
    const runner = new ScriptedSkillRunner(holesOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runWateringHoles, makeSkillJob("relay.watering_holes")))
      .rejects.toThrow("watering_holes requires Customer Segments canvas items first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when the feed returns no community evidence", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(holesOutput(), "{}");
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runWateringHoles, makeSkillJob("relay.watering_holes")))
      .rejects.toThrow(/could not retrieve community evidence/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact when a hole cites from the model's memory", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // The quote appears in no retrieved excerpt — a memory-cited community.
    const runner = new ScriptedSkillRunner(JSON.stringify({
      holes: [{
        name: "GhostForum",
        segment: SEGMENTS[0],
        evidence_quote: "GhostForum is where everyone in manufacturing hangs out",
        entry_strategy: "Post an intro thread.",
      }],
      body_md: "## Watering holes",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runWateringHoles, makeSkillJob("relay.watering_holes")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("hard-fails on a contradicted spot-check — no artifact written", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(holesOutput(), JSON.stringify({ status: "contradicted", reason: "excerpt names a different community" }));
    await expect(makeHandler(client, runner).runSkillModule(runWateringHoles, makeSkillJob("relay.watering_holes")))
      .rejects.toThrow(/spot-check contradicted/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("wateringHolesPrompt", () => {
  it("carries segments as the grounding list, channels as context, and every excerpt", () => {
    const prompt = wateringHolesPrompt(
      "Acme Robotics",
      EXCERPTS,
      [{ sectionKey: "customer_segments", text: SEGMENTS[0], evidenceIds: [] }],
      [],
    );
    expect(prompt).toContain("Acme Robotics");
    expect(prompt).toContain(`- ${SEGMENTS[0]}`);
    expect(prompt).toContain("- (none recorded)");
    expect(prompt).toContain(EXCERPTS[0]);
    expect(prompt).toContain(EXCERPTS[1]);
    expect(prompt).toContain("VERBATIM");
  });
});

describe("parseWateringHolesArtifact", () => {
  it("parses grounded holes and assigns ranks from the model's order", () => {
    const parsed = parseWateringHolesArtifact(holesOutput(), EXCERPTS, SEGMENTS);
    expect(parsed?.holes.map((hole) => hole.rank)).toEqual([1, 2]);
    expect(parsed?.holes.map((hole) => hole.name)).toEqual(["r/PLC subreddit", "ROS Discourse forum"]);
    expect(parsed?.bodyMd).toContain("Watering holes");
  });

  it("rejects the WHOLE parse when any hole's quote is not a substring of an excerpt — even alongside grounded holes", () => {
    const mixed = JSON.stringify({
      holes: [{
        name: "r/PLC subreddit",
        segment: SEGMENTS[0],
        evidence_quote: "swap automation war stories in the r/PLC subreddit",
        entry_strategy: "Answer threads first.",
      }, {
        name: "GhostForum",
        segment: SEGMENTS[1],
        evidence_quote: "not in any excerpt",
        entry_strategy: "Post an intro thread.",
      }],
      body_md: "## Watering holes",
    });
    expect(parseWateringHolesArtifact(mixed, EXCERPTS, SEGMENTS)).toBeNull();
  });

  it("rejects the whole parse when a hole's segment is a paraphrase instead of our verbatim canvas item", () => {
    const paraphrased = JSON.stringify({
      holes: [{
        name: "r/PLC subreddit",
        segment: "Factory ops managers at mid-market plants",
        evidence_quote: "swap automation war stories in the r/PLC subreddit",
        entry_strategy: "Answer threads first.",
      }],
      body_md: "## Watering holes",
    });
    expect(parseWateringHolesArtifact(paraphrased, EXCERPTS, SEGMENTS)).toBeNull();
  });

  it("rejects missing fields, empty hole lists, missing body_md, and non-JSON", () => {
    expect(parseWateringHolesArtifact(JSON.stringify({
      holes: [{
        name: "r/PLC subreddit",
        segment: SEGMENTS[0],
        evidence_quote: "swap automation war stories in the r/PLC subreddit",
        // entry_strategy missing
      }],
      body_md: "## Watering holes",
    }), EXCERPTS, SEGMENTS)).toBeNull();
    expect(parseWateringHolesArtifact(JSON.stringify({ holes: [], body_md: "## Watering holes" }), EXCERPTS, SEGMENTS)).toBeNull();
    expect(parseWateringHolesArtifact(JSON.stringify({
      holes: [{
        name: "r/PLC subreddit",
        segment: SEGMENTS[0],
        evidence_quote: "swap automation war stories in the r/PLC subreddit",
        entry_strategy: "Answer threads first.",
      }],
      // body_md missing
    }), EXCERPTS, SEGMENTS)).toBeNull();
    expect(parseWateringHolesArtifact("not json at all", EXCERPTS, SEGMENTS)).toBeNull();
  });
});
