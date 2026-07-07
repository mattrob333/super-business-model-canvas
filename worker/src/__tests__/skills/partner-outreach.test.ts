import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import {
  excludeExistingPartners,
  OUTREACH_DRAFT_NOTICE,
  parsePartnerOutreachArtifact,
  runPartnerOutreach,
  topOutreachCandidates,
  type OutreachCandidate,
} from "../../jobs/skills/partner-outreach.js";
import type { CanvasItemSource } from "../../jobs/skills/toolkit.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient, type SkillFakeQuery } from "./harness.js";

// The supply-chain map's candidates as this skill consumes them: ServoWorks
// is listed FIRST in the payload but FlowLine has the higher fit score, so
// the drafts must come back FlowLine-first.
const MAP_CANDIDATES = [
  {
    name: "ServoWorks",
    role: "upstream",
    fit_score: 4,
    rationale: "A named actuator supplier the industry already depends on.",
    evidence_quote: "source precision actuators from ServoWorks",
  },
  {
    name: "FlowLine Integration",
    role: "downstream",
    fit_score: 5,
    rationale: "A named integrator that resells robots into the target market.",
    evidence_quote: "FlowLine Integration resell industrial robots",
  },
];

const TOP_CANDIDATES: OutreachCandidate[] = [
  { ...MAP_CANDIDATES[1] },
  { ...MAP_CANDIDATES[0] },
];

function draftsOutput(): string {
  return JSON.stringify({
    drafts: [{
      partner_name: "FlowLine Integration",
      subject: "Acme Robotics x FlowLine Integration — a reseller partnership",
      body: "Hi FlowLine Integration team — you already resell industrial robots into mid-market factories; our robots install in one day, which shortens your integration projects.",
      evidence_quote: "FlowLine Integration resell industrial robots",
    }, {
      partner_name: "ServoWorks",
      subject: "Supply partnership with Acme Robotics",
      body: "Hi ServoWorks team — the industry already sources precision actuators from you, and we want a direct supply line for our next platform.",
      evidence_quote: "source precision actuators from ServoWorks",
    }],
    body_md: "## Partner outreach drafts\nTwo drafts, one per top candidate.",
  });
}

/**
 * SkillFakeClient extended with a skill_artifacts store so
 * toolkit.loadLatestArtifact has something to read. Honors .eq/.in filters
 * and newest-first ordering the way postgrest would — so a trap artifact
 * from the previous company era (ctx-0) only stays out if the skill's read
 * is actually company-scoped.
 */
class OutreachFakeClient extends SkillFakeClient {
  public artifactRows: Array<Record<string, unknown>> = [];

  addMapArtifact(
    contextId: string,
    candidates: Array<Record<string, unknown>>,
    createdAt = "2026-07-05T00:00:00Z",
  ): void {
    this.artifactRows.push({
      account_id: "account-1",
      business_context_version_id: contextId,
      skill_key: "envoy.supply_chain_map",
      title: "Supply-chain map — candidates",
      body_md: "## Supply-chain map",
      payload: { upstream: [], downstream: [], candidates },
      created_at: createdAt,
    });
  }

  from(table: string): SkillFakeQuery {
    if (table !== "skill_artifacts") return super.from(table);
    const filters: Array<{ op: string; column: string; value: unknown }> = [];
    let insertValues: Record<string, unknown> | null = null;
    // Arrow functions below close over `this` lexically — no alias needed.
    const resolveRows = (): Array<Record<string, unknown>> => {
      let rows = [...this.artifactRows];
      for (const filter of filters) {
        if (filter.op === "eq") rows = rows.filter((row) => row[filter.column] === filter.value);
        if (filter.op === "in") rows = rows.filter((row) => (filter.value as unknown[]).includes(row[filter.column]));
      }
      return rows.sort((a, b) => ((a.created_at as string) < (b.created_at as string) ? 1 : -1));
    };
    const chain = {
      select: () => chain,
      insert: (values: Record<string, unknown>) => { insertValues = values; return chain; },
      eq: (column: string, value: unknown) => { filters.push({ op: "eq", column, value }); return chain; },
      in: (column: string, value: unknown) => { filters.push({ op: "in", column, value }); return chain; },
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve({ data: resolveRows()[0] ?? null, error: null }),
      then: (onfulfilled?: (value: { data: unknown; error: null }) => unknown) => {
        if (insertValues) this.inserts.push({ table, values: insertValues });
        return Promise.resolve({ data: insertValues ? null : resolveRows(), error: null as null }).then(onfulfilled);
      },
    };
    return chain as unknown as SkillFakeQuery;
  }
}

