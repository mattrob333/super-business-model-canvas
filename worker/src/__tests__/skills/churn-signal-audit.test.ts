import { describe, expect, it } from "vitest";
import { SkillRunHandler } from "../../jobs/skill-run.js";
import { parseChurnSignalAuditArtifact, runChurnSignalAudit } from "../../jobs/skills/churn-signal-audit.js";
import { makeFakeFeedRunner, makeSkillJob, ScriptedSkillRunner, SkillFakeClient } from "./harness.js";

const COMPANY = "Acme Robotics";
const COMPETITORS = ["RivalCo"];
const EXCERPTS = [
  "Acme Robotics reviewers keep saying support tickets sit unanswered for a week before anyone replies.",
  "Several RivalCo customers cancelled after surprise renewal price hikes doubled their annual bill.",
];

function feedFixtures() {
  return makeFakeFeedRunner({
    "churn_signal_audit:": [{
      title: "Acme Robotics review complaints",
      excerpt: EXCERPTS[0],
      sourceType: "social",
      sourceName: "Grok Live Search",
      sourceUrl: "https://reviews.example/acme-robotics",
    }, {
      title: "RivalCo churn chatter",
      excerpt: EXCERPTS[1],
      sourceType: "social",
      sourceName: "Grok Live Search",
      // No sourceUrl — the skill must fall back to the feed name.
    }],
  });
}

function auditOutput(): string {
  return JSON.stringify({
    themes: [{
      theme: "Slow support response",
      observed_about: "own",
      company: COMPANY,
      evidence_quote: "support tickets sit unanswered for a week",
      retention_play: "Commit to a 24-hour first-response SLA with an escalation path for at-risk accounts.",
    }, {
      theme: "Surprise renewal pricing",
      observed_about: "competitor",
      company: "RivalCo",
      evidence_quote: "cancelled after surprise renewal price hikes",
      retention_play: "Guarantee renewal price locks and market them against RivalCo's hikes.",
    }],
    body_md: "## Churn signal audit\nSupport latency is our churn driver; RivalCo bleeds on pricing.",
  });
}

function seedInputs(client: SkillFakeClient): void {
  client.addOwnSection("customer_relationships", [
    { text: "Dedicated onboarding manager for enterprise accounts", evidence_ids: ["ev-own-cr"] },
  ]);
}

function makeHandler(client: SkillFakeClient, runner: ScriptedSkillRunner): SkillRunHandler {
  return new SkillRunHandler({
    client: client.asSupabase(),
    runner,
    feedRunner: feedFixtures(),
  });
}

