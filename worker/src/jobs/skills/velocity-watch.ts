import { asRecord } from "../../db/json.js";
import type { CanvasItemSource, SkillRun } from "./toolkit.js";

/**
 * tempo.velocity_watch — the Key Activities room's ship-velocity radar: what
 * the researched competitors have shipped recently (launches, changelog
 * entries, release announcements) turned into a they-are-outshipping-you
 * read. Every competitor comes back exactly once: either the excerpts show
 * recent shipping — grounded in live evidence (web search over the
 * competitors' launch and changelog signals), never in the model's own
 * market knowledge, with the competitor named EXACTLY from our researched
 * list and every observation carrying an evidence_quote copied VERBATIM
 * from a retrieved excerpt (all parser-enforced; one invented observation
 * rejects the whole parse, because the body_md narrative would still ship
 * it) — or the read honestly says the evidence is too thin instead of
 * guessing a pace. The overall velocity insight obeys the same honesty
 * gate: with zero grounded shipping observations it must declare its basis
 * "evidence_too_thin" — it cannot claim a velocity delta nobody observed.
 * Grounded observations are verifier-spot-checked (<=4) against the excerpt
 * that contains their quote; an all-thin watch has nothing external to
 * check and honestly reports zero checks. Our own Key Activities items ride
 * along as optional context so the pace read lands against what we actually
 * spend our cycles on.
 */

export type VelocityReadKind = "shipping_observed" | "evidence_thin";

export type InsightBasis = "evidence_delta" | "evidence_too_thin";

export interface VelocityObservation {
  /** What the competitor shipped, as the excerpt reports it. */
  what_shipped: string;
  /** Verbatim substring of one of the retrieved excerpts — parser-enforced. */
  evidence_quote: string;
}

export interface CompetitorVelocityRead {
  /** Exactly one of our researched competitors — parser-enforced. */
  competitor: string;
  read: VelocityReadKind;
  /** >=1 grounded observations when shipping_observed; empty when evidence_thin. */
  observations: VelocityObservation[];
  /** One-sentence pace read — or the honest too-thin note. */
  pace_read: string;
}

export interface VelocityWatchArtifact {
  bodyMd: string;
  reads: CompetitorVelocityRead[];
  velocity_insight: string;
  insight_basis: InsightBasis;
}

