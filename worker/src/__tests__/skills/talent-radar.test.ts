import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { parseTalentRadarArtifact, runTalentRadar } from "../../jobs/skills/talent-radar.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient, SkillFakeQuery } from "./harness.js";

// The fake client's researched competitor is RivalCo (comp-1).
const COMPETITORS = ["RivalCo"];

const EXCERPTS = [
  "RivalCo's careers page lists 14 open roles this quarter, including senior machine learning engineers and data platform engineers.",
  "Job boards show RivalCo hiring enterprise account executives across three new regions.",
];

function feedFixtures() {
  return makeFakeFeedRunner({
    "talent_radar:": [{
      title: "RivalCo careers page roundup",
      excerpt: EXCERPTS[0],
      sourceType: "social",
      sourceName: "Web Search",
      sourceUrl: "https://jobs.example/rivalco-openings",
    }, {
      title: "RivalCo sales hiring",
      excerpt: EXCERPTS[1],
      sourceType: "social",
      sourceName: "Web Search",
      // No sourceUrl — the skill must fall back to the feed name.
    }],
  });
}

function radarOutput(): string {
  return JSON.stringify({
    reads: [{
      competitor: "RivalCo",
      read: "hiring_observed",
      signals: [{
        function: "ai",
        signal: "They are staffing an ML org, with senior ML and data platform engineers posted this quarter.",
        evidence_quote: "senior machine learning engineers and data platform engineers",
      }, {
        function: "sales",
        signal: "They are building enterprise sales coverage in three new regions.",
        evidence_quote: "hiring enterprise account executives across three new regions",
      }],
      next_move: "The ML-plus-enterprise-sales pattern implies an AI product line sold into new enterprise regions next.",
    }],
    body_md: "## Talent radar\nRivalCo is investing in AI and enterprise sales ahead of any announcement.",
  });
}

