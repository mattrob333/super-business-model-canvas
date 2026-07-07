import { asRecord } from "../../db/json.js";
import type { CanvasItemSource, SkillRun } from "./toolkit.js";

/**
 * yield.monetization_gaps — the Revenue Streams room's "what are we leaving
 * on the table" scan: monetization models researched competitors run that our
 * own Revenue Streams canvas does not, ranked most-promising first. Every gap
 * cites the competitor(s) running it, and every citation's evidence_quote
 * must be a VERBATIM substring of that named competitor's revenue_streams
 * canvas items (parser-enforced) — the model may not pin a business model on
 * a competitor from its own memory. Each gap ships with an adoption rationale
 * and one concrete first experiment so the finding is actionable, not a list.
 *
 * All inputs are canvas text — there is no external excerpt for a verifier to
 * check a claim against, so no spot-check runs; payload.verification names
 * the parser gate ("parser_verbatim_competitor_quotes") instead of faking one.
 */

export interface MonetizationGapCitation {
  /** One of the researched competitors' names verbatim — parser-enforced. */
  competitor: string;
  /** Verbatim substring of that competitor's revenue_streams canvas item text — parser-enforced. */
  evidence_quote: string;
}

export interface MonetizationGapRow {
  /** The monetization model we are missing (e.g. "usage-based pricing"). */
  model: string;
  competitors: MonetizationGapCitation[];
  adoption_rationale: string;
  first_experiment: string;
}

export interface MonetizationGapsArtifact {
  bodyMd: string;
  gaps: MonetizationGapRow[];
}

