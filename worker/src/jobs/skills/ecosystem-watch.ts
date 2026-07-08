import { asRecord } from "../../db/json.js";
import type { CanvasItemSource, SkillRun } from "./toolkit.js";

/**
 * envoy.ecosystem_watch — the Key Partners room's competitor-ecosystem radar:
 * watch for competitor partnership announcements (integrations, alliances,
 * channel deals) and turn each observed move into a counter-partner
 * suggestion for us. The moves are grounded in live evidence (web search
 * over the researched competitors' partnership announcements), never in the
 * model's own market knowledge — every move must name one of OUR researched
 * competitors exactly and quote one of the retrieved excerpts verbatim
 * (parser-enforced; one invented move rejects the whole parse, because the
 * body_md narrative would still ship it), and the top moves are
 * verifier-spot-checked against the excerpt that contains their quote. Our
 * current Key Partners items ride along as optional context so counter
 * suggestions extend the canvas instead of re-listing it.
 */

export interface EcosystemMove {
  /** Exactly one of our researched competitors — parser-enforced. */
  competitor: string;
  /** Who the competitor partnered/integrated/allied with. */
  partner: string;
  move_summary: string;
  /** Verbatim substring of one of the retrieved excerpts — parser-enforced. */
  evidence_quote: string;
  counter_partner: string;
  counter_rationale: string;
}

export interface EcosystemWatchArtifact {
  bodyMd: string;
  moves: EcosystemMove[];
}

