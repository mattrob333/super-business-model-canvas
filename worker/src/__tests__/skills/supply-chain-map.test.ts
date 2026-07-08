import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { parseSupplyChainMapArtifact, runSupplyChainMap } from "../../jobs/skills/supply-chain-map.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient } from "./harness.js";

const EXCERPTS = [
  "Robotics OEMs like Acme Robotics source precision actuators from ServoWorks and depend on chip supply.",
  "System integrators such as FlowLine Integration resell industrial robots to mid-market factories.",
];

function feedFixtures() {
  return makeFakeFeedRunner({
    "supply_chain_map:": [{
      title: "Robotics industry supply chain overview",
      excerpt: EXCERPTS[0],
      sourceType: "social",
      sourceName: "Web Search",
      sourceUrl: "https://industry.example/robotics-supply-chain",
    }, {
      title: "Robotics distribution landscape",
      excerpt: EXCERPTS[1],
      sourceType: "social",
      sourceName: "Web Search",
      // No sourceUrl — the skill must fall back to the feed name.
    }],
  });
}

function mapOutput(): string {
  return JSON.stringify({
    upstream: ["Precision actuator suppliers", "Chip supply"],
    downstream: ["System integrators", "Mid-market factories"],
    candidates: [{
      name: "ServoWorks",
      role: "upstream",
      fit_score: 4,
      rationale: "A named actuator supplier the industry already depends on.",
      evidence_quote: "source precision actuators from ServoWorks",
    }, {
      name: "FlowLine Integration",
      role: "downstream",
      fit_score: 5,
      rationale: "A named integrator that resells robots into the target market.",
      evidence_quote: "FlowLine Integration resell industrial robots",
    }],
    body_md: "## Supply-chain map\nIntegrators are the fastest partnership path.",
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

describe("envoy.supply_chain_map", () => {
  it("maps the chain from feed evidence and writes a verified artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(mapOutput(), JSON.stringify({ status: "confirmed", reason: "excerpt names the partner" }));
    await makeHandler(client, runner).runSkillModule(runSupplyChainMap, makeSkillJob("envoy.supply_chain_map"));

    // Every excerpt fed to the model landed on the evidence ledger first.
    expect(client.inserts.filter((entry) => entry.table === "evidence_items")).toHaveLength(2);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "envoy.supply_chain_map",
      title: "Supply-chain map — 2 partnership candidates",
      evidence_ids: ["evidence-1"],
    });
    const payload = artifact?.values.payload as {
      upstream: string[];
      downstream: string[];
      candidates: Array<Record<string, unknown>>;
      spot_check: Record<string, unknown>;
    };
    expect(payload.upstream).toEqual(["Precision actuator suppliers", "Chip supply"]);
    expect(payload.downstream).toEqual(["System integrators", "Mid-market factories"]);
    expect(payload.candidates).toHaveLength(2);
    expect(payload.candidates[0]).toMatchObject({ name: "ServoWorks", role: "upstream", fit_score: 4 });
    expect(payload.candidates[1]).toMatchObject({ name: "FlowLine Integration", role: "downstream", fit_score: 5 });
    expect(payload.spot_check).toEqual({ checked: 2, confirmed: 2 });
    // Own partner items are optional context in the prompt.
    expect(runner.requests[0]?.prompt).toContain("Contract manufacturer in Taiwan");
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({ status: "completed", output: { skill_key: "envoy.supply_chain_map", candidates: 2, spot_check_confirmed: 2 } });
  });

  it("scopes the feed cache key to the analyzed company so a re-analyzed account never reuses stale excerpts", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(mapOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    const seen: string[] = [];
    const inner = feedFixtures() as { refresh(request: { cacheKey?: string; feedKey: string }): Promise<unknown> };
    const spyingFeedRunner = {
      async refresh(request: { cacheKey?: string; feedKey: string }) {
        seen.push(request.cacheKey ?? "");
        return inner.refresh(request);
      },
    } as never;
    const handler = new SkillRunHandler({ client: client.asSupabase(), runner, feedRunner: spyingFeedRunner });
    await handler.runSkillModule(runSupplyChainMap, makeSkillJob("envoy.supply_chain_map"));
    // Without the company slug, switching companies within the feed TTL would
    // serve the previous company's cached supply-chain excerpts.
    expect(seen).toEqual(["supply_chain_map:account-1:acme-robotics"]);
  });

  it("never lets the previous company's key partners reach the prompt", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER key_partners row from the ctx-0 era.
    client.addTrapRow("key_partners", "Stale old-company text");
    const runner = new ScriptedSkillRunner(mapOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    await makeHandler(client, runner).runSkillModule(runSupplyChainMap, makeSkillJob("envoy.supply_chain_map"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain("Contract manufacturer in Taiwan");
    expect(mainPrompt).not.toContain("Stale old-company text");
  });

  it("fails honestly when no company has been analyzed — no artifact, no model call", async () => {
    const client = new SkillFakeClient();
    // No contexts at all: scope.companyName resolves to null.
    client.contexts = [];
    const runner = new ScriptedSkillRunner(mapOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runSupplyChainMap, makeSkillJob("envoy.supply_chain_map")))
      .rejects.toThrow(/requires an analyzed company first/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when the feed returns no industry evidence", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(mapOutput(), "{}");
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runSupplyChainMap, makeSkillJob("envoy.supply_chain_map")))
      .rejects.toThrow(/could not retrieve industry evidence/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact from invented model output", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // The quote appears in no retrieved excerpt — a memory-cited candidate.
    const runner = new ScriptedSkillRunner(JSON.stringify({
      upstream: ["Invented layer"],
      downstream: [],
      candidates: [{
        name: "GhostSupply Inc",
        role: "upstream",
        fit_score: 5,
        rationale: "r",
        evidence_quote: "GhostSupply dominates the actuator market",
      }],
      body_md: "## Supply-chain map",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runSupplyChainMap, makeSkillJob("envoy.supply_chain_map")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("hard-fails on a contradicted spot-check — no artifact written", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(mapOutput(), JSON.stringify({ status: "contradicted", reason: "excerpt names a different supplier" }));
    await expect(makeHandler(client, runner).runSkillModule(runSupplyChainMap, makeSkillJob("envoy.supply_chain_map")))
      .rejects.toThrow(/spot-check contradicted/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("parseSupplyChainMapArtifact", () => {
  it("parses a grounded map and keeps only excerpt-quoted candidates", () => {
    const parsed = parseSupplyChainMapArtifact(mapOutput(), EXCERPTS);
    expect(parsed?.candidates.map((candidate) => candidate.name)).toEqual(["ServoWorks", "FlowLine Integration"]);
    expect(parsed?.bodyMd).toContain("Supply-chain map");
  });

  it("drops candidates whose quote is not a substring of any excerpt and nulls when none survive", () => {
    const mixed = JSON.stringify({
      upstream: [],
      downstream: [],
      candidates: [{
        name: "ServoWorks",
        role: "upstream",
        fit_score: 4,
        rationale: "r",
        evidence_quote: "source precision actuators from ServoWorks",
      }, {
        name: "GhostSupply Inc",
        role: "complement",
        fit_score: 5,
        rationale: "r",
        evidence_quote: "not in any excerpt",
      }],
      body_md: "## Supply-chain map",
    });
    expect(parseSupplyChainMapArtifact(mixed, EXCERPTS)?.candidates).toHaveLength(1);
    const allInvented = JSON.stringify({
      candidates: [{ name: "GhostSupply Inc", role: "upstream", fit_score: 5, rationale: "r", evidence_quote: "not in any excerpt" }],
      body_md: "## Supply-chain map",
    });
    expect(parseSupplyChainMapArtifact(allInvented, EXCERPTS)).toBeNull();
  });

  it("rejects unknown roles, missing fields, and non-JSON", () => {
    expect(parseSupplyChainMapArtifact(JSON.stringify({
      candidates: [{ name: "ServoWorks", role: "sideways", fit_score: 3, rationale: "r", evidence_quote: "source precision actuators from ServoWorks" }],
      body_md: "## Supply-chain map",
    }), EXCERPTS)).toBeNull();
    expect(parseSupplyChainMapArtifact(JSON.stringify({
      candidates: [{ name: "ServoWorks", role: "upstream", fit_score: 3, evidence_quote: "source precision actuators from ServoWorks" }],
      body_md: "## Supply-chain map",
    }), EXCERPTS)).toBeNull();
    expect(parseSupplyChainMapArtifact("not json at all", EXCERPTS)).toBeNull();
  });

  it("clamps fit_score to 1-5 and defaults non-numeric scores to 1", () => {
    const parsed = parseSupplyChainMapArtifact(JSON.stringify({
      candidates: [{
        name: "ServoWorks",
        role: "upstream",
        fit_score: 9,
        rationale: "r",
        evidence_quote: "source precision actuators from ServoWorks",
      }, {
        name: "FlowLine Integration",
        role: "downstream",
        fit_score: "high",
        rationale: "r",
        evidence_quote: "FlowLine Integration resell industrial robots",
      }],
      body_md: "## Supply-chain map",
    }), EXCERPTS);
    expect(parsed?.candidates[0]?.fit_score).toBe(5);
    expect(parsed?.candidates[1]?.fit_score).toBe(1);
  });
});
