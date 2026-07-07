import { asRecord } from "../../db/json.js";
import type { CanvasItemSource, SkillRun } from "./toolkit.js";

/**
 * ledger.efficiency_scan — the Cost Structure room's vendor hunt: for the
 * cost drivers we have actually named on our own canvas, which vendors and
 * tooling attack them, with adoption evidence. Live evidence comes from a
 * Grok search over "<our top cost driver texts> software vendors tools
 * reduce cost" — never from the model's own vendor memory: every row must
 * name one of OUR cost drivers VERBATIM and quote one of the retrieved
 * excerpts VERBATIM (parser-enforced, one ungrounded row rejects the whole
 * parse), and the top rows are verifier-spot-checked against the excerpt
 * that contains their quote. Rows come back ranked by expected impact.
 */

export interface EfficiencyScanRow {
  /** Verbatim one of our own Cost Structure item texts — parser-enforced. */
  cost_driver: string;
  /** The vendor or tooling candidate named in the evidence. */
  vendor: string;
  /** 1–5 expected impact on the named cost driver (5 = large, proven). */
  impact_score: number;
  /** One-sentence expected-impact rationale. */
  expected_impact: string;
  /** Verbatim substring of one of the retrieved excerpts — parser-enforced. */
  evidence_quote: string;
}

export interface EfficiencyScanArtifact {
  bodyMd: string;
  /** Ranked: highest impact_score first (ties keep the model's order). */
  rows: EfficiencyScanRow[];
}

