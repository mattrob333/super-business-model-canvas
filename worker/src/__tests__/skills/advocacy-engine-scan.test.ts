import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { parseAdvocacyEngineScanArtifact, runAdvocacyEngineScan } from "../../jobs/skills/advocacy-engine-scan.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient, SkillFakeQuery } from "./harness.js";

// The fake client's researched competitor is RivalCo (comp-1).
const COMPETITORS = ["RivalCo"];

const COMPETITOR_ITEM = "Champions program with tiered rewards for power users";

const EXCERPTS = [
  "RivalCo runs a double-sided referral program giving both the referrer and the new customer a free month.",
  "RivalCo's annual RoboChampions summit turns its power users into public advocates and case-study subjects.",
];

function feedFixtures() {
  return makeFakeFeedRunner({
    "advocacy_engine_scan:": [{
      title: "RivalCo referral program coverage",
      excerpt: EXCERPTS[0],
      sourceType: "social",
      sourceName: "Web Search",
      sourceUrl: "https://news.example/rivalco-referral",
    }, {
      title: "RivalCo champions summit recap",
      excerpt: EXCERPTS[1],
      sourceType: "social",
      sourceName: "Web Search",
      // No sourceUrl — the skill must fall back to the feed name.
    }],
  });
}

function scanOutput(): string {
  return JSON.stringify({
    mechanisms: [{
      competitor: "RivalCo",
      mechanism: "Double-sided referral program that pays both parties",
      source: "live_search",
      evidence_quote: "double-sided referral program",
      equivalent_move: "Launch a give-a-month/get-a-month referral link for our existing accounts — no program tooling needed.",
    }, {
      competitor: "RivalCo",
      mechanism: "Tiered champions program that formalizes power-user advocacy",
      source: "competitor_canvas",
      evidence_quote: COMPETITOR_ITEM,
      equivalent_move: "Start a lightweight champions channel with early-access perks for our ten most active users.",
    }],
    body_md: "## Advocacy engine scan\nRivalCo manufactures advocates through referrals and a champions tier.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addCompetitorSection("customer_relationships", "RivalCo", [
    { text: COMPETITOR_ITEM, evidence_ids: ["ev-comp-cr"] },
  ]);
}

