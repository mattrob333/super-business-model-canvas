import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { parseOperationalBenchmarkArtifact, runOperationalBenchmark } from "../../jobs/skills/operational-benchmark.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient, SkillFakeQuery } from "./harness.js";

// The fake client's researched competitor is RivalCo (comp-1).
const COMPETITORS = ["RivalCo"];

const ACTIVITIES = [
  "Develop fleet management software",
  "Ship new robot capabilities quarterly",
  "White-glove customer onboarding",
];

const EXCERPTS = [
  "RivalCo is hiring 40 firmware and fleet software engineers across three new robotics teams this quarter.",
  "RivalCo shipped three fleet analytics dashboard releases in six weeks, a marked acceleration in launch velocity.",
];

function feedFixtures() {
  return makeFakeFeedRunner({
    "operational_benchmark:": [{
      title: "RivalCo engineering hiring spree",
      excerpt: EXCERPTS[0],
      sourceType: "social",
      sourceName: "Grok Live Search",
      sourceUrl: "https://news.example/rivalco-hiring",
    }, {
      title: "RivalCo ship velocity",
      excerpt: EXCERPTS[1],
      sourceType: "social",
      sourceName: "Grok Live Search",
      // No sourceUrl — the skill must fall back to the feed name.
    }],
  });
}

function benchmarkOutput(): string {
  return JSON.stringify({
    rows: [{
      activity: ACTIVITIES[0],
      signal: "visible_investment",
      competitor: "RivalCo",
      signal_type: "hiring",
      evidence_quote: "hiring 40 firmware and fleet software engineers",
      gap_read: "RivalCo is staffing fleet software far faster than our canvas suggests we are.",
    }, {
      activity: ACTIVITIES[1],
      signal: "visible_investment",
      competitor: "RivalCo",
      signal_type: "shipping",
      evidence_quote: "shipped three fleet analytics dashboard releases in six weeks",
      gap_read: "Their release cadence outpaces our quarterly capability ships.",
    }, {
      activity: ACTIVITIES[2],
      signal: "no_public_signal",
      competitor: null,
      signal_type: null,
      evidence_quote: null,
      gap_read: "No hiring or launch signal around onboarding — our white-glove motion may still be a differentiator.",
    }],
    body_md: "## Operational benchmark\nRivalCo is out-hiring and out-shipping us on fleet software.",
  });
}