describe("anchor.churn_signal_audit", () => {
  it("clusters complaint themes from review evidence and writes a verified artifact stamped to the active company", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(auditOutput(), JSON.stringify({ status: "confirmed", reason: "excerpt contains the complaint" }));
    await makeHandler(client, runner).runSkillModule(runChurnSignalAudit, makeSkillJob("anchor.churn_signal_audit"));

    // Every excerpt fed to the model landed on the evidence ledger first.
    expect(client.inserts.filter((entry) => entry.table === "evidence_items")).toHaveLength(2);
    const artifact = client.inserts.find((entry) => entry.table === "skill_artifacts");
    expect(artifact?.values).toMatchObject({
      account_id: "account-1",
      business_context_version_id: "ctx-1",
      skill_key: "anchor.churn_signal_audit",
      title: "Churn signal audit — 2 complaint themes (1 own, 1 competitor)",
      evidence_ids: ["evidence-1"],
    });
    const payload = artifact?.values.payload as {
      themes: Array<Record<string, unknown>>;
      own_themes: number;
      competitor_themes: number;
      spot_check: Record<string, unknown>;
    };
    expect(payload.themes).toHaveLength(2);
    expect(payload.themes[0]).toMatchObject({ theme: "Slow support response", observed_about: "own", company: COMPANY });
    expect(payload.themes[1]).toMatchObject({ theme: "Surprise renewal pricing", observed_about: "competitor", company: "RivalCo" });
    expect(payload.own_themes).toBe(1);
    expect(payload.competitor_themes).toBe(1);
    expect(payload.spot_check).toEqual({ checked: 2, confirmed: 2 });
    // Own relationship items ride along as optional context in the prompt.
    expect(runner.requests[0]?.prompt).toContain("Dedicated onboarding manager for enterprise accounts");
    // The search query names both the company and its competitor.
    expect(client.updates.filter((update) => update.table === "agent_runs").at(-1)?.values)
      .toMatchObject({
        status: "completed",
        output: {
          skill_key: "anchor.churn_signal_audit",
          themes: 2,
          own_themes: 1,
          competitor_themes: 1,
          spot_check_confirmed: 2,
        },
      });
  });

  it("scopes the feed cache key to the analyzed company and queries company + competitor reviews", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(auditOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    const seen: Array<{ cacheKey?: string; query?: string }> = [];
    const inner = feedFixtures() as { refresh(request: { cacheKey?: string; feedKey: string; query?: string }): Promise<unknown> };
    const spyingFeedRunner = {
      async refresh(request: { cacheKey?: string; feedKey: string; query?: string }) {
        seen.push({ cacheKey: request.cacheKey, query: request.query });
        return inner.refresh(request);
      },
    } as never;
    const handler = new SkillRunHandler({ client: client.asSupabase(), runner, feedRunner: spyingFeedRunner });
    await handler.runSkillModule(runChurnSignalAudit, makeSkillJob("anchor.churn_signal_audit"));
    // Without the company slug, switching companies within the feed TTL would
    // serve the previous company's cached review excerpts.
    expect(seen).toHaveLength(1);
    expect(seen[0]?.cacheKey).toBe("churn_signal_audit:account-1:acme-robotics");
    expect(seen[0]?.query).toBe("Acme Robotics and RivalCo customer reviews complaints churn cancelled switching");
  });

  it("never lets the previous company's customer relationships reach the prompt", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // Cross-company trap: a NEWER customer_relationships row from the ctx-0 era.
    client.addTrapRow("customer_relationships", "Stale old-company text");
    const runner = new ScriptedSkillRunner(auditOutput(), JSON.stringify({ status: "confirmed", reason: "supported" }));
    await makeHandler(client, runner).runSkillModule(runChurnSignalAudit, makeSkillJob("anchor.churn_signal_audit"));

    const mainPrompt = runner.requests[0]?.prompt ?? "";
    expect(mainPrompt).toContain("Dedicated onboarding manager for enterprise accounts");
    expect(mainPrompt).not.toContain("Stale old-company text");
  });

  it("fails honestly when no company has been analyzed — no artifact, no model call", async () => {
    const client = new SkillFakeClient();
    // No contexts at all: scope.companyName resolves to null.
    client.contexts = [];
    const runner = new ScriptedSkillRunner(auditOutput(), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runChurnSignalAudit, makeSkillJob("anchor.churn_signal_audit")))
      .rejects.toThrow(/requires an analyzed company first/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("fails honestly when the feed returns no usable review excerpts", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(auditOutput(), "{}");
    const handler = new SkillRunHandler({
      client: client.asSupabase(),
      runner,
      feedRunner: makeFakeFeedRunner({}),
    });
    await expect(handler.runSkillModule(runChurnSignalAudit, makeSkillJob("anchor.churn_signal_audit")))
      .rejects.toThrow(/could not retrieve review evidence/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
    expect(runner.requests).toHaveLength(0);
  });

  it("refuses to write an artifact when a theme cites a complaint from model memory", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    // The quote appears in no retrieved excerpt — a memory-cited complaint.
    const runner = new ScriptedSkillRunner(JSON.stringify({
      themes: [{
        theme: "Data loss incidents",
        observed_about: "own",
        company: COMPANY,
        evidence_quote: "Acme Robotics lost customer data in the 2024 outage",
        retention_play: "Publish an incident postmortem.",
      }],
      body_md: "## Churn signal audit",
    }), "{}");
    await expect(makeHandler(client, runner).runSkillModule(runChurnSignalAudit, makeSkillJob("anchor.churn_signal_audit")))
      .rejects.toThrow(/unparseable/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });

  it("hard-fails on a contradicted spot-check — no artifact written", async () => {
    const client = new SkillFakeClient();
    seedInputs(client);
    const runner = new ScriptedSkillRunner(auditOutput(), JSON.stringify({ status: "contradicted", reason: "excerpt says the opposite" }));
    await expect(makeHandler(client, runner).runSkillModule(runChurnSignalAudit, makeSkillJob("anchor.churn_signal_audit")))
      .rejects.toThrow(/spot-check contradicted/);
    expect(client.inserts.filter((entry) => entry.table === "skill_artifacts")).toHaveLength(0);
  });
});