/** An honest all-thin output: no signals, no invented hiring pattern. */
function thinOutput(): string {
  return JSON.stringify({
    reads: [{
      competitor: "RivalCo",
      read: "evidence_thin",
      signals: [],
      next_move: "The excerpts show nothing about RivalCo's hiring — too thin to read a pattern.",
    }],
    body_md: "## Talent radar\nNo hiring signal retrieved this run.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addOwnSection("key_resources", [
    { text: "In-house robotics research team", evidence_ids: ["ev-own-kr"] },
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

describe("vault.talent_radar", () => {
  it("reads competitor hiring from feed evidence and writes a verified artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(radarOutput(), JSON.stringify({ status: "confirmed", reason: "excerpt reports the roles" }));
    await makeHandler(client, runner).runSkillModule(runTalentRadar, makeSkillJob("vault.talent_radar"));

    // Every excerpt fed to the model landed on the evidence ledger first.
    expect(client.inserts.filter((entry) => entry.table === "evidence_items")).toHaveLength(2);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "vault.talent_radar",
      title: "Talent radar — 1 of 1 competitors show hiring signals",
    });
    // Ledger ids for the excerpts AND our own resources back the artifact.
    expect(artifact?.values.evidence_ids).toEqual(["evidence-1", "ev-own-kr"]);
    const payload = artifact?.values.payload as {
      reads: Array<Record<string, unknown>>;
      hiring_observed: number;
      evidence_thin: number;
      spot_check: Record<string, unknown>;
    };
    expect(payload.reads).toHaveLength(1);
    expect(payload.reads[0]).toMatchObject({ competitor: "RivalCo", read: "hiring_observed" });
    const signals = payload.reads[0]?.signals as Array<Record<string, unknown>>;
    expect(signals).toHaveLength(2);
    expect(signals[0]).toMatchObject({ function: "ai" });
    expect(signals[1]).toMatchObject({ function: "sales" });
    expect(payload.reads[0]?.next_move).toContain("enterprise");
    expect(payload.hiring_observed).toBe(1);
    expect(payload.evidence_thin).toBe(0);
    // Both grounded signals were spot-checked (<=4).
    expect(payload.spot_check).toEqual({ checked: 2, confirmed: 2 });
    // Own resources are optional context in the prompt; the prompt names the competitors.
    expect(runner.requests[0]?.prompt).toContain("In-house robotics research team");
    expect(runner.requests[0]?.prompt).toContain("RivalCo");
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({ status: "completed", output: { skill_key: "vault.talent_radar", competitors: 1, hiring_observed: 1, spot_check_confirmed: 2 } });
  });

  it("scopes the feed cache key to the analyzed company AND the competitor set, and queries the competitors' hiring", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(radarOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    const seen: Array<{ cacheKey: string; query: string }> = [];
    const inner = feedFixtures() as { refresh(request: { cacheKey?: string; feedKey: string; query?: string }): Promise<unknown> };
    const spyingFeedRunner = {
      async refresh(request: { cacheKey?: string; feedKey: string; query?: string }) {
        seen.push({ cacheKey: request.cacheKey ?? "", query: request.query ?? "" });
        return inner.refresh(request);
      },
    } as never;
    const handler = new SkillRunHandler({ client: client.asSupabase(), runner, feedRunner: spyingFeedRunner });
    await handler.runSkillModule(runTalentRadar, makeSkillJob("vault.talent_radar"));
    // Without the company slug, switching companies within the feed TTL would
    // serve the previous company's cached hiring excerpts; without the
    // competitor slug, adding a competitor within the TTL would replay
    // excerpts that never searched for the new one.
    expect(seen).toEqual([{
      cacheKey: "talent_radar:account-1:acme-robotics:rivalco",
      query: "RivalCo hiring jobs careers roles engineering sales data AI",
    }]);
  });

  it("never lets the previous company's key resources reach the prompt", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER key_resources row from the ctx-0 era.
    client.addTrapRow("key_resources", "Stale old-company text");
    const runner = new ScriptedSkillRunner(radarOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    await makeHandler(client, runner).runSkillModule(runTalentRadar, makeSkillJob("vault.talent_radar"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain("In-house robotics research team");
    expect(mainPrompt).not.toContain("Stale old-company text");
  });

  it("fails honestly when no competitor has been researched — no feed call, no model call, no artifact", async () => {
    const client = new NoCompetitorClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(radarOutput(), "{}");
    // An empty feed fixture would throw its own message — reaching the exact
    // competitor message proves the skill threw BEFORE touching the feed.
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runTalentRadar, makeSkillJob("vault.talent_radar")))
      .rejects.toThrow("talent_radar requires at least one researched competitor first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when the feed returns no hiring evidence", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(radarOutput(), "{}");
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runTalentRadar, makeSkillJob("vault.talent_radar")))
      .rejects.toThrow(/could not retrieve competitor hiring evidence/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact from invented model output", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // The quote appears in no retrieved excerpt — a memory-cited hiring push.
    const runner = new ScriptedSkillRunner(JSON.stringify({
      reads: [{
        competitor: "RivalCo",
        read: "hiring_observed",
        signals: [{
          function: "engineering",
          signal: "s",
          evidence_quote: "RivalCo doubled its engineering org last year",
        }],
        next_move: "n",
      }],
      body_md: "## Talent radar",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runTalentRadar, makeSkillJob("vault.talent_radar")))
      .rejects.toThrow("talent_radar produced unparseable output; refusing to write an artifact");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("writes an honest all-thin artifact with zero spot-checks and no verify call", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(thinOutput(), JSON.stringify({ status: "contradicted", reason: "must never be consulted" }));
    await makeHandler(client, runner).runSkillModule(runTalentRadar, makeSkillJob("vault.talent_radar"));

    // Exactly one model pass: no signals means nothing external to verify,
    // and no verifier call was faked (a verify call would have returned
    // "contradicted" and hard-failed the run).
    expect(runner.requests).toHaveLength(1);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({ title: "Talent radar — 0 of 1 competitors show hiring signals" });
    const payload = artifact?.values.payload as Record<string, unknown>;
    expect(payload.hiring_observed).toBe(0);
    expect(payload.evidence_thin).toBe(1);
    expect(payload.spot_check).toEqual({ checked: 0, confirmed: 0 });
  });

  it("hard-fails on a contradicted spot-check — no artifact written", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(radarOutput(), JSON.stringify({ status: "contradicted", reason: "excerpt reports different roles" }));
    await expect(makeHandler(client, runner).runSkillModule(runTalentRadar, makeSkillJob("vault.talent_radar")))
      .rejects.toThrow(/spot-check contradicted/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("parseTalentRadarArtifact", () => {
  it("parses grounded reads quoted verbatim from the excerpts", () => {
    const parsed = parseTalentRadarArtifact(radarOutput(), EXCERPTS, COMPETITORS);
    expect(parsed?.reads).toHaveLength(1);
    expect(parsed?.reads[0]?.signals.map((signal) => signal.evidence_quote)).toEqual([
      "senior machine learning engineers and data platform engineers",
      "hiring enterprise account executives across three new regions",
    ]);
    expect(parsed?.reads[0]?.signals.map((signal) => signal.function)).toEqual(["ai", "sales"]);
    expect(parsed?.bodyMd).toContain("Talent radar");
  });

  it("rejects the WHOLE parse when any signal's quote is not a substring of an excerpt", () => {
    const mixed = JSON.stringify({
      reads: [{
        competitor: "RivalCo",
        read: "hiring_observed",
        signals: [{
          function: "ai",
          signal: "s",
          evidence_quote: "senior machine learning engineers and data platform engineers",
        }, {
          function: "sales",
          signal: "s",
          evidence_quote: "not in any excerpt",
        }],
        next_move: "n",
      }],
      body_md: "## Talent radar",
    });
    // One invented signal rejects everything — dropping it would still ship
    // its narrative inside body_md.
    expect(parseTalentRadarArtifact(mixed, EXCERPTS, COMPETITORS)).toBeNull();
  });

  it("rejects reads about a competitor we never researched and incomplete competitor coverage", () => {
    expect(parseTalentRadarArtifact(JSON.stringify({
      reads: [{
        competitor: "MadeUpCorp",
        read: "hiring_observed",
        signals: [{ function: "ai", signal: "s", evidence_quote: "senior machine learning engineers and data platform engineers" }],
        next_move: "n",
      }],
      body_md: "## Talent radar",
    }), EXCERPTS, COMPETITORS)).toBeNull();
    // RivalCo missing entirely — a partial radar hides the competitor
    // quietly staffing up against us.
    expect(parseTalentRadarArtifact(radarOutput(), EXCERPTS, ["RivalCo", "OtherCo"])).toBeNull();
  });

  it("normalizes stray signals on an evidence_thin read to empty", () => {
    const decorated = JSON.stringify({
      reads: [{
        competitor: "RivalCo",
        read: "evidence_thin",
        signals: [{ function: "ai", signal: "s", evidence_quote: "senior machine learning engineers and data platform engineers" }],
        next_move: "n",
      }],
      body_md: "## Talent radar",
    });
    expect(parseTalentRadarArtifact(decorated, EXCERPTS, COMPETITORS)?.reads[0]?.signals).toEqual([]);
  });

  it("rejects unknown functions, observed reads with empty signals, unknown read kinds, missing fields, and non-JSON", () => {
    const base = JSON.parse(radarOutput()) as { reads: Array<Record<string, unknown>> } & Record<string, unknown>;
    const withReads = (reads: Array<Record<string, unknown>>) => JSON.stringify({ ...base, reads });
    // A function class we never defined is an invention.
    expect(parseTalentRadarArtifact(withReads([{
      competitor: "RivalCo",
      read: "hiring_observed",
      signals: [{ function: "quantum", signal: "s", evidence_quote: "senior machine learning engineers and data platform engineers" }],
      next_move: "n",
    }]), EXCERPTS, COMPETITORS)).toBeNull();
    // hiring_observed with no signals claims hiring nobody quoted.
    expect(parseTalentRadarArtifact(withReads([{ competitor: "RivalCo", read: "hiring_observed", signals: [], next_move: "n" }]), EXCERPTS, COMPETITORS)).toBeNull();
    expect(parseTalentRadarArtifact(withReads([{ competitor: "RivalCo", read: "sideways", signals: [], next_move: "n" }]), EXCERPTS, COMPETITORS)).toBeNull();
    // Missing next_move — every read must say what the pattern implies.
    expect(parseTalentRadarArtifact(withReads([{ competitor: "RivalCo", read: "evidence_thin", signals: [] }]), EXCERPTS, COMPETITORS)).toBeNull();
    // Missing signal text on a grounded signal.
    expect(parseTalentRadarArtifact(withReads([{
      competitor: "RivalCo",
      read: "hiring_observed",
      signals: [{ function: "ai", evidence_quote: "senior machine learning engineers and data platform engineers" }],
      next_move: "n",
    }]), EXCERPTS, COMPETITORS)).toBeNull();
    const noBody = JSON.parse(radarOutput()) as Record<string, unknown>;
    delete noBody.body_md;
    expect(parseTalentRadarArtifact(JSON.stringify(noBody), EXCERPTS, COMPETITORS)).toBeNull();
    expect(parseTalentRadarArtifact("not json at all", EXCERPTS, COMPETITORS)).toBeNull();
  });

  it("keeps the first read for a duplicated competitor and strips code fences", () => {
    const base = JSON.parse(radarOutput()) as { reads: Array<Record<string, unknown>> } & Record<string, unknown>;
    const duplicated = JSON.stringify({
      ...base,
      reads: [...base.reads, { competitor: "RivalCo", read: "evidence_thin", signals: [], next_move: "restated" }],
    });
    const parsed = parseTalentRadarArtifact(duplicated, EXCERPTS, COMPETITORS);
    expect(parsed?.reads).toHaveLength(1);
    expect(parsed?.reads[0]?.read).toBe("hiring_observed");
    const fenced = "```json\n" + radarOutput() + "\n```";
    expect(parseTalentRadarArtifact(fenced, EXCERPTS, COMPETITORS)?.reads).toHaveLength(1);
  });
});
