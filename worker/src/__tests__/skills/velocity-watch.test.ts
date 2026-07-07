import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { parseVelocityWatchArtifact, runVelocityWatch } from "../../jobs/skills/velocity-watch.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient, SkillFakeQuery } from "./harness.js";

// The fake client's researched competitor is RivalCo (comp-1).
const COMPETITORS = ["RivalCo"];

const EXCERPTS = [
  "RivalCo shipped version 4.0 of its fleet dashboard this month, adding real-time route optimization.",
  "In its latest changelog RivalCo announced a self-serve onboarding flow rolled out to all customers.",
];

function feedFixtures() {
  return makeFakeFeedRunner({
    "velocity_watch:": [{
      title: "RivalCo v4.0 launch",
      excerpt: EXCERPTS[0],
      sourceType: "social",
      sourceName: "Grok Live Search",
      sourceUrl: "https://news.example/rivalco-v4",
    }, {
      title: "RivalCo changelog",
      excerpt: EXCERPTS[1],
      sourceType: "social",
      sourceName: "Grok Live Search",
      // No sourceUrl — the skill must fall back to the feed name.
    }],
  });
}

function watchOutput(): string {
  return JSON.stringify({
    reads: [{
      competitor: "RivalCo",
      read: "shipping_observed",
      observations: [{
        what_shipped: "A 4.0 release of their fleet dashboard with real-time route optimization.",
        evidence_quote: "shipped version 4.0 of its fleet dashboard",
      }, {
        what_shipped: "A self-serve onboarding flow rolled out to every customer.",
        evidence_quote: "self-serve onboarding flow rolled out to all customers",
      }],
      pace_read: "Two customer-visible releases in one month is faster than our current cadence.",
    }],
    velocity_insight: "RivalCo is outshipping us on customer-facing releases this month.",
    insight_basis: "evidence_delta",
    body_md: "## Velocity watch\nRivalCo shipped twice this month.",
  });
}

/** An honest all-thin output: no observations, no invented delta. */
function thinOutput(): string {
  return JSON.stringify({
    reads: [{
      competitor: "RivalCo",
      read: "evidence_thin",
      observations: [],
      pace_read: "The excerpts show nothing recent from RivalCo — too thin to read a pace.",
    }],
    velocity_insight: "The retrieved evidence is too thin to read a velocity delta this run.",
    insight_basis: "evidence_too_thin",
    body_md: "## Velocity watch\nNo recent shipping signal retrieved.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addOwnSection("key_activities", [
    { text: "Weekly firmware release train", evidence_ids: ["ev-own-ka"] },
  ]);
}

function makeHandler(client: SkillFakeClient, runner: ScriptedSkillRunner): SkillRunHandler {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner,
    feedRunner: feedFixtures(),
  });
}

/** Same fake, but the account has NO researched competitors. */
class NoCompetitorClient extends SkillFakeClient {
  from(table: string): SkillFakeQuery {
    if (table !== "companies") return super.from(table);
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      order: () => query,
      limit: () => query,
      then: <T>(onfulfilled?: ((value: { data: unknown; error: null }) => T | PromiseLike<T>) | null) =>
        Promise.resolve({ data: [], error: null }).then(onfulfilled),
    };
    return query as unknown as SkillFakeQuery;
  }
}

