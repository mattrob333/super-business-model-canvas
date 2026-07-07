import { asRecord } from "../../db/json.js";
import type { CanvasItemSource, SkillRun } from "./toolkit.js";

/**
 * relay.watering_holes — where the ICP already congregates, for the Channels
 * room: ranked communities/forums/events ("watering holes") with a concrete,
 * norm-respecting entry strategy per hole. The map is grounded in live
 * community evidence (Grok search over the segments' hangouts), never in the
 * model's own market knowledge — every hole must quote one of the retrieved
 * excerpts verbatim AND name one of our Customer Segments items verbatim
 * (parser-enforced; one ungrounded hole rejects the whole parse), and the top
 * holes are verifier-spot-checked against the excerpt that contains their
 * quote. Our current Channels items ride along as optional context so the map
 * finds holes beyond the channels the canvas already works.
 */

export interface WateringHoleRow {
  /** 1 = best first move; assigned from the model's ranked order. */
  rank: number;
  name: string;
  /** Verbatim one of our Customer Segments items — parser-enforced. */
  segment: string;
  /** Verbatim substring of one of the retrieved excerpts — parser-enforced. */
  evidence_quote: string;
  /** One concrete first move that respects the community's norms. */
  entry_strategy: string;
}

export interface WateringHolesArtifact {
  bodyMd: string;
  holes: WateringHoleRow[];
}