function seedInputs(client: OutreachFakeClient): void {
  client.addMapArtifact("ctx-1", MAP_CANDIDATES);
  client.addOwnSection("key_partners", [
    { text: "Contract manufacturer in Taiwan", evidence_ids: ["ev-own-kp"] },
  ]);
  client.addOwnSection("value_propositions", [
    { text: "Robots that install in one day", evidence_ids: ["ev-own-vp"] },
  ]);
}

function makeHandler(client: OutreachFakeClient, runner: ScriptedSkillRunner): SkillRunHandler {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner,
    feedRunner: makeFakeFeedRunner({}),
  });
}

describe("envoy.partner_outreach", () => {
  it("drafts one grounded outreach per top map candidate and writes the approval-surface artifact stamped to the active company", async () => {
    const client = new OutreachFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(draftsOutput(), "{}");
    await makeHandler(client, runner).runSkillModule(runPartnerOutreach, makeSkillJob("envoy.partner_outreach"));

    // Canvas-only + prior-artifact inputs: exactly one model pass, no verifier.
    expect(runner.requests).toHaveLength(1);
    const prompt = runner.requests[0]?.prompt ?? "";
    expect(prompt).toContain("FlowLine Integration");
    expect(prompt).toContain("source precision actuators from ServoWorks");
    expect(prompt).toContain("Contract manufacturer in Taiwan");
    expect(prompt).toContain("Robots that install in one day");

    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "envoy.partner_outreach",
      title: "Partner outreach drafts — 2 drafts awaiting owner approval",
      evidence_ids: ["ev-own-kp", "ev-own-vp"],
    });
    // The artifact IS the approval surface: drafts are labeled as drafts and
    // the body states nothing is ever sent autonomously.
    expect(artifact?.values.body_md).toContain(OUTREACH_DRAFT_NOTICE);
    const payload = artifact?.values.payload as {
      status: string;
      verification: string;
      drafts: Array<Record<string, unknown>>;
    };
    expect(payload.status).toBe("drafts_awaiting_owner_approval");
    expect(payload.verification).toBe("parser_grounded_drafts");
    // Best fit first, and the map's rationale/evidence_quote carried verbatim.
    expect(payload.drafts.map((draft) => draft.partner_name)).toEqual(["FlowLine Integration", "ServoWorks"]);
    expect(payload.drafts[0]).toMatchObject({
      rationale: "A named integrator that resells robots into the target market.",
      evidence_quote: "FlowLine Integration resell industrial robots",
    });
    expect(payload.drafts[1]).toMatchObject({
      rationale: "A named actuator supplier the industry already depends on.",
      evidence_quote: "source precision actuators from ServoWorks",
    });
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values).toMatchObject({
      status: "completed",
      output: { skill_key: "envoy.partner_outreach", drafts: 2, status: "drafts_awaiting_owner_approval" },
    });
  });

  it("never lets the previous company's canvas rows or map artifact reach the prompt", async () => {
    const client = new OutreachFakeClient();
    seedInputs(client);
    // Cross-company traps: a NEWER key_partners row AND a NEWER supply-chain
    // map artifact, both from the previous company's era (ctx-0).
    client.addTrapRow("key_partners", "Stale old-company text");
    client.addMapArtifact("ctx-0", [{
      name: "Stale Old Partner",
      role: "upstream",
      fit_score: 5,
      rationale: "stale rationale",
      evidence_quote: "stale quote",
    }], "2026-07-06T00:00:00Z");
    const runner = new ScriptedSkillRunner(draftsOutput(), "{}");
    await makeHandler(client, runner).runSkillModule(runPartnerOutreach, makeSkillJob("envoy.partner_outreach"));

    const prompt = runner.requests[0]?.prompt ?? "";
    expect(prompt).toContain("FlowLine Integration");
    expect(prompt).toContain("Contract manufacturer in Taiwan");
    expect(prompt).not.toContain("Stale old-company text");
    expect(prompt).not.toContain("Stale Old Partner");
  });

  it("excludes a map candidate that is already a Key Partner — no outreach draft courts an existing partner", async () => {
    const client = new OutreachFakeClient();
    client.addMapArtifact("ctx-1", MAP_CANDIDATES);
    // ServoWorks is a top map candidate AND already one of our Key Partners
    // (the map's exclusion is prompt-only, so this overlap is reachable).
    client.addOwnSection("key_partners", [
      { text: "ServoWorks — actuator supply agreement", evidence_ids: ["ev-own-kp"] },
    ]);
    client.addOwnSection("value_propositions", [
      { text: "Robots that install in one day", evidence_ids: ["ev-own-vp"] },
    ]);
    const runner = new ScriptedSkillRunner(JSON.stringify({
      drafts: [{
        partner_name: "FlowLine Integration",
        subject: "Acme Robotics x FlowLine Integration — a reseller partnership",
        body: "Hi FlowLine Integration team — you already resell industrial robots.",
        evidence_quote: "FlowLine Integration resell industrial robots",
      }],
      body_md: "## Partner outreach drafts\nOne draft for the one non-partner candidate.",
    }), "{}");
    await makeHandler(client, runner).runSkillModule(runPartnerOutreach, makeSkillJob("envoy.partner_outreach"));

    // ServoWorks never reaches the candidate list: its rationale line is
    // absent from the prompt even though its name appears in the Key
    // Partners context section.
    const prompt = runner.requests[0]?.prompt ?? "";
    expect(prompt).toContain("FlowLine Integration");
    expect(prompt).not.toContain("A named actuator supplier the industry already depends on.");
    expect(prompt).toContain("ServoWorks — actuator supply agreement");

    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values.title).toBe("Partner outreach drafts — 1 draft awaiting owner approval");
    const payload = artifact?.values.payload as { drafts: Array<Record<string, unknown>> };
    expect(payload.drafts.map((draft) => draft.partner_name)).toEqual(["FlowLine Integration"]);
    expect(artifact?.values.inputs).toMatchObject({ candidates: 1 });
  });

  it("fails honestly when every usable map candidate is already a Key Partner — no model call, no artifact", async () => {
    const client = new OutreachFakeClient();
    client.addMapArtifact("ctx-1", MAP_CANDIDATES);
    client.addOwnSection("key_partners", [
      { text: "ServoWorks — actuator supply agreement", evidence_ids: [] },
      { text: "Reseller deal with FlowLine Integration", evidence_ids: [] },
    ]);
    const runner = new ScriptedSkillRunner(draftsOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runPartnerOutreach, makeSkillJob("envoy.partner_outreach")))
      .rejects.toThrow(/already a Key Partner/);
    expect(runner.requests).toHaveLength(0);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("fails honestly when no supply-chain map exists — no model call, no artifact", async () => {
    const client = new OutreachFakeClient();
    client.addOwnSection("key_partners", [{ text: "Contract manufacturer in Taiwan", evidence_ids: [] }]);
    const runner = new ScriptedSkillRunner(draftsOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runPartnerOutreach, makeSkillJob("envoy.partner_outreach")))
      .rejects.toThrow("partner_outreach requires a supply-chain map first; run envoy.supply_chain_map");
    expect(runner.requests).toHaveLength(0);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("fails honestly when the latest map holds no usable candidates — no model call, no artifact", async () => {
    const client = new OutreachFakeClient();
    // A map exists, but its candidate rows are unusable for grounded drafts.
    client.addMapArtifact("ctx-1", [{ name: "Quoteless Corp", role: "upstream", fit_score: 3, rationale: "r" }]);
    const runner = new ScriptedSkillRunner(draftsOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runPartnerOutreach, makeSkillJob("envoy.partner_outreach")))
      .rejects.toThrow(/no usable partnership candidates/);
    expect(runner.requests).toHaveLength(0);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("refuses to write an artifact when a draft alters the candidate's evidence quote", async () => {
    const client = new OutreachFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(JSON.stringify({
      drafts: [{
        partner_name: "FlowLine Integration",
        subject: "FlowLine Integration partnership",
        body: "Hi FlowLine Integration team.",
        // Paraphrased, not verbatim — breaks the chain back to the map's evidence.
        evidence_quote: "FlowLine resells robots",
      }, {
        partner_name: "ServoWorks",
        subject: "ServoWorks partnership",
        body: "Hi ServoWorks team.",
        evidence_quote: "source precision actuators from ServoWorks",
      }],
      body_md: "## Partner outreach drafts",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runPartnerOutreach, makeSkillJob("envoy.partner_outreach")))
      .rejects.toThrow("partner_outreach produced unparseable output; refusing to write an artifact");
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("refuses to write an artifact when the model drafts to a partner the map never proposed", async () => {
    const client = new OutreachFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(JSON.stringify({
      drafts: [{
        partner_name: "GhostSupply Inc",
        subject: "GhostSupply Inc partnership",
        body: "Hi GhostSupply Inc team.",
        evidence_quote: "source precision actuators from ServoWorks",
      }],
      body_md: "## Partner outreach drafts",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runPartnerOutreach, makeSkillJob("envoy.partner_outreach")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("topOutreachCandidates", () => {
  it("sorts by fit score, caps at five, and dedupes names keeping the best-scored row", () => {
    const candidates = topOutreachCandidates({
      candidates: [
        { name: "A", role: "upstream", fit_score: 1, rationale: "r", evidence_quote: "q" },
        { name: "B", role: "upstream", fit_score: 5, rationale: "r", evidence_quote: "q" },
        { name: "C", role: "upstream", fit_score: 4, rationale: "r", evidence_quote: "q" },
        { name: "B", role: "upstream", fit_score: 2, rationale: "dupe", evidence_quote: "q" },
        { name: "D", role: "upstream", fit_score: 3, rationale: "r", evidence_quote: "q" },
        { name: "E", role: "upstream", fit_score: 3, rationale: "r", evidence_quote: "q" },
        { name: "F", role: "upstream", fit_score: 2, rationale: "r", evidence_quote: "q" },
      ],
    });
    expect(candidates.map((candidate) => candidate.name)).toEqual(["B", "C", "D", "E", "F"]);
    expect(candidates[0]?.rationale).toBe("r");
  });

  it("skips rows unusable for grounded outreach and defaults non-numeric fit scores to 1", () => {
    const candidates = topOutreachCandidates({
      candidates: [
        { name: "NoQuote", role: "upstream", fit_score: 5, rationale: "r" },
        { role: "upstream", fit_score: 5, rationale: "r", evidence_quote: "q" },
        { name: "Fuzzy", role: "upstream", fit_score: "high", rationale: "r", evidence_quote: "q" },
      ],
    });
    expect(candidates).toEqual([
      { name: "Fuzzy", role: "upstream", fit_score: 1, rationale: "r", evidence_quote: "q" },
    ]);
    expect(topOutreachCandidates({})).toEqual([]);
    expect(topOutreachCandidates({ candidates: "not an array" })).toEqual([]);
  });
});

describe("excludeExistingPartners", () => {
  const ownPartner = (text: string): CanvasItemSource => ({
    sectionKey: "key_partners",
    text,
    evidenceIds: [],
  });

  it("drops a candidate whose name appears in a key_partners item, case-insensitively", () => {
    const kept = excludeExistingPartners(TOP_CANDIDATES, [
      ownPartner("Long-term supply agreement with SERVOWORKS for actuators"),
    ]);
    expect(kept.map((candidate) => candidate.name)).toEqual(["FlowLine Integration"]);
  });

  it("keeps every candidate when no key_partners item mentions one", () => {
    expect(excludeExistingPartners(TOP_CANDIDATES, [ownPartner("Contract manufacturer in Taiwan")]))
      .toEqual(TOP_CANDIDATES);
    expect(excludeExistingPartners(TOP_CANDIDATES, [])).toEqual(TOP_CANDIDATES);
  });

  it("returns empty when every candidate is already a partner", () => {
    expect(excludeExistingPartners(TOP_CANDIDATES, [
      ownPartner("ServoWorks supply deal"),
      ownPartner("Reseller deal with FlowLine Integration"),
    ])).toEqual([]);
  });
});

describe("parsePartnerOutreachArtifact", () => {
  it("parses grounded drafts, orders them by candidate, and carries rationale verbatim from the map", () => {
    const parsed = parsePartnerOutreachArtifact(draftsOutput(), TOP_CANDIDATES);
    expect(parsed?.drafts.map((draft) => draft.partner_name)).toEqual(["FlowLine Integration", "ServoWorks"]);
    expect(parsed?.drafts[1]?.rationale).toBe("A named actuator supplier the industry already depends on.");
    expect(parsed?.bodyMd).toContain("Partner outreach drafts");
  });

  it("nulls the whole parse on an invented partner — no silent dropping", () => {
    expect(parsePartnerOutreachArtifact(JSON.stringify({
      drafts: [{
        partner_name: "GhostSupply Inc",
        subject: "GhostSupply Inc hello",
        body: "b",
        evidence_quote: "FlowLine Integration resell industrial robots",
      }],
      body_md: "## Drafts",
    }), TOP_CANDIDATES)).toBeNull();
  });

  it("nulls on an altered evidence quote", () => {
    const output = JSON.parse(draftsOutput());
    output.drafts[0].evidence_quote = "FlowLine Integration resells industrial robots";
    expect(parsePartnerOutreachArtifact(JSON.stringify(output), TOP_CANDIDATES)).toBeNull();
  });

  it("nulls when a top candidate is missing a draft or a candidate is drafted twice", () => {
    const partial = JSON.parse(draftsOutput());
    partial.drafts = partial.drafts.slice(0, 1);
    expect(parsePartnerOutreachArtifact(JSON.stringify(partial), TOP_CANDIDATES)).toBeNull();

    const doubled = JSON.parse(draftsOutput());
    doubled.drafts[1] = { ...doubled.drafts[0] };
    expect(parsePartnerOutreachArtifact(JSON.stringify(doubled), TOP_CANDIDATES)).toBeNull();
  });

  it("nulls when a draft never names its partner — a generic template is not outreach", () => {
    const generic = JSON.parse(draftsOutput());
    generic.drafts[0].subject = "Quick partnership idea";
    generic.drafts[0].body = "Hi there — we should partner.";
    expect(parsePartnerOutreachArtifact(JSON.stringify(generic), TOP_CANDIDATES)).toBeNull();
  });

  it("nulls on missing fields, missing body_md, and non-JSON", () => {
    const missingSubject = JSON.parse(draftsOutput());
    delete missingSubject.drafts[0].subject;
    expect(parsePartnerOutreachArtifact(JSON.stringify(missingSubject), TOP_CANDIDATES)).toBeNull();

    const noBody = JSON.parse(draftsOutput());
    delete noBody.body_md;
    expect(parsePartnerOutreachArtifact(JSON.stringify(noBody), TOP_CANDIDATES)).toBeNull();

    expect(parsePartnerOutreachArtifact("not json at all", TOP_CANDIDATES)).toBeNull();
    expect(parsePartnerOutreachArtifact(JSON.stringify({ drafts: "nope", body_md: "b" }), TOP_CANDIDATES)).toBeNull();
  });
});