describe("tempo.velocity_watch", () => {
  it("reads competitor shipping from feed evidence and writes a verified artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(watchOutput(), JSON.stringify({ status: "confirmed", reason: "excerpt reports the launch" }));
    await makeHandler(client, runner).runSkillModule(runVelocityWatch, makeSkillJob("tempo.velocity_watch"));

    // Every excerpt fed to the model landed on the evidence ledger first.
    expect(client.inserts.filter((entry) => entry.table === "evidence_items")).toHaveLength(2);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "tempo.velocity_watch",
      title: "Velocity watch — 1 of 1 competitors show recent shipping",
    });
    // Ledger ids for the excerpts AND our own activities back the artifact.
    expect(artifact?.values.evidence_ids).toEqual(["evidence-1", "ev-own-ka"]);
    const payload = artifact?.values.payload as {
      reads: Array<Record<string, unknown>>;
      velocity_insight: string;
      insight_basis: string;
      shipping_observed: number;
      evidence_thin: number;
      spot_check: Record<string, unknown>;
    };
    expect(payload.reads).toHaveLength(1);
    expect(payload.reads[0]).toMatchObject({ competitor: "RivalCo", read: "shipping_observed" });
    expect((payload.reads[0]?.observations as unknown[])).toHaveLength(2);
    expect(payload.velocity_insight).toContain("outshipping");
    expect(payload.insight_basis).toBe("evidence_delta");
    expect(payload.shipping_observed).toBe(1);
    expect(payload.evidence_thin).toBe(0);
    // Both grounded observations were spot-checked (<=4).
    expect(payload.spot_check).toEqual({ checked: 2, confirmed: 2 });
    // Own activities are optional context in the prompt; the prompt names the competitors.
    expect(runner.requests[0]?.prompt).toContain("Weekly firmware release train");
    expect(runner.requests[0]?.prompt).toContain("RivalCo");
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({ status: "completed", output: { skill_key: "tempo.velocity_watch", competitors: 1, shipping_observed: 1, spot_check_confirmed: 2 } });
  });

  it("scopes the feed cache key to the analyzed company and queries the competitors' launch news", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(watchOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    const seen: Array<{ cacheKey: string; query: string }> = [];
    const inner = feedFixtures() as { refresh(request: { cacheKey?: string; feedKey: string; query?: string }): Promise<unknown> };
    const spyingFeedRunner = {
      async refresh(request: { cacheKey?: string; feedKey: string; query?: string }) {
        seen.push({ cacheKey: request.cacheKey ?? "", query: request.query ?? "" });
        return inner.refresh(request);
      },
    } as never;
    const handler = new SkillRunHandler({ client: client.asSupabase(), runner, feedRunner: spyingFeedRunner });
    await handler.runSkillModule(runVelocityWatch, makeSkillJob("tempo.velocity_watch"));
    // Without the company slug, switching companies within the feed TTL would
    // serve the previous company's cached launch excerpts; without the
    // competitor roster, adding a new competitor within the TTL would serve
    // excerpts from a query that never mentioned them.
    expect(seen).toEqual([{
      cacheKey: "velocity_watch:account-1:acme-robotics:rivalco",
      query: "RivalCo product launch changelog release announcement recent",
    }]);
  });

  it("never lets the previous company's key activities reach the prompt", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER key_activities row from the ctx-0 era.
    client.addTrapRow("key_activities", "Stale old-company text");
    const runner = new ScriptedSkillRunner(watchOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    await makeHandler(client, runner).runSkillModule(runVelocityWatch, makeSkillJob("tempo.velocity_watch"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain("Weekly firmware release train");
    expect(mainPrompt).not.toContain("Stale old-company text");
  });

  it("fails honestly when no competitor has been researched — no feed call, no model call, no artifact", async () => {
    const client = new NoCompetitorClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(watchOutput(), "{}");
    // An empty feed fixture would throw its own message — reaching the exact
    // competitor message proves the skill threw BEFORE touching the feed.
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runVelocityWatch, makeSkillJob("tempo.velocity_watch")))
      .rejects.toThrow("velocity_watch requires at least one researched competitor first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when the feed returns no launch evidence", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(watchOutput(), "{}");
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runVelocityWatch, makeSkillJob("tempo.velocity_watch")))
      .rejects.toThrow(/could not retrieve competitor launch evidence/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact from invented model output", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // The quote appears in no retrieved excerpt — a memory-cited launch.
    const runner = new ScriptedSkillRunner(JSON.stringify({
      reads: [{
        competitor: "RivalCo",
        read: "shipping_observed",
        observations: [{
          what_shipped: "s",
          evidence_quote: "RivalCo quietly launched an AI copilot last quarter",
        }],
        pace_read: "p",
      }],
      velocity_insight: "i",
      insight_basis: "evidence_delta",
      body_md: "## Velocity watch",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runVelocityWatch, makeSkillJob("tempo.velocity_watch")))
      .rejects.toThrow("velocity_watch produced unparseable output; refusing to write an artifact");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("writes an honest all-thin artifact with zero spot-checks and no verify call", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(thinOutput(), JSON.stringify({ status: "contradicted", reason: "must never be consulted" }));
    await makeHandler(client, runner).runSkillModule(runVelocityWatch, makeSkillJob("tempo.velocity_watch"));

    // Exactly one model pass: no observations means nothing external to
    // verify, and no verifier call was faked (a verify call would have
    // returned "contradicted" and hard-failed the run).
    expect(runner.requests).toHaveLength(1);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({ title: "Velocity watch — 0 of 1 competitors show recent shipping" });
    const payload = artifact?.values.payload as Record<string, unknown>;
    expect(payload.insight_basis).toBe("evidence_too_thin");
    expect(payload.spot_check).toEqual({ checked: 0, confirmed: 0 });
  });

  it("hard-fails on a contradicted spot-check — no artifact written", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(watchOutput(), JSON.stringify({ status: "contradicted", reason: "excerpt reports a different release" }));
    await expect(makeHandler(client, runner).runSkillModule(runVelocityWatch, makeSkillJob("tempo.velocity_watch")))
      .rejects.toThrow(/spot-check contradicted/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("parseVelocityWatchArtifact", () => {
  it("parses grounded reads quoted verbatim from the excerpts", () => {
    const parsed = parseVelocityWatchArtifact(watchOutput(), EXCERPTS, COMPETITORS);
    expect(parsed?.reads).toHaveLength(1);
    expect(parsed?.reads[0]?.observations.map((observation) => observation.evidence_quote)).toEqual([
      "shipped version 4.0 of its fleet dashboard",
      "self-serve onboarding flow rolled out to all customers",
    ]);
    expect(parsed?.insight_basis).toBe("evidence_delta");
    expect(parsed?.bodyMd).toContain("Velocity watch");
  });

  it("rejects the WHOLE parse when any observation's quote is not a substring of an excerpt", () => {
    const mixed = JSON.stringify({
      reads: [{
        competitor: "RivalCo",
        read: "shipping_observed",
        observations: [{
          what_shipped: "s",
          evidence_quote: "shipped version 4.0 of its fleet dashboard",
        }, {
          what_shipped: "s",
          evidence_quote: "not in any excerpt",
        }],
        pace_read: "p",
      }],
      velocity_insight: "i",
      insight_basis: "evidence_delta",
      body_md: "## Velocity watch",
    });
    // One invented observation rejects everything — dropping it would still
    // ship its narrative inside body_md.
    expect(parseVelocityWatchArtifact(mixed, EXCERPTS, COMPETITORS)).toBeNull();
  });

  it("rejects reads about a competitor we never researched and incomplete competitor coverage", () => {
    expect(parseVelocityWatchArtifact(JSON.stringify({
      reads: [{
        competitor: "MadeUpCorp",
        read: "shipping_observed",
        observations: [{ what_shipped: "s", evidence_quote: "shipped version 4.0 of its fleet dashboard" }],
        pace_read: "p",
      }],
      velocity_insight: "i",
      insight_basis: "evidence_delta",
      body_md: "## Velocity watch",
    }), EXCERPTS, COMPETITORS)).toBeNull();
    // RivalCo missing entirely — a partial watch hides the competitor who
    // might be outshipping us.
    expect(parseVelocityWatchArtifact(watchOutput(), EXCERPTS, ["RivalCo", "OtherCo"])).toBeNull();
  });

  it("rejects a claimed evidence_delta when no shipping was actually observed", () => {
    const inventedDelta = JSON.parse(thinOutput()) as Record<string, unknown>;
    inventedDelta.insight_basis = "evidence_delta";
    expect(parseVelocityWatchArtifact(JSON.stringify(inventedDelta), EXCERPTS, COMPETITORS)).toBeNull();
    // The honest version of the same output parses.
    const honest = parseVelocityWatchArtifact(thinOutput(), EXCERPTS, COMPETITORS);
    expect(honest?.insight_basis).toBe("evidence_too_thin");
    expect(honest?.reads[0]).toMatchObject({ read: "evidence_thin", observations: [] });
  });

  it("normalizes stray observations on an evidence_thin read to empty", () => {
    const decorated = JSON.stringify({
      reads: [{
        competitor: "RivalCo",
        read: "evidence_thin",
        observations: [{ what_shipped: "s", evidence_quote: "shipped version 4.0 of its fleet dashboard" }],
        pace_read: "p",
      }],
      velocity_insight: "i",
      insight_basis: "evidence_too_thin",
      body_md: "## Velocity watch",
    });
    expect(parseVelocityWatchArtifact(decorated, EXCERPTS, COMPETITORS)?.reads[0]?.observations).toEqual([]);
  });

  it("rejects observed reads with empty observations, unknown read kinds, missing fields, bad basis, and non-JSON", () => {
    const base = JSON.parse(watchOutput()) as { reads: Array<Record<string, unknown>> } & Record<string, unknown>;
    const withReads = (reads: Array<Record<string, unknown>>) => JSON.stringify({ ...base, reads });
    // shipping_observed with no observations claims shipping nobody quoted.
    expect(parseVelocityWatchArtifact(withReads([{ competitor: "RivalCo", read: "shipping_observed", observations: [], pace_read: "p" }]), EXCERPTS, COMPETITORS)).toBeNull();
    expect(parseVelocityWatchArtifact(withReads([{ competitor: "RivalCo", read: "sideways", observations: [], pace_read: "p" }]), EXCERPTS, COMPETITORS)).toBeNull();
    expect(parseVelocityWatchArtifact(withReads([{ competitor: "RivalCo", read: "evidence_thin", observations: [] }]), EXCERPTS, COMPETITORS)).toBeNull();
    const badBasis = { ...(JSON.parse(watchOutput()) as Record<string, unknown>), insight_basis: "vibes" };
    expect(parseVelocityWatchArtifact(JSON.stringify(badBasis), EXCERPTS, COMPETITORS)).toBeNull();
    const noInsight = JSON.parse(watchOutput()) as Record<string, unknown>;
    delete noInsight.velocity_insight;
    expect(parseVelocityWatchArtifact(JSON.stringify(noInsight), EXCERPTS, COMPETITORS)).toBeNull();
    const noBody = JSON.parse(watchOutput()) as Record<string, unknown>;
    delete noBody.body_md;
    expect(parseVelocityWatchArtifact(JSON.stringify(noBody), EXCERPTS, COMPETITORS)).toBeNull();
    expect(parseVelocityWatchArtifact("not json at all", EXCERPTS, COMPETITORS)).toBeNull();
  });

  it("keeps the first read for a duplicated competitor and strips code fences", () => {
    const base = JSON.parse(watchOutput()) as { reads: Array<Record<string, unknown>> } & Record<string, unknown>;
    const duplicated = JSON.stringify({
      ...base,
      reads: [...base.reads, { competitor: "RivalCo", read: "evidence_thin", observations: [], pace_read: "restated" }],
    });
    const parsed = parseVelocityWatchArtifact(duplicated, EXCERPTS, COMPETITORS);
    expect(parsed?.reads).toHaveLength(1);
    expect(parsed?.reads[0]?.read).toBe("shipping_observed");
    const fenced = "```json\n" + watchOutput() + "\n```";
    expect(parseVelocityWatchArtifact(fenced, EXCERPTS, COMPETITORS)?.reads).toHaveLength(1);
  });

  it("rejects the WHOLE parse when a duplicate read carries an ungrounded observation", () => {
    // The duplicate skip must not bypass grounding: the invented launch on
    // the duplicate row is still narrated in body_md, so accepting the parse
    // would ship it under a label that implies grounding.
    const base = JSON.parse(watchOutput()) as { reads: Array<Record<string, unknown>> } & Record<string, unknown>;
    const duplicateWithInvention = JSON.stringify({
      ...base,
      reads: [...base.reads, {
        competitor: "RivalCo",
        read: "shipping_observed",
        observations: [{
          what_shipped: "Launched an AI copilot.",
          evidence_quote: "quietly launched an AI copilot last quarter",
        }],
        pace_read: "p",
      }],
    });
    expect(parseVelocityWatchArtifact(duplicateWithInvention, EXCERPTS, COMPETITORS)).toBeNull();
    // Malformed duplicate rows are rejected too, not skipped unvalidated.
    const duplicateEmptyObservations = JSON.stringify({
      ...base,
      reads: [...base.reads, { competitor: "RivalCo", read: "shipping_observed", observations: [], pace_read: "p" }],
    });
    expect(parseVelocityWatchArtifact(duplicateEmptyObservations, EXCERPTS, COMPETITORS)).toBeNull();
  });
});