function allQuietOutput(): string {
  return JSON.stringify({
    rows: ACTIVITIES.map((activity) => ({
      activity,
      signal: "no_public_signal",
      competitor: null,
      signal_type: null,
      evidence_quote: null,
      gap_read: `The excerpts show no hiring or launch signal for ${activity.toLowerCase()}.`,
    })),
    body_md: "## Operational benchmark\nNo visible competitor investment in any of our activity areas.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addOwnSection("key_activities", [
    { text: ACTIVITIES[0], evidence_ids: ["ev-own-ka"] },
    { text: ACTIVITIES[1], evidence_ids: [] },
    { text: ACTIVITIES[2], evidence_ids: [] },
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

describe("tempo.operational_benchmark", () => {
  it("benchmarks every activity from feed evidence and writes a verified artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(benchmarkOutput(), JSON.stringify({ status: "confirmed", reason: "excerpt shows the investment" }));
    await makeHandler(client, runner).runSkillModule(runOperationalBenchmark, makeSkillJob("tempo.operational_benchmark"));

    // Every excerpt fed to the model landed on the evidence ledger first.
    expect(client.inserts.filter((entry) => entry.table === "evidence_items")).toHaveLength(2);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "tempo.operational_benchmark",
      title: "Operational benchmark — 2 of 3 activities show visible competitor investment",
      // Ledger ids for the excerpts AND our own activity items back the artifact.
      evidence_ids: ["evidence-1", "ev-own-ka"],
    });
    const payload = artifact?.values.payload as {
      rows: Array<Record<string, unknown>>;
      visible_investments: number;
      no_public_signal: number;
      spot_check: Record<string, unknown>;
    };
    expect(payload.rows).toHaveLength(3);
    expect(payload.rows[0]).toMatchObject({
      activity: ACTIVITIES[0],
      signal: "visible_investment",
      competitor: "RivalCo",
      signal_type: "hiring",
      evidence_quote: "hiring 40 firmware and fleet software engineers",
    });
    expect(payload.rows[1]).toMatchObject({ activity: ACTIVITIES[1], signal_type: "shipping" });
    // The unknown stays honestly unknown — no competitor, no quote.
    expect(payload.rows[2]).toMatchObject({
      activity: ACTIVITIES[2],
      signal: "no_public_signal",
      competitor: null,
      signal_type: null,
      evidence_quote: null,
    });
    expect(payload.visible_investments).toBe(2);
    expect(payload.no_public_signal).toBe(1);
    expect(payload.spot_check).toEqual({ checked: 2, confirmed: 2 });
    // Our own activities anchor the prompt; the competitors are named.
    expect(runner.requests[0]?.prompt).toContain(ACTIVITIES[0]);
    expect(runner.requests[0]?.prompt).toContain("RivalCo");
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({
        status: "completed",
        output: { skill_key: "tempo.operational_benchmark", activities: 3, visible_investments: 2, spot_check_confirmed: 2 },
      });
  });

  it("scopes the feed cache key to the analyzed company and queries the competitors' hiring and launch signals", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(benchmarkOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    const seen: Array<{ cacheKey: string; query: string }> = [];
    const inner = feedFixtures() as { refresh(request: { cacheKey?: string; feedKey: string; query?: string }): Promise<unknown> };
    const spyingFeedRunner = {
      async refresh(request: { cacheKey?: string; feedKey: string; query?: string }) {
        seen.push({ cacheKey: request.cacheKey ?? "", query: request.query ?? "" });
        return inner.refresh(request);
      },
    } as never;
    const handler = new SkillRunHandler({ client: client.asSupabase(), runner, feedRunner: spyingFeedRunner });
    await handler.runSkillModule(runOperationalBenchmark, makeSkillJob("tempo.operational_benchmark"));
    // Without the company slug, switching companies within the feed TTL would
    // serve the previous company's cached hiring/launch excerpts.
    expect(seen).toEqual([{
      cacheKey: "operational_benchmark:account-1:acme-robotics",
      query: "RivalCo hiring careers engineering product launches shipped features",
    }]);
  });

  it("never lets the previous company's key activities reach the prompt", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER key_activities row from the ctx-0 era.
    client.addTrapRow("key_activities", "Stale old-company text");
    const runner = new ScriptedSkillRunner(benchmarkOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    await makeHandler(client, runner).runSkillModule(runOperationalBenchmark, makeSkillJob("tempo.operational_benchmark"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain(ACTIVITIES[0]);
    expect(mainPrompt).not.toContain("Stale old-company text");
  });

  it("fails honestly when our Key Activities canvas is empty — no feed call, no model call, no artifact", async () => {
    const client = new SkillFakeClient();
    // No key_activities seeded at all.
    const runner = new ScriptedSkillRunner(benchmarkOutput(), "{}");
    // An empty feed fixture would throw its own message — reaching the exact
    // canvas message proves the skill threw BEFORE touching the feed.
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runOperationalBenchmark, makeSkillJob("tempo.operational_benchmark")))
      .rejects.toThrow("operational_benchmark requires our Key Activities canvas items first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when no competitor has been researched — no feed call, no model call, no artifact", async () => {
    const client = new NoCompetitorClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(benchmarkOutput(), "{}");
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runOperationalBenchmark, makeSkillJob("tempo.operational_benchmark")))
      .rejects.toThrow("operational_benchmark requires at least one researched competitor first");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when the feed returns no hiring or launch evidence", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(benchmarkOutput(), "{}");
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runOperationalBenchmark, makeSkillJob("tempo.operational_benchmark")))
      .rejects.toThrow(/could not retrieve competitor hiring and launch evidence/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact from invented model output", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // The quote appears in no retrieved excerpt — a memory-cited investment.
    const output = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    output.rows[0] = { ...output.rows[0], evidence_quote: "RivalCo doubled its robotics headcount last year" };
    const runner = new ScriptedSkillRunner(JSON.stringify(output), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runOperationalBenchmark, makeSkillJob("tempo.operational_benchmark")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("hard-fails on a contradicted spot-check — no artifact written", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(benchmarkOutput(), JSON.stringify({ status: "contradicted", reason: "excerpt describes a different activity area" }));
    await expect(makeHandler(client, runner).runSkillModule(runOperationalBenchmark, makeSkillJob("tempo.operational_benchmark")))
      .rejects.toThrow(/spot-check contradicted/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("skips the verifier honestly when every row is no-public-signal — zero checks, never a faked pass", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(allQuietOutput(), JSON.stringify({ status: "confirmed", reason: "should never be called" }));
    await makeHandler(client, runner).runSkillModule(runOperationalBenchmark, makeSkillJob("tempo.operational_benchmark"));

    // Only the main pass ran — an absence has no excerpt to verify against.
    expect(runner.requests).toHaveLength(1);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      title: "Operational benchmark — 0 of 3 activities show visible competitor investment",
    });
    const payload = artifact?.values.payload as { spot_check: Record<string, unknown>; no_public_signal: number };
    expect(payload.spot_check).toEqual({ checked: 0, confirmed: 0 });
    expect(payload.no_public_signal).toBe(3);
  });
});

describe("parseOperationalBenchmarkArtifact", () => {
  it("parses a grounded benchmark covering every activity, in our canvas order", () => {
    const parsed = parseOperationalBenchmarkArtifact(benchmarkOutput(), EXCERPTS, ACTIVITIES, COMPETITORS);
    expect(parsed?.rows.map((row) => row.activity)).toEqual(ACTIVITIES);
    expect(parsed?.rows[0]?.signal).toBe("visible_investment");
    expect(parsed?.rows[2]?.signal).toBe("no_public_signal");
    expect(parsed?.bodyMd).toContain("Operational benchmark");
  });

  it("rejects the WHOLE parse when any visible row's quote is not a substring of an excerpt", () => {
    const output = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    output.rows[1] = { ...output.rows[1], evidence_quote: "not in any excerpt" };
    // One invented investment claim rejects everything — dropping it would
    // still ship its narrative inside body_md.
    expect(parseOperationalBenchmarkArtifact(JSON.stringify(output), EXCERPTS, ACTIVITIES, COMPETITORS)).toBeNull();
  });

  it("rejects visible rows attributed to a competitor we never researched", () => {
    const output = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    output.rows[0] = { ...output.rows[0], competitor: "MadeUpCorp" };
    expect(parseOperationalBenchmarkArtifact(JSON.stringify(output), EXCERPTS, ACTIVITIES, COMPETITORS)).toBeNull();
  });

  it("rejects rows whose activity is not one of OUR canvas items verbatim", () => {
    const output = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    output.rows[0] = { ...output.rows[0], activity: "An activity we never wrote down" };
    expect(parseOperationalBenchmarkArtifact(JSON.stringify(output), EXCERPTS, ACTIVITIES, COMPETITORS)).toBeNull();
  });

  it("rejects unknown signals and signal types", () => {
    const badSignal = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    badSignal.rows[2] = { ...badSignal.rows[2], signal: "probably_investing" };
    expect(parseOperationalBenchmarkArtifact(JSON.stringify(badSignal), EXCERPTS, ACTIVITIES, COMPETITORS)).toBeNull();
    const badType = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    badType.rows[0] = { ...badType.rows[0], signal_type: "vibes" };
    expect(parseOperationalBenchmarkArtifact(JSON.stringify(badType), EXCERPTS, ACTIVITIES, COMPETITORS)).toBeNull();
  });

  it("nulls when the benchmark misses one of our activities — a partial benchmark hides gaps", () => {
    const output = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    output.rows = output.rows.slice(0, 2);
    expect(parseOperationalBenchmarkArtifact(JSON.stringify(output), EXCERPTS, ACTIVITIES, COMPETITORS)).toBeNull();
  });

  it("normalizes stray decoration on no-public-signal rows to null and keeps the first of duplicate activities", () => {
    const output = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    // A no-signal row must not carry half-grounded decoration.
    output.rows[2] = { ...output.rows[2], competitor: "RivalCo", evidence_quote: "hiring 40 firmware and fleet software engineers" };
    // Duplicate restatement of an already-benchmarked activity.
    output.rows.push({ ...output.rows[0], gap_read: "restated" });
    const parsed = parseOperationalBenchmarkArtifact(JSON.stringify(output), EXCERPTS, ACTIVITIES, COMPETITORS);
    expect(parsed?.rows).toHaveLength(3);
    expect(parsed?.rows[2]).toMatchObject({ signal: "no_public_signal", competitor: null, signal_type: null, evidence_quote: null });
    expect(parsed?.rows[0]?.gap_read).not.toBe("restated");
  });

  it("rejects the WHOLE parse when a duplicate row carries an invented quote — dedupe never bypasses grounding", () => {
    const output = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    // A second row for an already-benchmarked activity, with a quote that
    // appears in no excerpt: skipping it would still ship its narrative in
    // body_md, so the parse must null.
    output.rows.push({ ...output.rows[0], evidence_quote: "totally invented launch claim" });
    expect(parseOperationalBenchmarkArtifact(JSON.stringify(output), EXCERPTS, ACTIVITIES, COMPETITORS)).toBeNull();
  });

  it("rejects the WHOLE parse when a duplicate row names a competitor we never researched", () => {
    const output = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    output.rows.push({ ...output.rows[0], competitor: "MadeUpCorp" });
    expect(parseOperationalBenchmarkArtifact(JSON.stringify(output), EXCERPTS, ACTIVITIES, COMPETITORS)).toBeNull();
  });

  it("rejects the WHOLE parse when a duplicate visible row follows a no-signal row for the same activity ungrounded", () => {
    const output = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    // The finding's exact shape: activity 2 is honestly no_public_signal,
    // then a fabricated visible_investment duplicate for the same activity.
    output.rows.push({
      activity: ACTIVITIES[2],
      signal: "visible_investment",
      competitor: "MadeUpCorp",
      signal_type: "shipping",
      evidence_quote: "totally invented launch claim",
      gap_read: "fabricated duplicate",
    });
    expect(parseOperationalBenchmarkArtifact(JSON.stringify(output), EXCERPTS, ACTIVITIES, COMPETITORS)).toBeNull();
  });

  it("rejects missing gap_read, missing body, empty rows, and non-JSON", () => {
    const noGapRead = JSON.parse(benchmarkOutput()) as { rows: Array<Record<string, unknown>> };
    delete noGapRead.rows[0].gap_read;
    expect(parseOperationalBenchmarkArtifact(JSON.stringify(noGapRead), EXCERPTS, ACTIVITIES, COMPETITORS)).toBeNull();
    const noBody = JSON.parse(benchmarkOutput()) as Record<string, unknown>;
    delete noBody.body_md;
    expect(parseOperationalBenchmarkArtifact(JSON.stringify(noBody), EXCERPTS, ACTIVITIES, COMPETITORS)).toBeNull();
    expect(parseOperationalBenchmarkArtifact(JSON.stringify({ rows: [], body_md: "## Operational benchmark" }), EXCERPTS, ACTIVITIES, COMPETITORS)).toBeNull();
    expect(parseOperationalBenchmarkArtifact("not json at all", EXCERPTS, ACTIVITIES, COMPETITORS)).toBeNull();
  });

  it("strips code fences around otherwise valid JSON", () => {
    const fenced = "```json\n" + benchmarkOutput() + "\n```";
    expect(parseOperationalBenchmarkArtifact(fenced, EXCERPTS, ACTIVITIES, COMPETITORS)?.rows).toHaveLength(3);
  });
});