/** The cross-company trap on the COMPETITOR side: a NEWER ctx-0 row. */
function addCompetitorTrapRow(client: SkillFakeClient): void {
  client.competitorRows.push({
    section_key: "customer_relationships",
    business_context_version_id: "ctx-0",
    competitor_id: "comp-0",
    companies: { name: "RivalCo" },
    items: [{ text: "Stale old-company advocacy text", evidence_ids: [] }],
    created_at: "2026-07-05",
  });
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

describe("anchor.advocacy_engine_scan", () => {
  it("scans competitor advocacy engines from both sources and writes a verified artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(scanOutput(), JSON.stringify({ status: "confirmed", reason: "excerpt describes the referral program" }));
    await makeHandler(client, runner).runSkillModule(runAdvocacyEngineScan, makeSkillJob("anchor.advocacy_engine_scan"));

    // Every excerpt fed to the model landed on the evidence ledger first.
    expect(client.inserts.filter((entry) => entry.table === "evidence_items")).toHaveLength(2);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "anchor.advocacy_engine_scan",
      title: "Advocacy engine scan — 2 competitor mechanisms (1 live-evidenced, 1 canvas-grounded)",
      // Both ground truths the model saw: the ledgered excerpts AND the
      // competitor canvas item's evidence.
      evidence_ids: ["evidence-1", "ev-comp-cr"],
    });
    const payload = artifact?.values.payload as {
      mechanisms: Array<Record<string, unknown>>;
      live_evidenced: number;
      canvas_grounded: number;
      spot_check: Record<string, unknown>;
    };
    expect(payload.mechanisms).toHaveLength(2);
    expect(payload.mechanisms[0]).toMatchObject({
      competitor: "RivalCo",
      source: "live_search",
      evidence_quote: "double-sided referral program",
    });
    expect(payload.mechanisms[1]).toMatchObject({
      competitor: "RivalCo",
      source: "competitor_canvas",
      evidence_quote: COMPETITOR_ITEM,
    });
    expect(payload.live_evidenced).toBe(1);
    expect(payload.canvas_grounded).toBe(1);
    // Only the live-evidenced mechanism has an external excerpt to check.
    expect(payload.spot_check).toEqual({ checked: 1, confirmed: 1 });
    // The prompt carries both sources and names the competitor.
    expect(runner.requests[0]?.prompt).toContain(COMPETITOR_ITEM);
    expect(runner.requests[0]?.prompt).toContain("RivalCo");
    expect(runner.requests[0]?.prompt).toContain(EXCERPTS[0]);
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({
        status: "completed",
        output: {
          skill_key: "anchor.advocacy_engine_scan",
          mechanisms: 2,
          live_evidenced: 1,
          canvas_grounded: 1,
          spot_check_confirmed: 1,
        },
      });
  });

  it("scopes the feed cache key to the analyzed company and queries the competitors' advocacy footprint", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(scanOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    const seen: Array<{ cacheKey: string; query: string }> = [];
    const inner = feedFixtures() as { refresh(request: { cacheKey?: string; feedKey: string; query?: string }): Promise<unknown> };
    const spyingFeedRunner = {
      async refresh(request: { cacheKey?: string; feedKey: string; query?: string }) {
        seen.push({ cacheKey: request.cacheKey ?? "", query: request.query ?? "" });
        return inner.refresh(request);
      },
    } as never;
    const handler = new SkillRunHandler({ client: client.asSupabase(), runner, feedRunner: spyingFeedRunner });
    await handler.runSkillModule(runAdvocacyEngineScan, makeSkillJob("anchor.advocacy_engine_scan"));
    // Without the company slug, switching companies within the feed TTL would
    // serve the previous company's cached advocacy excerpts.
    expect(seen).toEqual([{
      cacheKey: "advocacy_engine_scan:account-1:acme-robotics",
      query: "RivalCo referral program community advocates champions customer stories",
    }]);
  });

  it("never lets the previous company's competitor items reach the prompt", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER competitor customer_relationships row from
    // the ctx-0 era — an unscoped query would pick it as latest.
    addCompetitorTrapRow(client);
    const runner = new ScriptedSkillRunner(scanOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    await makeHandler(client, runner).runSkillModule(runAdvocacyEngineScan, makeSkillJob("anchor.advocacy_engine_scan"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain(COMPETITOR_ITEM);
    expect(mainPrompt).not.toContain("Stale old-company advocacy text");
  });

  it("fails honestly when no company has been analyzed — no feed call, no model call, no artifact", async () => {
    const client = new SkillFakeClient();
    // No contexts at all: scope.companyName resolves to null.
    client.contexts = [];
    const runner = new ScriptedSkillRunner(scanOutput(), "{}");
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runAdvocacyEngineScan, makeSkillJob("anchor.advocacy_engine_scan")))
      .rejects.toThrow("advocacy_engine_scan requires an analyzed company first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when no competitor has been researched — no feed call, no model call, no artifact", async () => {
    const client = new NoCompetitorClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(scanOutput(), "{}");
    // An empty feed fixture would throw its own message — reaching the exact
    // competitor message proves the skill threw BEFORE touching the feed.
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runAdvocacyEngineScan, makeSkillJob("anchor.advocacy_engine_scan")))
      .rejects.toThrow("advocacy_engine_scan requires at least one researched competitor first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when the feed returns no advocacy evidence", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(scanOutput(), "{}");
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runAdvocacyEngineScan, makeSkillJob("anchor.advocacy_engine_scan")))
      .rejects.toThrow(/could not retrieve advocacy evidence/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact from invented model output", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // The quote appears in no excerpt and matches no competitor canvas item —
    // a memory-cited program.
    const runner = new ScriptedSkillRunner(JSON.stringify({
      mechanisms: [{
        competitor: "RivalCo",
        mechanism: "Secret ambassador program",
        source: "live_search",
        evidence_quote: "RivalCo pays ambassadors five thousand dollars per referral",
        equivalent_move: "m",
      }],
      body_md: "## Advocacy engine scan",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runAdvocacyEngineScan, makeSkillJob("anchor.advocacy_engine_scan")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("skips the verifier honestly when every mechanism is canvas-grounded — zero checks, no fake pass", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(JSON.stringify({
      mechanisms: [{
        competitor: "RivalCo",
        mechanism: "Tiered champions program that formalizes power-user advocacy",
        source: "competitor_canvas",
        evidence_quote: COMPETITOR_ITEM,
        equivalent_move: "Start a lightweight champions channel with early-access perks.",
      }],
      body_md: "## Advocacy engine scan",
    }), JSON.stringify({ status: "confirmed", reason: "should never be asked" }));
    await makeHandler(client, runner).runSkillModule(runAdvocacyEngineScan, makeSkillJob("anchor.advocacy_engine_scan"));

    // One model pass only — no verify call happened for canvas-only grounding.
    expect(runner.requests).toHaveLength(1);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    const payload = artifact?.values.payload as { spot_check: Record<string, unknown> };
    expect(payload.spot_check).toEqual({ checked: 0, confirmed: 0 });
  });

  it("hard-fails on a contradicted spot-check — no artifact written", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(scanOutput(), JSON.stringify({ status: "contradicted", reason: "excerpt describes a different program" }));
    await expect(makeHandler(client, runner).runSkillModule(runAdvocacyEngineScan, makeSkillJob("anchor.advocacy_engine_scan")))
      .rejects.toThrow(/spot-check contradicted/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("parseAdvocacyEngineScanArtifact", () => {
  const QUOTES = [{ competitor: "RivalCo", text: COMPETITOR_ITEM }];

  it("parses mechanisms grounded in either labeled source", () => {
    const parsed = parseAdvocacyEngineScanArtifact(scanOutput(), EXCERPTS, QUOTES, COMPETITORS);
    expect(parsed?.mechanisms.map((mechanism) => mechanism.source)).toEqual(["live_search", "competitor_canvas"]);
    expect(parsed?.bodyMd).toContain("Advocacy engine scan");
  });

  it("rejects the WHOLE parse when any live_search quote is not a substring of an excerpt", () => {
    const mixed = JSON.stringify({
      mechanisms: [{
        competitor: "RivalCo",
        mechanism: "m",
        source: "live_search",
        evidence_quote: "double-sided referral program",
        equivalent_move: "e",
      }, {
        competitor: "RivalCo",
        mechanism: "m2",
        source: "live_search",
        evidence_quote: "not in any excerpt",
        equivalent_move: "e2",
      }],
      body_md: "## Advocacy engine scan",
    });
    // One invented mechanism rejects everything — dropping it would still
    // ship its narrative inside body_md.
    expect(parseAdvocacyEngineScanArtifact(mixed, EXCERPTS, QUOTES, COMPETITORS)).toBeNull();
  });

  it("rejects a competitor_canvas quote that paraphrases instead of repeating the item exactly", () => {
    expect(parseAdvocacyEngineScanArtifact(JSON.stringify({
      mechanisms: [{
        competitor: "RivalCo",
        mechanism: "m",
        source: "competitor_canvas",
        evidence_quote: "A champions program with tiered rewards",
        equivalent_move: "e",
      }],
      body_md: "## Advocacy engine scan",
    }), EXCERPTS, QUOTES, COMPETITORS)).toBeNull();
  });

  it("rejects a canvas quote attributed to the wrong competitor", () => {
    // OtherCo is researched, but the quoted item belongs to RivalCo's canvas.
    expect(parseAdvocacyEngineScanArtifact(JSON.stringify({
      mechanisms: [{
        competitor: "OtherCo",
        mechanism: "m",
        source: "competitor_canvas",
        evidence_quote: COMPETITOR_ITEM,
        equivalent_move: "e",
      }],
      body_md: "## Advocacy engine scan",
    }), EXCERPTS, QUOTES, ["RivalCo", "OtherCo"])).toBeNull();
  });

  it("rejects mechanisms attributed to a competitor we never researched", () => {
    expect(parseAdvocacyEngineScanArtifact(JSON.stringify({
      mechanisms: [{
        competitor: "MadeUpCorp",
        mechanism: "m",
        source: "live_search",
        evidence_quote: "double-sided referral program",
        equivalent_move: "e",
      }],
      body_md: "## Advocacy engine scan",
    }), EXCERPTS, QUOTES, COMPETITORS)).toBeNull();
  });

  it("rejects unknown source labels, missing fields, empty mechanism lists, missing body, and non-JSON", () => {
    // Unlabeled/unknown source.
    expect(parseAdvocacyEngineScanArtifact(JSON.stringify({
      mechanisms: [{
        competitor: "RivalCo",
        mechanism: "m",
        source: "hearsay",
        evidence_quote: "double-sided referral program",
        equivalent_move: "e",
      }],
      body_md: "## Advocacy engine scan",
    }), EXCERPTS, QUOTES, COMPETITORS)).toBeNull();
    // equivalent_move missing — a mechanism without our sized move is not a playbook row.
    expect(parseAdvocacyEngineScanArtifact(JSON.stringify({
      mechanisms: [{
        competitor: "RivalCo",
        mechanism: "m",
        source: "live_search",
        evidence_quote: "double-sided referral program",
      }],
      body_md: "## Advocacy engine scan",
    }), EXCERPTS, QUOTES, COMPETITORS)).toBeNull();
    expect(parseAdvocacyEngineScanArtifact(JSON.stringify({ mechanisms: [], body_md: "## Advocacy engine scan" }), EXCERPTS, QUOTES, COMPETITORS)).toBeNull();
    const noBody = JSON.parse(scanOutput()) as Record<string, unknown>;
    delete noBody.body_md;
    expect(parseAdvocacyEngineScanArtifact(JSON.stringify(noBody), EXCERPTS, QUOTES, COMPETITORS)).toBeNull();
    expect(parseAdvocacyEngineScanArtifact("not json at all", EXCERPTS, QUOTES, COMPETITORS)).toBeNull();
  });

  it("strips code fences around otherwise valid JSON", () => {
    const fenced = "```json\n" + scanOutput() + "\n```";
    expect(parseAdvocacyEngineScanArtifact(fenced, EXCERPTS, QUOTES, COMPETITORS)?.mechanisms).toHaveLength(2);
  });
});