describe("parseChurnSignalAuditArtifact", () => {
  it("parses grounded themes with own-vs-competitor labels intact", () => {
    const parsed = parseChurnSignalAuditArtifact(auditOutput(), EXCERPTS, COMPANY, COMPETITORS);
    expect(parsed?.themes.map((theme) => theme.theme)).toEqual(["Slow support response", "Surprise renewal pricing"]);
    expect(parsed?.themes[0]?.observed_about).toBe("own");
    expect(parsed?.themes[1]?.observed_about).toBe("competitor");
    expect(parsed?.bodyMd).toContain("Churn signal audit");
  });

  it("rejects the WHOLE parse when any theme's quote is not a substring of an excerpt", () => {
    const mixed = JSON.stringify({
      themes: [{
        theme: "Slow support response",
        observed_about: "own",
        company: COMPANY,
        evidence_quote: "support tickets sit unanswered for a week",
        retention_play: "24-hour SLA.",
      }, {
        theme: "Invented complaint",
        observed_about: "own",
        company: COMPANY,
        evidence_quote: "not in any excerpt",
        retention_play: "p",
      }],
      body_md: "## Churn signal audit",
    });
    // Not a partial drop: the grounded first theme must not ship either.
    expect(parseChurnSignalAuditArtifact(mixed, EXCERPTS, COMPANY, COMPETITORS)).toBeNull();
  });

  it("rejects themes that misattribute the company", () => {
    // An "own" theme naming a different company is invented attribution.
    expect(parseChurnSignalAuditArtifact(JSON.stringify({
      themes: [{
        theme: "Surprise renewal pricing",
        observed_about: "own",
        company: "RivalCo",
        evidence_quote: "cancelled after surprise renewal price hikes",
        retention_play: "p",
      }],
      body_md: "## Churn signal audit",
    }), EXCERPTS, COMPANY, COMPETITORS)).toBeNull();
    // A "competitor" theme naming a company we never researched is invented.
    expect(parseChurnSignalAuditArtifact(JSON.stringify({
      themes: [{
        theme: "Surprise renewal pricing",
        observed_about: "competitor",
        company: "GhostCorp",
        evidence_quote: "cancelled after surprise renewal price hikes",
        retention_play: "p",
      }],
      body_md: "## Churn signal audit",
    }), EXCERPTS, COMPANY, COMPETITORS)).toBeNull();
  });

  it("rejects unknown observed_about labels, missing fields, empty themes, and non-JSON", () => {
    expect(parseChurnSignalAuditArtifact(JSON.stringify({
      themes: [{
        theme: "Slow support response",
        observed_about: "everyone",
        company: COMPANY,
        evidence_quote: "support tickets sit unanswered for a week",
        retention_play: "p",
      }],
      body_md: "## Churn signal audit",
    }), EXCERPTS, COMPANY, COMPETITORS)).toBeNull();
    expect(parseChurnSignalAuditArtifact(JSON.stringify({
      themes: [{
        theme: "Slow support response",
        observed_about: "own",
        company: COMPANY,
        evidence_quote: "support tickets sit unanswered for a week",
        // retention_play missing — a theme without a play is not a deliverable.
      }],
      body_md: "## Churn signal audit",
    }), EXCERPTS, COMPANY, COMPETITORS)).toBeNull();
    expect(parseChurnSignalAuditArtifact(JSON.stringify({ themes: [], body_md: "## Churn signal audit" }), EXCERPTS, COMPANY, COMPETITORS)).toBeNull();
    expect(parseChurnSignalAuditArtifact(JSON.stringify({
      themes: [{
        theme: "Slow support response",
        observed_about: "own",
        company: COMPANY,
        evidence_quote: "support tickets sit unanswered for a week",
        retention_play: "p",
      }],
      // body_md missing.
    }), EXCERPTS, COMPANY, COMPETITORS)).toBeNull();
    expect(parseChurnSignalAuditArtifact("not json at all", EXCERPTS, COMPANY, COMPETITORS)).toBeNull();
  });

  it("rejects competitor themes when no competitors were researched", () => {
    expect(parseChurnSignalAuditArtifact(JSON.stringify({
      themes: [{
        theme: "Surprise renewal pricing",
        observed_about: "competitor",
        company: "RivalCo",
        evidence_quote: "cancelled after surprise renewal price hikes",
        retention_play: "p",
      }],
      body_md: "## Churn signal audit",
    }), EXCERPTS, COMPANY, [])).toBeNull();
  });
});
