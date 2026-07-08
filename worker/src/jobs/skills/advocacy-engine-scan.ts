import { asRecord } from "../../db/json.js";
import type { SkillRun } from "./toolkit.js";

/**
 * anchor.advocacy_engine_scan — how competitors manufacture advocates, for
 * the Customer Relationships room: the referral programs, champion
 * communities, and customer-story flywheels each researched competitor runs,
 * plus an equivalent move sized for what the analyzed company can actually
 * execute at its current scale. Every mechanism is grounded in one of two
 * sources and LABELED with which: "live_search" mechanisms must quote a
 * retrieved excerpt verbatim, "competitor_canvas" mechanisms must repeat one
 * of that competitor's Customer Relationships canvas items exactly
 * (parser-enforced; one ungrounded or invented mechanism rejects the whole
 * parse). Up to four externally-evidenced mechanisms are verifier
 * spot-checked against the excerpt that contains their quote; canvas-grounded
 * mechanisms have no external excerpt to check, so when none cite the live
 * search the spot-check honestly reports zero checks instead of faking a
 * verifier pass.
 */

export type AdvocacyEvidenceSource = "live_search" | "competitor_canvas";

const ADVOCACY_EVIDENCE_SOURCES = new Set<string>(["live_search", "competitor_canvas"]);

export interface AdvocacyMechanism {
  /** One of the researched competitors — parser-enforced. */
  competitor: string;
  /** The advocacy engine the competitor runs (referral program, champions community, ...). */
  mechanism: string;
  /** Which ground truth the quote comes from — labeled, never blended. */
  source: AdvocacyEvidenceSource;
  /**
   * Verbatim substring of one of the retrieved excerpts ("live_search") OR a
   * verbatim competitor canvas item text ("competitor_canvas") — parser-enforced.
   */
  evidence_quote: string;
  /** The equivalent play sized for the analyzed company's current scale. */
  equivalent_move: string;
}

export interface AdvocacyEngineScanArtifact {
  bodyMd: string;
  mechanisms: AdvocacyMechanism[];
}

/** A competitor canvas item flattened to what the parser must match exactly. */
export interface CompetitorCanvasQuote {
  competitor: string;
  text: string;
}