export const runMonetizationGaps: SkillRun = async (toolkit, job, scope) => {
  const ownRevenue = await toolkit.loadOwnSectionItems(job.account_id, "revenue_streams", scope);
  if (ownRevenue.length === 0) throw new Error("monetization_gaps requires our Revenue Streams canvas items first");
  const competitorRevenue = await toolkit.loadCompetitorSectionItems(job.account_id, "revenue_streams", scope);
  if (competitorRevenue.length === 0) throw new Error("monetization_gaps requires at least one researched competitor first");

  const competitorNames = toolkit.unique(
    competitorRevenue.map((item) => item.competitorName ?? "").filter((name) => name.length > 0),
  );

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const modelResult = await toolkit.runModel(
    `monetization_gaps artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: monetizationGapsPrompt(ownRevenue, competitorRevenue, competitorNames),
      systemPrompt:
        "You find monetization models competitors run that we do not, strictly from the provided canvas items. Every citation's evidence_quote must be copied VERBATIM from the named competitor's items — never cite from memory. When there is no genuine gap, return an empty gaps array. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseMonetizationGapsArtifact(
    modelResult.resultText,
    competitorRevenue.map((item) => ({ competitor: item.competitorName ?? "", text: item.text })),
  );
  if (!artifact) throw new Error("monetization_gaps produced unparseable output; refusing to write an artifact");

  const citedCompetitors = toolkit.unique(
    artifact.gaps.flatMap((gap) => gap.competitors.map((citation) => citation.competitor)),
  );
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "yield.monetization_gaps",
    agentKey: "agent_revenue_streams",
    title: `Monetization gaps — ${artifact.gaps.length} missed model${artifact.gaps.length === 1 ? "" : "s"}, ${citedCompetitors.length} competitor${citedCompetitors.length === 1 ? "" : "s"} cited`,
    bodyMd: artifact.bodyMd,
    payload: { gaps: artifact.gaps, verification: "parser_verbatim_competitor_quotes" },
    // The evidence behind every gap is the competitor canvas items the quotes
    // were checked against — link their ledger ids, deduped.
    evidenceIds: toolkit.unique(competitorRevenue.flatMap((item) => item.evidenceIds)),
    inputs: { sections: ["revenue_streams"], competitor_items: competitorRevenue.length },
  });
  await toolkit.markRunCompleted(job, "Monetization gaps completed", {
    skill_key: "yield.monetization_gaps",
    gaps: artifact.gaps.length,
    competitors_cited: citedCompetitors.length,
  });
};

export function monetizationGapsPrompt(
  ownRevenue: CanvasItemSource[],
  competitorRevenue: CanvasItemSource[],
  competitorNames: string[],
): string {
  return `Compare our Revenue Streams against the competitor Revenue Streams below and list every monetization model a competitor runs that WE do not — ranked most-promising first (highest expected revenue impact for the least adoption effort at the top).
Rules for each gap:
- "model": a short name for the missed monetization model.
- "competitors": every competitor whose items show them running it. "competitor" must be exactly one of: ${competitorNames.join(", ")}. "evidence_quote" must be copied VERBATIM, character for character, from that competitor's items below — never paraphrase, never cite from memory.
- "adoption_rationale": one or two sentences on why adopting this model fits our business, grounded in the items shown.
- "first_experiment": one concrete, imperative first experiment to test the model cheaply.
- Only genuine gaps: skip any model our own items already describe. If competitors run nothing we do not, return an empty gaps array and say so in body_md.
Return JSON only:
{"gaps":[{"model":"usage-based pricing","competitors":[{"competitor":"...","evidence_quote":"verbatim phrase from that competitor's items"}],"adoption_rationale":"why this fits us","first_experiment":"one imperative sentence"}],"body_md":"## Monetization gaps\\n..."}

Our Revenue Streams items:
${formatOwnItems(ownRevenue)}

Competitor Revenue Streams items:
${formatCompetitorItems(competitorRevenue)}`;
}

/**
 * Parse-or-null. Any invented row rejects the WHOLE parse — a gap citing an
 * unresearched competitor, a quote that is not a verbatim substring of that
 * named competitor's items, a citation-free gap, or a missing field would
 * ship an ungrounded revenue claim to the owner, and its narrative would
 * survive in body_md even if the row were silently dropped. Zero gaps is a
 * legitimate honest outcome (monetization parity), so an empty gaps array
 * with a body_md still parses.
 */
export function parseMonetizationGapsArtifact(
  text: string,
  competitorItems: Array<{ competitor: string; text: string }>,
): MonetizationGapsArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const knownCompetitors = new Set(competitorItems.map((item) => item.competitor));
  if (!Array.isArray(parsed.gaps)) return null;
  const gaps: MonetizationGapRow[] = [];
  const seenModels = new Set<string>();
  for (const entry of parsed.gaps) {
    const row = asRecord(entry);
    const model = readString(row.model);
    const adoptionRationale = readString(row.adoption_rationale);
    const firstExperiment = readString(row.first_experiment);
    if (!model || !adoptionRationale || !firstExperiment) return null;
    // A gap with zero citations is an uncited claim about the market.
    if (!Array.isArray(row.competitors) || row.competitors.length === 0) return null;
    const citations: MonetizationGapCitation[] = [];
    for (const citationEntry of row.competitors) {
      const citation = asRecord(citationEntry);
      const competitor = readString(citation.competitor);
      const evidenceQuote = readString(citation.evidence_quote);
      if (!competitor || !evidenceQuote || !knownCompetitors.has(competitor)) return null;
      // The quote must live VERBATIM in the NAMED competitor's own items —
      // a quote borrowed from another competitor's row is still invented.
      const grounded = competitorItems.some(
        (item) => item.competitor === competitor && item.text.includes(evidenceQuote),
      );
      if (!grounded) return null;
      citations.push({ competitor, evidence_quote: evidenceQuote });
    }
    // A repeated model is sloppiness, not invention — keep the first
    // (highest-ranked) occurrence rather than nulling the run.
    const modelKey = model.toLowerCase();
    if (seenModels.has(modelKey)) continue;
    seenModels.add(modelKey);
    gaps.push({ model, competitors: citations, adoption_rationale: adoptionRationale, first_experiment: firstExperiment });
  }
  const bodyMd = readString(parsed.body_md);
  if (!bodyMd) return null;
  return { bodyMd, gaps };
}

function formatOwnItems(items: CanvasItemSource[]): string {
  return items.length > 0 ? items.map((item) => `- ${item.text}`).join("\n") : "- (none recorded)";
}

function formatCompetitorItems(items: CanvasItemSource[]): string {
  return items.length > 0
    ? items.map((item) => `- ${item.competitorName ? `${item.competitorName}: ` : ""}${item.text}`).join("\n")
    : "- (none recorded)";
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

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