export const runVelocityWatch: SkillRun = async (toolkit, job, scope) => {
  // The watch is defined by who we are up against — without researched
  // competitors there is no ship velocity to compare ourselves to.
  const competitors = await toolkit.loadCompetitors(job.account_id, scope);
  if (competitors.length === 0) throw new Error("velocity_watch requires at least one researched competitor first");
  const competitorNames = toolkit.unique(competitors.map((competitor) => competitor.name));

  // Optional context: our own Key Activities anchor what "outshipping us"
  // means — their absence must not block the watch.
  const ownActivities = await toolkit.loadOwnSectionItems(job.account_id, "key_activities", scope);

  const companyName = scope.companyName ?? "";
  const feed = await toolkit.refreshFeed({
    accountId: job.account_id,
    feedKey: "web_search",
    // Cache-key identity must cover everything the query depends on: the
    // company slug (re-analyzing to a different company within the feed TTL
    // must not serve the previous company's cached excerpts) AND the
    // competitor roster (adding NewCo then re-running within the TTL must
    // not serve excerpts from a query that never mentioned NewCo — the
    // artifact would then claim NewCo was watched and found quiet when no
    // search for it was ever performed).
    cacheKey: `velocity_watch:${job.account_id}:${slug(companyName)}:${competitorNames.map(slug).sort().join("+")}`,
    companyName,
    query: `${competitorNames.join(", ")} product launch changelog release announcement recent`,
  });
  const sources = feed.health === "ok"
    ? feed.evidence.filter((entry) => Boolean(entry.excerpt?.trim())).slice(0, 6)
    : [];
  if (sources.length === 0) {
    throw new Error("velocity_watch could not retrieve competitor launch evidence — check the web search feed");
  }

  // Every excerpt that feeds the prompt lands on the evidence ledger first —
  // the artifact's evidence_ids must point at what the model actually saw.
  const evidenceIds: string[] = [];
  for (const source of sources) {
    evidenceIds.push(await toolkit.writeEvidence(job, {
      title: `${companyName || "velocity watch"} competitor launch source`,
      sourceUrl: source.sourceUrl ?? "web_search",
      excerpt: source.excerpt ?? "",
    }));
  }
  const excerpts = sources.map((source) => source.excerpt ?? "");

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const verifyRoute = toolkit.requiredRoute(routes, job.account_id, "research_verify", "research_verify");
  const modelResult = await toolkit.runModel(
    `velocity_watch artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: velocityWatchPrompt(competitorNames, excerpts, ownActivities),
      systemPrompt:
        "You read competitor ship velocity strictly from the provided excerpts. Every observation's evidence_quote must appear verbatim in one of the excerpts and its competitor must be one of the listed competitors — a competitor the excerpts say nothing about is honestly 'evidence_thin', never a pace guessed from memory. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseVelocityWatchArtifact(modelResult.resultText, excerpts, competitorNames);
  if (!artifact) throw new Error("velocity_watch produced unparseable output; refusing to write an artifact");

  // Verifier spot-check (<=4): ONLY grounded observations have an excerpt to
  // check against (the parser guarantees one contains each quote). An
  // evidence_thin read claims an absence — there is nothing external to
  // verify, so an all-thin watch honestly reports zero checks instead of
  // faking a verifier pass.
  const checks = artifact.reads
    .filter((read) => read.read === "shipping_observed")
    .flatMap((read) => read.observations.map((observation) => ({
      claim: `${read.competitor} recently shipped: ${observation.what_shipped}`,
      excerpt: excerpts.find((excerpt) => excerpt.includes(observation.evidence_quote)) ?? "",
    })))
    .slice(0, 4);
  const checked = checks.length > 0
    ? await toolkit.verifyArtifactClaims(job, verifyRoute, checks, "velocity_watch")
    : { checked: 0, confirmed: 0 };

  const shippingReads = artifact.reads.filter((read) => read.read === "shipping_observed");
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "tempo.velocity_watch",
    agentKey: "agent_key_activities",
    title: `Velocity watch — ${shippingReads.length} of ${artifact.reads.length} competitors show recent shipping`,
    bodyMd: artifact.bodyMd,
    payload: {
      reads: artifact.reads,
      velocity_insight: artifact.velocity_insight,
      insight_basis: artifact.insight_basis,
      shipping_observed: shippingReads.length,
      evidence_thin: artifact.reads.length - shippingReads.length,
      spot_check: checked,
    },
    // The model saw the retrieved excerpts AND our own activities — the
    // ledger ids for both back the artifact.
    evidenceIds: toolkit.unique([...evidenceIds, ...ownActivities.flatMap((item) => item.evidenceIds)]),
    inputs: {
      sections: ["key_activities"],
      company: companyName,
      competitors: competitorNames,
      evidence_excerpts: excerpts.length,
    },
  });
  await toolkit.markRunCompleted(job, "Velocity watch completed", {
    skill_key: "tempo.velocity_watch",
    competitors: artifact.reads.length,
    shipping_observed: shippingReads.length,
    spot_check_confirmed: checked.confirmed,
  });
};

export function velocityWatchPrompt(
  competitorNames: string[],
  excerpts: string[],
  ownActivities: CanvasItemSource[],
): string {
  return `Read competitor ship velocity strictly from the excerpts below. Return one read per competitor — cover EVERY researched competitor, exactly once each:
- "competitor": EXACTLY one of our researched competitors: ${competitorNames.join(", ")}.
- "read": "shipping_observed" when the excerpts report something the competitor recently launched, released, or shipped; "evidence_thin" when the excerpts show nothing recent for them — say so honestly, never infer a pace from memory.
- For shipping_observed reads: "observations" is a non-empty list; each observation's "what_shipped" is one sentence on what they shipped and "evidence_quote" is a phrase copied VERBATIM from one of the excerpts that reports it.
- For evidence_thin reads: "observations" is an empty list.
- "pace_read": one sentence on their recent shipping pace relative to us (for evidence_thin, an honest note that the evidence is too thin to read a pace).
Then "velocity_insight": one overall they-are-outshipping-you (or not) insight across all competitors, with "insight_basis" set to "evidence_delta" ONLY when grounded observations actually support a delta — if the evidence is too thin for one, set it to "evidence_too_thin" and let the insight SAY the evidence is too thin instead of inventing a delta.
Return JSON only:
{"reads":[{"competitor":"...","read":"shipping_observed|evidence_thin","observations":[{"what_shipped":"...","evidence_quote":"verbatim phrase from an excerpt"}],"pace_read":"one sentence"}],"velocity_insight":"one overall insight","insight_basis":"evidence_delta|evidence_too_thin","body_md":"## Velocity watch\\n..."}

Our Key Activities (context only — what our own cycles go to):
${formatOwnItems(ownActivities)}

Competitor launch and changelog excerpts:
${excerpts.map((excerpt, index) => `[${index}] ${excerpt.slice(0, 2500)}`).join("\n\n")}`;
}

/**
 * Parse-or-null. Every read must name one of OUR researched competitors
 * exactly, every competitor must come back exactly once (a partial watch
 * would silently hide the competitor who might be outshipping us), and a
 * shipping_observed read must carry at least one observation whose
 * evidence_quote is a verbatim substring of an excerpt the model was shown.
 * ONE ungrounded/invented observation rejects the whole parse: silently
 * dropping it would still leave its narrative in body_md, shipping the
 * invented launch to the owner under a label that implies grounding. The
 * overall insight is gated the same way: with zero grounded observations
 * the basis must honestly be "evidence_too_thin" — a claimed evidence_delta
 * nobody observed is an invention.
 */
export function parseVelocityWatchArtifact(
  text: string,
  excerpts: string[],
  competitorNames: string[],
): VelocityWatchArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const allowedCompetitors = new Set(competitorNames);
  if (!Array.isArray(parsed.reads)) return null;
  const byCompetitor = new Map<string, CompetitorVelocityRead>();
  for (const entry of parsed.reads) {
    const row = asRecord(entry);
    const competitor = readString(row.competitor);
    const read = readString(row.read);
    const paceRead = readString(row.pace_read);
    if (!competitor || !paceRead) return null;
    // A read about a company we never researched is an invention.
    if (!allowedCompetitors.has(competitor)) return null;
    if (read !== "shipping_observed" && read !== "evidence_thin") return null;

    if (read === "shipping_observed") {
      // Grounding is validated for EVERY row, duplicates included, BEFORE
      // any keep-first skip: a duplicate row's invented observation still
      // narrates its launch in body_md, so skipping it unvalidated would
      // ship the invention under a label that implies grounding.
      if (!Array.isArray(row.observations) || row.observations.length === 0) return null;
      const observations: VelocityObservation[] = [];
      for (const observationEntry of row.observations) {
        const observation = asRecord(observationEntry);
        const whatShipped = readString(observation.what_shipped);
        const evidenceQuote = readString(observation.evidence_quote);
        // An observation without a quote the model was actually shown is an
        // invention — reject the parse, not just the observation.
        if (!whatShipped || !evidenceQuote) return null;
        if (!excerpts.some((excerpt) => excerpt.includes(evidenceQuote))) return null;
        observations.push({ what_shipped: whatShipped, evidence_quote: evidenceQuote });
      }
      // Only a fully validated duplicate may be dropped — it restates
      // grounded evidence; keep the first read, completeness is judged on
      // distinct competitors.
      if (!byCompetitor.has(competitor)) {
        byCompetitor.set(competitor, { competitor, read, observations, pace_read: paceRead });
      }
      continue;
    }
    // Evidence-thin claims nothing external — normalize any stray
    // observations to empty so the honest absence carries no half-grounded
    // decoration. Duplicates keep the first read.
    if (!byCompetitor.has(competitor)) {
      byCompetitor.set(competitor, { competitor, read, observations: [], pace_read: paceRead });
    }
  }
  // Every researched competitor must come back read — a partial watch would
  // silently hide the competitor who might be outshipping us.
  if (byCompetitor.size !== allowedCompetitors.size) return null;

  const velocityInsight = readString(parsed.velocity_insight);
  const insightBasis = readString(parsed.insight_basis);
  const bodyMd = readString(parsed.body_md);
  if (!velocityInsight || !bodyMd) return null;
  if (insightBasis !== "evidence_delta" && insightBasis !== "evidence_too_thin") return null;
  const reads = competitorNames
    .filter((name, index) => competitorNames.indexOf(name) === index)
    .map((name) => byCompetitor.get(name) as CompetitorVelocityRead);
  // A velocity delta nobody observed is an invention: with zero grounded
  // shipping observations the insight must declare itself evidence_too_thin.
  const observed = reads.some((read) => read.read === "shipping_observed");
  if (insightBasis === "evidence_delta" && !observed) return null;
  return { bodyMd, reads, velocity_insight: velocityInsight, insight_basis: insightBasis };
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