export const runAdvocacyEngineScan: SkillRun = async (toolkit, job, scope) => {
  // The equivalent moves are sized for the analyzed company — without one
  // there is no scale to size for and no company to scope the feed cache to.
  if (!scope.companyName) throw new Error("advocacy_engine_scan requires an analyzed company first");
  const companyName = scope.companyName;

  // The scan is a read of the competition's advocacy engines — without
  // researched competitors there is nothing to scan.
  const competitors = await toolkit.loadCompetitors(job.account_id, scope);
  if (competitors.length === 0) throw new Error("advocacy_engine_scan requires at least one researched competitor first");
  const competitorNames = toolkit.unique(competitors.map((competitor) => competitor.name).filter(Boolean));

  // Competitor Customer Relationships items are the second ground truth: a
  // mechanism may cite one verbatim instead of a live excerpt. Their absence
  // must not block the scan — the live search can carry it alone.
  const competitorRelationships = await toolkit.loadCompetitorSectionItems(job.account_id, "customer_relationships", scope);
  const competitorQuotes: CompetitorCanvasQuote[] = competitorRelationships
    .filter((item) => Boolean(item.competitorName))
    .map((item) => ({ competitor: item.competitorName as string, text: item.text }));

  const feed = await toolkit.refreshFeed({
    accountId: job.account_id,
    feedKey: "web_search",
    // Company-scoped: without the company slug, re-analyzing to a different
    // company within the feed TTL would serve the previous company's cached
    // advocacy excerpts (cross-company contamination).
    cacheKey: `advocacy_engine_scan:${job.account_id}:${slug(companyName)}`,
    companyName,
    query: `${competitorNames.join(" and ")} referral program community advocates champions customer stories`,
  });
  const sources = feed.health === "ok"
    ? feed.evidence.filter((entry) => Boolean(entry.excerpt?.trim())).slice(0, 6)
    : [];
  if (sources.length === 0) {
    throw new Error("advocacy_engine_scan could not retrieve advocacy evidence — check the web search feed");
  }

  // Every excerpt that feeds the prompt lands on the evidence ledger first —
  // the artifact's evidence_ids must point at what the model actually saw.
  const evidenceIds: string[] = [];
  for (const source of sources) {
    evidenceIds.push(await toolkit.writeEvidence(job, {
      title: `${companyName} advocacy engine source`,
      sourceUrl: source.sourceUrl ?? "web_search",
      excerpt: source.excerpt ?? "",
    }));
  }
  const excerpts = sources.map((source) => source.excerpt ?? "");

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const verifyRoute = toolkit.requiredRoute(routes, job.account_id, "research_verify", "research_verify");
  const modelResult = await toolkit.runModel(
    `advocacy_engine_scan artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: advocacyEngineScanPrompt(companyName, competitorNames, excerpts, competitorQuotes),
      systemPrompt:
        "You catalog competitor advocacy mechanisms strictly from the provided excerpts and competitor canvas items. Every mechanism's evidence_quote must appear verbatim in its labeled source — never cite programs from memory. Equivalent moves must fit the analyzed company's scale, not enterprise budgets. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseAdvocacyEngineScanArtifact(modelResult.resultText, excerpts, competitorQuotes, competitorNames);
  if (!artifact) throw new Error("advocacy_engine_scan produced unparseable output; refusing to write an artifact");

  // Verifier spot-check: only mechanisms that cite a LIVE excerpt have an
  // external ground truth to check against (the parser guarantees the quote's
  // excerpt exists). Canvas-grounded mechanisms are already parser-verified
  // verbatim — when nothing cites the live search, report zero checks
  // honestly instead of faking a verifier pass.
  const checks = artifact.mechanisms
    .filter((mechanism) => mechanism.source === "live_search")
    .slice(0, 4)
    .map((mechanism) => ({
      claim: `${mechanism.competitor} manufactures advocates via: ${mechanism.mechanism}`,
      excerpt: excerpts.find((excerpt) => excerpt.includes(mechanism.evidence_quote)) ?? "",
    }));
  const checked = checks.length > 0
    ? await toolkit.verifyArtifactClaims(job, verifyRoute, checks, "advocacy_engine_scan")
    : { checked: 0, confirmed: 0 };

  const liveEvidenced = artifact.mechanisms.filter((mechanism) => mechanism.source === "live_search").length;
  const canvasGrounded = artifact.mechanisms.length - liveEvidenced;
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "anchor.advocacy_engine_scan",
    agentKey: "agent_customer_relationships",
    title: `Advocacy engine scan — ${artifact.mechanisms.length} competitor mechanism${artifact.mechanisms.length === 1 ? "" : "s"} (${liveEvidenced} live-evidenced, ${canvasGrounded} canvas-grounded)`,
    bodyMd: artifact.bodyMd,
    payload: {
      mechanisms: artifact.mechanisms,
      live_evidenced: liveEvidenced,
      canvas_grounded: canvasGrounded,
      spot_check: checked,
    },
    // The model saw both ground truths: the ledgered excerpts AND the
    // competitor canvas items — the artifact's evidence must cover both.
    evidenceIds: toolkit.unique([
      ...evidenceIds,
      ...competitorRelationships.flatMap((item) => item.evidenceIds),
    ]),
    inputs: {
      sections: ["customer_relationships"],
      company: companyName,
      competitors: competitorNames,
      competitor_items: competitorQuotes.length,
      evidence_excerpts: excerpts.length,
    },
  });
  await toolkit.markRunCompleted(job, "Advocacy engine scan completed", {
    skill_key: "anchor.advocacy_engine_scan",
    mechanisms: artifact.mechanisms.length,
    live_evidenced: liveEvidenced,
    canvas_grounded: canvasGrounded,
    spot_check_confirmed: checked.confirmed,
  });
};

export function advocacyEngineScanPrompt(
  companyName: string,
  competitorNames: string[],
  excerpts: string[],
  competitorQuotes: CompetitorCanvasQuote[],
): string {
  return `Catalog how ${companyName}'s competitors manufacture customer advocates, using ONLY the two sources below:
- Each mechanism names ONE concrete advocacy engine a competitor runs (referral program, champions community, customer-story flywheel, user conference, reference program, ...).
- "competitor" is exactly one of: ${competitorNames.join(", ")}.
- "source" is exactly "live_search" when the mechanism is evidenced by a live excerpt, or "competitor_canvas" when it is evidenced by a competitor canvas item. Never blend the two.
- For source "live_search", "evidence_quote" must be a phrase copied VERBATIM from one of the excerpts.
- For source "competitor_canvas", "evidence_quote" must repeat one of that competitor's canvas items EXACTLY, character for character.
- "equivalent_move" is ONE concrete advocacy play ${companyName} should run to match the mechanism, sized for its current scale — not a copy of an enterprise-budget program.
- Skip any mechanism neither source evidences.
Return JSON only:
{"mechanisms":[{"competitor":"...","mechanism":"how they manufacture advocates","source":"live_search|competitor_canvas","evidence_quote":"verbatim phrase from an excerpt OR a verbatim competitor canvas item","equivalent_move":"one play sized for ${companyName}"}],"body_md":"## Advocacy engine scan\\n..."}

Competitor Customer Relationships canvas items:
${formatCompetitorQuotes(competitorQuotes)}

Live excerpts:
${excerpts.map((excerpt, index) => `[${index}] ${excerpt.slice(0, 2500)}`).join("\n\n")}`;
}

export function parseAdvocacyEngineScanArtifact(
  text: string,
  excerpts: string[],
  competitorQuotes: CompetitorCanvasQuote[],
  competitorNames: string[],
): AdvocacyEngineScanArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  if (!Array.isArray(parsed.mechanisms)) return null;
  const knownCompetitors = new Set(competitorNames);
  const mechanisms: AdvocacyMechanism[] = [];
  for (const entry of parsed.mechanisms) {
    const row = asRecord(entry);
    const competitor = readString(row.competitor);
    const mechanism = readString(row.mechanism);
    const source = readString(row.source);
    const evidenceQuote = readString(row.evidence_quote);
    const equivalentMove = readString(row.equivalent_move);
    // One ungrounded or invented mechanism rejects the WHOLE parse: silently
    // dropping it would still ship its narrative in body_md under a label
    // that implies every mechanism is evidence-grounded.
    if (!competitor || !mechanism || !evidenceQuote || !equivalentMove) return null;
    if (!source || !ADVOCACY_EVIDENCE_SOURCES.has(source)) return null;
    // A mechanism attributed to a competitor we never researched is invented.
    if (!knownCompetitors.has(competitor)) return null;
    if (source === "live_search") {
      // The quote must live in one of the excerpts the model was shown — a
      // program cited from the model's memory is refused, not shipped.
      if (!excerpts.some((excerpt) => excerpt.includes(evidenceQuote))) return null;
    } else {
      // The quote must be one of THAT competitor's canvas items verbatim —
      // paraphrases and cross-competitor attributions are refused.
      if (!competitorQuotes.some((quote) => quote.competitor === competitor && quote.text === evidenceQuote)) return null;
    }
    mechanisms.push({
      competitor,
      mechanism,
      source: source as AdvocacyEvidenceSource,
      evidence_quote: evidenceQuote,
      equivalent_move: equivalentMove,
    });
  }
  const bodyMd = readString(parsed.body_md);
  return mechanisms.length > 0 && bodyMd ? { bodyMd, mechanisms } : null;
}

function formatCompetitorQuotes(quotes: CompetitorCanvasQuote[]): string {
  return quotes.length > 0
    ? quotes.map((quote) => `- ${quote.competitor}: ${quote.text}`).join("\n")
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

// Mirror of skill-run.ts's slug — feed cache keys must be stable per company.
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "company";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