export const runEcosystemWatch: SkillRun = async (toolkit, job, scope) => {
  // The watch is defined by who we are up against — without researched
  // competitors there are no partnership moves to observe or counter.
  const competitors = await toolkit.loadCompetitors(job.account_id, scope);
  if (competitors.length === 0) throw new Error("ecosystem_watch requires at least one researched competitor first");
  const competitorNames = toolkit.unique(competitors.map((competitor) => competitor.name));

  // Optional context: existing Key Partners items keep counter suggestions
  // from recommending partners the canvas already has.
  const ownPartners = await toolkit.loadOwnSectionItems(job.account_id, "key_partners", scope);

  const companyName = scope.companyName ?? "";
  const feed = await toolkit.refreshFeed({
    accountId: job.account_id,
    feedKey: "web_search",
    // Company-scoped: without the company slug, re-analyzing to a different
    // company within the feed TTL would serve the previous company's cached
    // competitor-partnership excerpts (cross-company contamination).
    cacheKey: `ecosystem_watch:${job.account_id}:${slug(companyName)}`,
    companyName,
    query: `${competitorNames.join(", ")} partnership announcement integration alliance`,
    // Partnership moves stay strategically relevant a bit longer than
    // launches, but a years-old alliance is not an "observed move".
    recencyDays: 180,
    searchCategory: "news",
  });
  const sources = feed.health === "ok"
    ? feed.evidence.filter((entry) => Boolean(entry.excerpt?.trim())).slice(0, 6)
    : [];
  if (sources.length === 0) {
    throw new Error("ecosystem_watch could not retrieve competitor partnership evidence — check the web search feed");
  }

  // Every excerpt that feeds the prompt lands on the evidence ledger first —
  // the artifact's evidence_ids must point at what the model actually saw.
  const evidenceIds: string[] = [];
  for (const source of sources) {
    evidenceIds.push(await toolkit.writeEvidence(job, {
      title: `${companyName || "ecosystem watch"} competitor partnership source`,
      sourceUrl: source.sourceUrl ?? "web_search",
      excerpt: source.excerpt ?? "",
    }));
  }
  const excerpts = sources.map((source) => source.excerpt ?? "");

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const verifyRoute = toolkit.requiredRoute(routes, job.account_id, "research_verify", "research_verify");
  const modelResult = await toolkit.runModel(
    `ecosystem_watch artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: ecosystemWatchPrompt(competitorNames, excerpts, ownPartners),
      systemPrompt:
        "You track competitor partnership moves strictly from the provided excerpts. Every move's evidence_quote must appear verbatim in one of the excerpts and its competitor must be one of the listed competitors — never report from memory. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseEcosystemWatchArtifact(modelResult.resultText, excerpts, competitorNames);
  if (!artifact) throw new Error("ecosystem_watch produced unparseable output; refusing to write an artifact");

  // Verifier spot-check (<=4): each observed move against the excerpt that
  // contains its quote (the parser guarantees one exists). Only the OBSERVED
  // move is checked — the counter-partner suggestion is our inference, not a
  // fact the excerpt states, so putting it in the claim would be a fake gate.
  const checks = artifact.moves.slice(0, 4).map((move) => ({
    claim: `${move.competitor} made a partnership move with ${move.partner}: ${move.move_summary}`,
    excerpt: excerpts.find((excerpt) => excerpt.includes(move.evidence_quote)) ?? "",
  }));
  const checked = await toolkit.verifyArtifactClaims(job, verifyRoute, checks, "ecosystem_watch");

  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "envoy.ecosystem_watch",
    agentKey: "agent_key_partnerships",
    title: `Ecosystem watch — ${artifact.moves.length} competitor partnership move${artifact.moves.length === 1 ? "" : "s"}`,
    bodyMd: artifact.bodyMd,
    payload: {
      moves: artifact.moves,
      spot_check: checked,
    },
    evidenceIds: toolkit.unique(evidenceIds),
    inputs: {
      sections: ["key_partners"],
      company: companyName,
      competitors: competitorNames,
      evidence_excerpts: excerpts.length,
    },
  });
  await toolkit.markRunCompleted(job, "Ecosystem watch completed", {
    skill_key: "envoy.ecosystem_watch",
    moves: artifact.moves.length,
    spot_check_confirmed: checked.confirmed,
  });
};

export function ecosystemWatchPrompt(
  competitorNames: string[],
  excerpts: string[],
  ownPartners: CanvasItemSource[],
): string {
  return `Watch the competitor ecosystem strictly from the excerpts below. For each partnership move a competitor has made (integration, alliance, channel or distribution deal) report:
- "competitor": EXACTLY one of our researched competitors: ${competitorNames.join(", ")}.
- "partner": who they partnered, integrated, or allied with, as the excerpt names them.
- "move_summary": one sentence on what the move is and why it matters.
- "evidence_quote": a phrase copied VERBATIM from one of the excerpts that reports the move.
- "counter_partner": a concrete counter-partner suggestion for us, grounded in what the excerpt says the move covers (the same layer, an alternative provider, or the flank the move leaves open).
- "counter_rationale": one sentence tying the suggestion to the excerpt's content.
Skip anything the excerpts do not report — no moves from memory.
Return JSON only:
{"moves":[{"competitor":"...","partner":"...","move_summary":"...","evidence_quote":"verbatim phrase from an excerpt","counter_partner":"...","counter_rationale":"..."}],"body_md":"## Ecosystem watch\\n..."}

Our current Key Partners (context only — suggest counter-partners beyond these):
${formatOwnItems(ownPartners)}

Competitor partnership excerpts:
${excerpts.map((excerpt, index) => `[${index}] ${excerpt.slice(0, 2500)}`).join("\n\n")}`;
}

/**
 * Parse-or-null. Every move must (a) name one of OUR researched competitors
 * exactly and (b) carry an evidence_quote that is a verbatim substring of an
 * excerpt the model was shown. ONE ungrounded/invented move rejects the
 * whole parse: silently dropping it from the payload would still leave its
 * narrative in body_md, shipping the invented move to the owner under a
 * label that implies grounding.
 */
export function parseEcosystemWatchArtifact(
  text: string,
  excerpts: string[],
  competitorNames: string[],
): EcosystemWatchArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const allowedCompetitors = new Set(competitorNames);
  if (!Array.isArray(parsed.moves)) return null;
  const moves: EcosystemMove[] = [];
  for (const entry of parsed.moves) {
    const row = asRecord(entry);
    const competitor = readString(row.competitor);
    const partner = readString(row.partner);
    const moveSummary = readString(row.move_summary);
    const evidenceQuote = readString(row.evidence_quote);
    const counterPartner = readString(row.counter_partner);
    const counterRationale = readString(row.counter_rationale);
    if (!competitor || !partner || !moveSummary || !evidenceQuote || !counterPartner || !counterRationale) return null;
    // A move attributed to a company we never researched is an invention.
    if (!allowedCompetitors.has(competitor)) return null;
    // The quote must live in one of the excerpts the model was shown — a
    // move cited from the model's memory rejects the parse, not just the row.
    if (!excerpts.some((excerpt) => excerpt.includes(evidenceQuote))) return null;
    moves.push({
      competitor,
      partner,
      move_summary: moveSummary,
      evidence_quote: evidenceQuote,
      counter_partner: counterPartner,
      counter_rationale: counterRationale,
    });
  }
  const bodyMd = readString(parsed.body_md);
  if (moves.length === 0 || !bodyMd) return null;
  return { bodyMd, moves };
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

// Mirror of skill-run.ts's slug — feed cache keys must be stable per company.
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "company";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