export const runWateringHoles: SkillRun = async (toolkit, job, scope) => {
  // The feed cache key and evidence titles hang off the analyzed company —
  // without one there is no company-scoped cache era to search into.
  if (!scope.companyName) throw new Error("watering_holes requires an analyzed company first");
  const companyName = scope.companyName;

  // Required: the segments ARE the search — no ICP, no watering holes.
  const segments = await toolkit.loadOwnSectionItems(job.account_id, "customer_segments", scope);
  if (segments.length === 0) throw new Error("watering_holes requires Customer Segments canvas items first");

  // Optional context: existing Channels items keep the map from proposing
  // holes the canvas already works as channels.
  const channels = await toolkit.loadOwnSectionItems(job.account_id, "channels", scope);

  const segmentDescriptions = segments.map((item) => item.text).join("; ");
  const feed = await toolkit.refreshFeed({
    accountId: job.account_id,
    feedKey: "grok_live_search",
    // Company-scoped: without the company slug, re-analyzing to a different
    // company within the feed TTL would serve the previous company's cached
    // community excerpts (cross-company contamination).
    cacheKey: `watering_holes:${job.account_id}:${slug(companyName)}`,
    companyName,
    query: `${toolkit.truncateText(segmentDescriptions, 400)} online communities forums events where they discuss`,
  });
  const sources = feed.health === "ok"
    ? feed.evidence.filter((entry) => Boolean(entry.excerpt?.trim())).slice(0, 6)
    : [];
  if (sources.length === 0) {
    throw new Error("watering_holes could not retrieve community evidence — check the Grok search feed");
  }

  // Every excerpt that feeds the prompt lands on the evidence ledger first —
  // the artifact's evidence_ids must point at what the model actually saw.
  const evidenceIds: string[] = [];
  for (const source of sources) {
    evidenceIds.push(await toolkit.writeEvidence(job, {
      title: `${companyName} watering-hole source`,
      sourceUrl: source.sourceUrl ?? "grok_live_search",
      excerpt: source.excerpt ?? "",
    }));
  }
  const excerpts = sources.map((source) => source.excerpt ?? "");

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const verifyRoute = toolkit.requiredRoute(routes, job.account_id, "research_verify", "research_verify");
  const modelResult = await toolkit.runModel(
    `watering_holes artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: wateringHolesPrompt(companyName, excerpts, segments, channels),
      systemPrompt:
        "You map where customer segments congregate strictly from the provided community excerpts. Every hole's evidence_quote must appear verbatim in one of the excerpts and its segment must repeat one of our Customer Segments items exactly — never cite from memory. Entry strategies must respect community norms: give value first, never drive-by promote. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseWateringHolesArtifact(
    modelResult.resultText,
    excerpts,
    segments.map((item) => item.text),
  );
  if (!artifact) throw new Error("watering_holes produced unparseable output; refusing to write an artifact");

  // Verifier spot-check: each top hole against the excerpt that contains its
  // quote (the parser guarantees one exists).
  const checks = artifact.holes.slice(0, 4).map((hole) => ({
    claim: `${hole.name} is a watering hole for the segment "${hole.segment}" and a viable entry point: ${hole.entry_strategy}`,
    excerpt: excerpts.find((excerpt) => excerpt.includes(hole.evidence_quote)) ?? "",
  }));
  const checked = await toolkit.verifyArtifactClaims(job, verifyRoute, checks, "watering_holes");

  const segmentsServed = toolkit.unique(artifact.holes.map((hole) => hole.segment)).length;
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "relay.watering_holes",
    agentKey: "agent_channels",
    title: `Watering holes — ${artifact.holes.length} hole${artifact.holes.length === 1 ? "" : "s"} across ${segmentsServed} segment${segmentsServed === 1 ? "" : "s"}`,
    bodyMd: artifact.bodyMd,
    payload: {
      holes: artifact.holes,
      spot_check: checked,
    },
    evidenceIds: toolkit.unique(evidenceIds),
    inputs: {
      sections: ["customer_segments", "channels"],
      company: companyName,
      evidence_excerpts: excerpts.length,
    },
  });
  await toolkit.markRunCompleted(job, "Watering holes map completed", {
    skill_key: "relay.watering_holes",
    holes: artifact.holes.length,
    spot_check_confirmed: checked.confirmed,
  });
};

export function wateringHolesPrompt(
  companyName: string,
  excerpts: string[],
  segments: CanvasItemSource[],
  channels: CanvasItemSource[],
): string {
  return `Map the watering holes — the online communities, forums, and events — where ${companyName}'s customer segments already congregate, strictly from the community excerpts below:
- Order holes best-first: rank 1 has the highest concentration of the segment and the clearest path in for a newcomer.
- Each hole's "segment" must repeat one of our Customer Segments items EXACTLY, character for character.
- Each hole's "evidence_quote" must be a phrase copied VERBATIM from one of the excerpts. Skip any hole the excerpts do not name.
- "entry_strategy" is ONE concrete first move that respects that community's norms — give value before pitching, never drive-by promote.
Return JSON only:
{"holes":[{"name":"community/forum/event name","segment":"<verbatim one of our Customer Segments items>","evidence_quote":"verbatim phrase from an excerpt","entry_strategy":"one concrete norm-respecting first move"}],"body_md":"## Watering holes\\n..."}

Our Customer Segments (each hole serves exactly one of these, verbatim):
${formatOwnItems(segments)}

Our Channels (context only — find holes beyond these):
${formatOwnItems(channels)}

Community excerpts:
${excerpts.map((excerpt, index) => `[${index}] ${excerpt.slice(0, 2500)}`).join("\n\n")}`;
}

/**
 * Parse-or-throw gate. Every hole must (a) name one of OUR Customer Segments
 * items verbatim and (b) quote one of the retrieved excerpts verbatim. One
 * ungrounded hole rejects the WHOLE parse: silently dropping it would still
 * leave its narrative in body_md, shipping an invented community to the owner
 * under a label that implies grounding. Ranks come from the model's order.
 */
export function parseWateringHolesArtifact(
  text: string,
  excerpts: string[],
  allowedSegments: string[],
): WateringHolesArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const allowed = new Set(allowedSegments);
  if (!Array.isArray(parsed.holes)) return null;
  const holes: WateringHoleRow[] = [];
  for (const entry of parsed.holes) {
    const row = asRecord(entry);
    const name = readString(row.name);
    const segment = readString(row.segment);
    const evidenceQuote = readString(row.evidence_quote);
    const entryStrategy = readString(row.entry_strategy);
    if (!name || !segment || !evidenceQuote || !entryStrategy) return null;
    // The segment must be OUR canvas item, character for character — a
    // paraphrased or invented segment is an ungrounded row.
    if (!allowed.has(segment)) return null;
    // The quote must live in one of the excerpts the model was shown — a
    // hole cited from the model's memory rejects the whole parse.
    if (!excerpts.some((excerpt) => excerpt.includes(evidenceQuote))) return null;
    holes.push({
      rank: holes.length + 1,
      name,
      segment,
      evidence_quote: evidenceQuote,
      entry_strategy: entryStrategy,
    });
  }
  const bodyMd = readString(parsed.body_md);
  return holes.length > 0 && bodyMd ? { bodyMd, holes } : null;
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