export const runEfficiencyScan: SkillRun = async (toolkit, job, scope) => {
  // The vendor search hangs off the analyzed company — without one there is
  // no industry to scope the evidence query (or the feed cache key) to.
  if (!scope.companyName) throw new Error("efficiency_scan requires an analyzed company first");
  const companyName = scope.companyName;

  // Required input: the scan attacks OUR named cost drivers, so an empty
  // Cost Structure canvas means there is nothing to scan for.
  const costs = await toolkit.loadOwnSectionItems(job.account_id, "cost_structure", scope);
  if (costs.length === 0) throw new Error("efficiency_scan requires our Cost Structure canvas items first");

  const topDrivers = costs.slice(0, 4).map((item) => item.text);
  const feed = await toolkit.refreshFeed({
    accountId: job.account_id,
    feedKey: "grok_live_search",
    // Company-scoped: without the company slug, re-analyzing to a different
    // company within the feed TTL would serve the previous company's cached
    // vendor excerpts (cross-company contamination).
    cacheKey: `efficiency_scan:${job.account_id}:${slug(companyName)}`,
    companyName,
    query: `${topDrivers.join("; ")} software vendors tools reduce cost`,
  });
  const sources = feed.health === "ok"
    ? feed.evidence.filter((entry) => Boolean(entry.excerpt?.trim())).slice(0, 6)
    : [];
  if (sources.length === 0) {
    throw new Error("efficiency_scan could not retrieve vendor evidence — check the Grok search feed");
  }

  // Every excerpt that feeds the prompt lands on the evidence ledger first —
  // the artifact's evidence_ids must point at what the model actually saw.
  const feedEvidenceIds: string[] = [];
  for (const source of sources) {
    feedEvidenceIds.push(await toolkit.writeEvidence(job, {
      title: `${companyName} efficiency-scan source`,
      sourceUrl: source.sourceUrl ?? "grok_live_search",
      excerpt: source.excerpt ?? "",
    }));
  }
  const excerpts = sources.map((source) => source.excerpt ?? "");

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const verifyRoute = toolkit.requiredRoute(routes, job.account_id, "research_verify", "research_verify");
  const modelResult = await toolkit.runModel(
    `efficiency_scan artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: efficiencyScanPrompt(companyName, costs, excerpts),
      systemPrompt:
        "You match vendors and tooling to named cost drivers strictly from the provided excerpts. Every row's cost_driver must repeat one of our Cost Structure items verbatim and every evidence_quote must appear verbatim in one of the excerpts — never cite vendors from memory. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseEfficiencyScanArtifact(
    modelResult.resultText,
    costs.map((item) => item.text),
    excerpts,
  );
  if (!artifact) throw new Error("efficiency_scan produced unparseable output; refusing to write an artifact");

  // Verifier spot-check: each top row against the excerpt that contains its
  // quote (the parser guarantees one exists).
  const checks = artifact.rows.slice(0, 4).map((row) => ({
    claim: `${row.vendor} can reduce our cost driver "${row.cost_driver}": ${row.expected_impact}`,
    excerpt: excerpts.find((excerpt) => excerpt.includes(row.evidence_quote)) ?? "",
  }));
  const checked = await toolkit.verifyArtifactClaims(job, verifyRoute, checks, "efficiency_scan");

  const driversCovered = toolkit.unique(artifact.rows.map((row) => row.cost_driver)).length;
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "ledger.efficiency_scan",
    agentKey: "agent_cost_structure",
    title: `Efficiency scan — ${artifact.rows.length} vendor candidate${artifact.rows.length === 1 ? "" : "s"} across ${driversCovered} cost driver${driversCovered === 1 ? "" : "s"}`,
    bodyMd: artifact.bodyMd,
    payload: { rows: artifact.rows, spot_check: checked },
    // Covers everything the model saw: the retrieved excerpts AND the own
    // cost items the rows are grounded in.
    evidenceIds: toolkit.unique([...feedEvidenceIds, ...costs.flatMap((item) => item.evidenceIds)]),
    inputs: { sections: ["cost_structure"], company: companyName, evidence_excerpts: excerpts.length },
  });
  await toolkit.markRunCompleted(job, "Efficiency scan completed", {
    skill_key: "ledger.efficiency_scan",
    rows: artifact.rows.length,
    cost_drivers_covered: driversCovered,
    spot_check_confirmed: checked.confirmed,
  });
};

export function efficiencyScanPrompt(
  companyName: string,
  costs: CanvasItemSource[],
  excerpts: string[],
): string {
  return `Find vendors and tooling that attack ${companyName}'s named cost drivers, using ONLY the evidence excerpts below:
- Each row targets exactly one of our Cost Structure items — copy it into "cost_driver" EXACTLY, character for character.
- "vendor" is a vendor or tooling candidate the excerpts actually name for that cost driver.
- "impact_score" is 1 to 5: expected impact on that cost driver (5 = large, adoption-proven savings; 1 = marginal).
- "expected_impact" is a one-sentence rationale for the expected impact, grounded in the adoption evidence.
- Every row's "evidence_quote" must be a phrase copied VERBATIM from one of the excerpts. Skip any vendor the excerpts do not name — never cite from memory.
- Order rows by impact_score, highest first.
Return JSON only:
{"rows":[{"cost_driver":"<verbatim one of our Cost Structure items>","vendor":"...","impact_score":4,"expected_impact":"one-sentence rationale","evidence_quote":"verbatim phrase from an excerpt"}],"body_md":"## Efficiency scan\\n..."}

Our Cost Structure items (target these, verbatim):
${formatOwnItems(costs)}

Evidence excerpts:
${excerpts.map((excerpt, index) => `[${index}] ${excerpt.slice(0, 2500)}`).join("\n\n")}`;
}

/**
 * The grounding gate. Every row must name one of OUR cost items verbatim and
 * quote one of the retrieved excerpts verbatim. One ungrounded row rejects
 * the WHOLE parse: silently dropping it would still leave its narrative in
 * body_md, shipping an invented vendor to the owner under a label that
 * implies grounding. Surviving rows come back ranked by impact_score.
 */
export function parseEfficiencyScanArtifact(
  text: string,
  costTexts: string[],
  excerpts: string[],
): EfficiencyScanArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const allowedDrivers = new Set(costTexts);
  if (!Array.isArray(parsed.rows)) return null;
  const rows: EfficiencyScanRow[] = [];
  for (const entry of parsed.rows) {
    const row = asRecord(entry);
    const costDriver = readString(row.cost_driver);
    const vendor = readString(row.vendor);
    const expectedImpact = readString(row.expected_impact);
    const evidenceQuote = readString(row.evidence_quote);
    if (!costDriver || !vendor || !expectedImpact || !evidenceQuote) return null;
    // The cost driver must be OUR canvas item verbatim — the model may not
    // invent (or paraphrase) a cost we never wrote down.
    if (!allowedDrivers.has(costDriver)) return null;
    // The quote must live in one of the excerpts the model was shown — a
    // vendor cited from the model's memory rejects the whole parse.
    if (!excerpts.some((excerpt) => excerpt.includes(evidenceQuote))) return null;
    rows.push({
      cost_driver: costDriver,
      vendor,
      impact_score: boundedScore(row.impact_score),
      expected_impact: expectedImpact,
      evidence_quote: evidenceQuote,
    });
  }
  const bodyMd = readString(parsed.body_md);
  if (rows.length === 0 || !bodyMd) return null;
  // Ranked output regardless of the model's ordering discipline; sort() is
  // stable, so ties keep the model's order.
  rows.sort((a, b) => b.impact_score - a.impact_score);
  return { bodyMd, rows };
}

function formatOwnItems(items: CanvasItemSource[]): string {
  return items.length > 0 ? items.map((item) => `- ${item.text}`).join("\n") : "- (none recorded)";
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const unfenced = text.replace(/```(?:json)?/gi, "```").replace(/```/g, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return asRecord(JSON.parse(unfenced.slice(start, end + 1)));
  } catch {
    return null;
  }
}

function boundedScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 1;
  return Math.min(5, Math.max(1, Math.round(score)));
}

// Mirror of skill-run.ts's slug — feed cache keys must be stable per company.
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "company";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
