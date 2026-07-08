import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { parseEcosystemWatchArtifact, runEcosystemWatch } from "../../jobs/skills/ecosystem-watch.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient, SkillFakeQuery } from "./harness.js";

// The fake client's researched competitor is RivalCo (comp-1).
const COMPETITORS = ["RivalCo"];

const EXCERPTS = [
  "RivalCo announced a strategic integration with PayFlow to embed payment processing across its fleet management suite.",
  "RivalCo and LogistiCorp formed a distribution alliance bundling warehouse robots with last-mile delivery networks.",
];

function feedFixtures() {
  return makeFakeFeedRunner({
    "ecosystem_watch:": [{
      title: "RivalCo payments integration announcement",
      excerpt: EXCERPTS[0],
      sourceType: "social",
      sourceName: "Web Search",
      sourceUrl: "https://news.example/rivalco-payflow",
    }, {
      title: "RivalCo distribution alliance",
      excerpt: EXCERPTS[1],
      sourceType: "social",
      sourceName: "Web Search",
      // No sourceUrl — the skill must fall back to the feed name.
    }],
  });
}

function watchOutput(): string {
  return JSON.stringify({
    moves: [{
      competitor: "RivalCo",
      partner: "PayFlow",
      move_summary: "RivalCo is embedding payments into its fleet suite, locking in transaction revenue.",
      evidence_quote: "strategic integration with PayFlow",
      counter_partner: "An alternative payments provider for our own suite",
      counter_rationale: "The excerpt says the move embeds payment processing — we should secure the same layer before it consolidates.",
    }, {
      competitor: "RivalCo",
      partner: "LogistiCorp",
      move_summary: "RivalCo now bundles robots with last-mile delivery, extending downstream reach.",
      evidence_quote: "distribution alliance bundling warehouse robots",
      counter_partner: "A rival last-mile delivery network",
      counter_rationale: "The excerpt reports a bundling alliance — partnering with a competing delivery network keeps that channel contested.",
    }],
    body_md: "## Ecosystem watch\nRivalCo is moving on payments and distribution.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addOwnSection("key_partners", [
    { text: "Contract manufacturer in Taiwan", evidence_ids: ["ev-own-kp"] },
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

describe("envoy.ecosystem_watch", () => {
  it("observes competitor moves from feed evidence and writes a verified artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(watchOutput(), JSON.stringify({ status: "confirmed", reason: "excerpt reports the move" }));
    await makeHandler(client, runner).runSkillModule(runEcosystemWatch, makeSkillJob("envoy.ecosystem_watch"));

    // Every excerpt fed to the model landed on the evidence ledger first.
    expect(client.inserts.filter((entry) => entry.table === "evidence_items")).toHaveLength(2);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "envoy.ecosystem_watch",
      title: "Ecosystem watch — 2 competitor partnership moves",
      evidence_ids: ["evidence-1"],
    });
    const payload = artifact?.values.payload as {
      moves: Array<Record<string, unknown>>;
      spot_check: Record<string, unknown>;
    };
    expect(payload.moves).toHaveLength(2);
    expect(payload.moves[0]).toMatchObject({
      competitor: "RivalCo",
      partner: "PayFlow",
      evidence_quote: "strategic integration with PayFlow",
    });
    expect(payload.moves[1]).toMatchObject({ competitor: "RivalCo", partner: "LogistiCorp" });
    expect(payload.spot_check).toEqual({ checked: 2, confirmed: 2 });
    // Own partner items are optional context in the prompt; the query names the competitors.
    expect(runner.requests[0]?.prompt).toContain("Contract manufacturer in Taiwan");
    expect(runner.requests[0]?.prompt).toContain("RivalCo");
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({ status: "completed", output: { skill_key: "envoy.ecosystem_watch", moves: 2, spot_check_confirmed: 2 } });
  });

  it("scopes the feed cache key to the analyzed company and queries the competitors' partnership news", async () => {
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
    await handler.runSkillModule(runEcosystemWatch, makeSkillJob("envoy.ecosystem_watch"));
    // Without the company slug, switching companies within the feed TTL would
    // serve the previous company's cached partnership excerpts.
    expect(seen).toEqual([{
      cacheKey: "ecosystem_watch:account-1:acme-robotics",
      query: "RivalCo partnership announcement integration alliance",
    }]);
  });

  it("never lets the previous company's key partners reach the prompt", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER key_partners row from the ctx-0 era.
    client.addTrapRow("key_partners", "Stale old-company text");
    const runner = new ScriptedSkillRunner(watchOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    await makeHandler(client, runner).runSkillModule(runEcosystemWatch, makeSkillJob("envoy.ecosystem_watch"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain("Contract manufacturer in Taiwan");
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
    await expect(handler.runSkillModule(runEcosystemWatch, makeSkillJob("envoy.ecosystem_watch")))
      .rejects.toThrow("ecosystem_watch requires at least one researched competitor first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when the feed returns no partnership evidence", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(watchOutput(), "{}");
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runEcosystemWatch, makeSkillJob("envoy.ecosystem_watch")))
      .rejects.toThrow(/could not retrieve competitor partnership evidence/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact from invented model output", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // The quote appears in no retrieved excerpt — a memory-cited move.
    const runner = new ScriptedSkillRunner(JSON.stringify({
      moves: [{
        competitor: "RivalCo",
        partner: "GhostPay",
        move_summary: "s",
        evidence_quote: "RivalCo quietly acquired GhostPay last quarter",
        counter_partner: "c",
        counter_rationale: "r",
      }],
      body_md: "## Ecosystem watch",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runEcosystemWatch, makeSkillJob("envoy.ecosystem_watch")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("hard-fails on a contradicted spot-check — no artifact written", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(watchOutput(), JSON.stringify({ status: "contradicted", reason: "excerpt names a different partner" }));
    await expect(makeHandler(client, runner).runSkillModule(runEcosystemWatch, makeSkillJob("envoy.ecosystem_watch")))
      .rejects.toThrow(/spot-check contradicted/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("parseEcosystemWatchArtifact", () => {
  it("parses grounded moves quoted verbatim from the excerpts", () => {
    const parsed = parseEcosystemWatchArtifact(watchOutput(), EXCERPTS, COMPETITORS);
    expect(parsed?.moves.map((move) => move.partner)).toEqual(["PayFlow", "LogistiCorp"]);
    expect(parsed?.bodyMd).toContain("Ecosystem watch");
  });

  it("rejects the WHOLE parse when any move's quote is not a substring of an excerpt", () => {
    const mixed = JSON.stringify({
      moves: [{
        competitor: "RivalCo",
        partner: "PayFlow",
        move_summary: "s",
        evidence_quote: "strategic integration with PayFlow",
        counter_partner: "c",
        counter_rationale: "r",
      }, {
        competitor: "RivalCo",
        partner: "GhostPay",
        move_summary: "s",
        evidence_quote: "not in any excerpt",
        counter_partner: "c",
        counter_rationale: "r",
      }],
      body_md: "## Ecosystem watch",
    });
    // One invented move rejects everything — dropping it would still ship
    // its narrative inside body_md.
    expect(parseEcosystemWatchArtifact(mixed, EXCERPTS, COMPETITORS)).toBeNull();
  });

  it("rejects moves attributed to a competitor we never researched", () => {
    expect(parseEcosystemWatchArtifact(JSON.stringify({
      moves: [{
        competitor: "MadeUpCorp",
        partner: "PayFlow",
        move_summary: "s",
        evidence_quote: "strategic integration with PayFlow",
        counter_partner: "c",
        counter_rationale: "r",
      }],
      body_md: "## Ecosystem watch",
    }), EXCERPTS, COMPETITORS)).toBeNull();
  });

  it("rejects missing fields, empty move lists, missing body, and non-JSON", () => {
    // counter_partner missing.
    expect(parseEcosystemWatchArtifact(JSON.stringify({
      moves: [{
        competitor: "RivalCo",
        partner: "PayFlow",
        move_summary: "s",
        evidence_quote: "strategic integration with PayFlow",
        counter_rationale: "r",
      }],
      body_md: "## Ecosystem watch",
    }), EXCERPTS, COMPETITORS)).toBeNull();
    expect(parseEcosystemWatchArtifact(JSON.stringify({ moves: [], body_md: "## Ecosystem watch" }), EXCERPTS, COMPETITORS)).toBeNull();
    const noBody = JSON.parse(watchOutput()) as Record<string, unknown>;
    delete noBody.body_md;
    expect(parseEcosystemWatchArtifact(JSON.stringify(noBody), EXCERPTS, COMPETITORS)).toBeNull();
    expect(parseEcosystemWatchArtifact("not json at all", EXCERPTS, COMPETITORS)).toBeNull();
  });

  it("strips code fences around otherwise valid JSON", () => {
    const fenced = "```json\n" + watchOutput() + "\n```";
    expect(parseEcosystemWatchArtifact(fenced, EXCERPTS, COMPETITORS)?.moves).toHaveLength(2);
  });
});
