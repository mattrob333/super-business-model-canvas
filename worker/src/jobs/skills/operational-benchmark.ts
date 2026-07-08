import { asRecord } from "../../db/json.js";
import type { SkillRun } from "./toolkit.js";

/**
 * tempo.operational_benchmark — the Key Activities room's competitor
 * operations radar: hiring mix (who competitors recruit) and ship velocity
 * (what they launch) as proxies for where they actually invest, benchmarked
 * against OUR Key Activities canvas. Every one of our activities comes back
 * exactly once as a gap row: either a competitor visibly invests there —
 * grounded in live evidence (web search over the researched competitors'
 * hiring and launch signals), never in the model's own market knowledge,
 * with the activity quoted VERBATIM from our canvas, the competitor named
 * EXACTLY from our researched list, and an evidence_quote copied verbatim
 * from a retrieved excerpt (all parser-enforced; one invented row rejects
 * the whole parse, because the body_md narrative would still ship it) — or
 * the row honestly says "no public signal" instead of guessing. Rows with
 * external quotes are verifier-spot-checked against the excerpt that
 * contains them; when every row is no-public-signal there is nothing
 * external to check, and spot_check honestly reports zero checks.
 */

export type BenchmarkSignal = "visible_investment" | "no_public_signal";

export type BenchmarkSignalType = "hiring" | "shipping" | "both";

const BENCHMARK_SIGNAL_TYPES = new Set<string>(["hiring", "shipping", "both"]);

export interface OperationalBenchmarkRow {
  /** Verbatim one of OUR Key Activities items — parser-enforced. */
  activity: string;
  signal: BenchmarkSignal;
  /** Exactly one of our researched competitors when visible — parser-enforced; null when no public signal. */
  competitor: string | null;
  /** Which investment proxy the excerpt shows — null when no public signal. */
  signal_type: BenchmarkSignalType | null;
  /** Verbatim substring of one of the retrieved excerpts — parser-enforced; null when no public signal. */
  evidence_quote: string | null;
  /** One-sentence gap read: their visible investment (or its absence) vs our canvas activity. */
  gap_read: string;
}

export interface OperationalBenchmarkArtifact {
  bodyMd: string;
  rows: OperationalBenchmarkRow[];
}

export const runOperationalBenchmark: SkillRun = async (toolkit, job, scope) => {
  // The benchmark is anchored on OUR activities — without them there is
  // nothing to compare competitor investment against.
  const activities = await toolkit.loadOwnSectionItems(job.account_id, "key_activities", scope);
  if (activities.length === 0) throw new Error("operational_benchmark requires our Key Activities canvas items first");

  // ...and defined by who we are up against — without researched competitors
  // there is no hiring mix or ship velocity to observe.
  const competitors = await toolkit.loadCompetitors(job.account_id, scope);
  if (competitors.length === 0) throw new Error("operational_benchmark requires at least one researched competitor first");
  const competitorNames = toolkit.unique(competitors.map((competitor) => competitor.name));

  const companyName = scope.companyName ?? "";
  const feed = await toolkit.refreshFeed({
    accountId: job.account_id,
    feedKey: "web_search",
    // Company-scoped: without the company slug, re-analyzing to a different
    // company within the feed TTL would serve the previous company's cached
    // hiring/launch excerpts (cross-company contamination).
    cacheKey: `operational_benchmark:${job.account_id}:${slug(companyName)}`,
    companyName,
    query: `${competitorNames.join(", ")} hiring careers engineering product launches shipped features`,
    // Benchmarks compare current operating pace; stale hiring/launch pages
    // would credit competitors with momentum they no longer have.
    recencyDays: 180,
  });
  const sources = feed.health === "ok"
    ? feed.evidence.filter((entry) => Boolean(entry.excerpt?.trim())).slice(0, 6)
    : [];
  if (sources.length === 0) {
    throw new Error("operational_benchmark could not retrieve competitor hiring and launch evidence — check the web search feed");
  }

  // Every excerpt that feeds the prompt lands on the evidence ledger first —
  // the artifact's evidence_ids must point at what the model actually saw.
  const evidenceIds: string[] = [];
  for (const source of sources) {
    evidenceIds.push(await toolkit.writeEvidence(job, {
      title: `${companyName || "operational benchmark"} competitor operations source`,
      sourceUrl: source.sourceUrl ?? "web_search",
      excerpt: source.excerpt ?? "",
    }));
  }
  const excerpts = sources.map((source) => source.excerpt ?? "");
  const activityTexts = toolkit.unique(activities.map((item) => item.text));

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const verifyRoute = toolkit.requiredRoute(routes, job.account_id, "research_verify", "research_verify");
  const modelResult = await toolkit.runModel(
    `operational_benchmark artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: operationalBenchmarkPrompt(competitorNames, excerpts, activityTexts),
      systemPrompt:
        "You benchmark operational investment strictly from the provided excerpts. Every visible-investment row's evidence_quote must appear verbatim in one of the excerpts and its competitor must be one of the listed competitors — an activity the excerpts say nothing about is honestly 'no_public_signal', never a guess from memory. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseOperationalBenchmarkArtifact(modelResult.resultText, excerpts, activityTexts, competitorNames);
  if (!artifact) throw new Error("operational_benchmark produced unparseable output; refusing to write an artifact");

  // Verifier spot-check (<=4): ONLY rows with an external quote have an
  // excerpt to check against (the parser guarantees one contains the quote).
  // No-public-signal rows claim an absence — there is nothing external to
  // verify, so an all-quiet benchmark honestly reports zero checks instead
  // of faking a verifier pass (verifyArtifactClaims would rightly refuse an
  // empty check list).
  const visibleRows = artifact.rows.filter((row) => row.signal === "visible_investment");
  const checks = visibleRows.slice(0, 4).map((row) => ({
    claim: `${row.competitor} visibly invests in "${row.activity}" via ${row.signal_type} signals: ${row.gap_read}`,
    excerpt: excerpts.find((excerpt) => excerpt.includes(row.evidence_quote ?? "")) ?? "",
  }));
  const checked = checks.length > 0
    ? await toolkit.verifyArtifactClaims(job, verifyRoute, checks, "operational_benchmark")
    : { checked: 0, confirmed: 0 };

  const quiet = artifact.rows.length - visibleRows.length;
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "tempo.operational_benchmark",
    agentKey: "agent_key_activities",
    title: `Operational benchmark — ${visibleRows.length} of ${artifact.rows.length} activities show visible competitor investment`,
    bodyMd: artifact.bodyMd,
    payload: {
      rows: artifact.rows,
      visible_investments: visibleRows.length,
      no_public_signal: quiet,
      spot_check: checked,
    },
    // The model saw our canvas activities AND the retrieved excerpts — the
    // ledger ids for both back the artifact.
    evidenceIds: toolkit.unique([...evidenceIds, ...activities.flatMap((item) => item.evidenceIds)]),
    inputs: {
      sections: ["key_activities"],
      company: companyName,
      competitors: competitorNames,
      evidence_excerpts: excerpts.length,
    },
  });
  await toolkit.markRunCompleted(job, "Operational benchmark completed", {
    skill_key: "tempo.operational_benchmark",
    activities: artifact.rows.length,
    visible_investments: visibleRows.length,
    spot_check_confirmed: checked.confirmed,
  });
};

export function operationalBenchmarkPrompt(
  competitorNames: string[],
  excerpts: string[],
  activityTexts: string[],
): string {
  return `Benchmark our Key Activities against competitor operational signals strictly from the excerpts below. Hiring mix (who they recruit) and ship velocity (what they launch) are the investment proxies. Return one row per activity — cover EVERY activity listed, exactly once each:
- "activity": one of our Key Activities copied VERBATIM, character for character.
- "signal": "visible_investment" when an excerpt shows a competitor hiring for or shipping in that activity area; "no_public_signal" when the excerpts show nothing for it — say so honestly, never infer from memory.
- For visible_investment rows: "competitor" is EXACTLY one of our researched competitors (${competitorNames.join(", ")}); "signal_type" is exactly one of hiring, shipping, both; "evidence_quote" is a phrase copied VERBATIM from one of the excerpts.
- For no_public_signal rows: "competitor", "signal_type" and "evidence_quote" are null.
- "gap_read": one sentence comparing their visible investment (or its absence) to our canvas activity.
Return JSON only:
{"rows":[{"activity":"<verbatim one of our activities>","signal":"visible_investment|no_public_signal","competitor":"string or null","signal_type":"hiring|shipping|both|null","evidence_quote":"verbatim phrase from an excerpt or null","gap_read":"one-sentence gap read"}],"body_md":"## Operational benchmark\\n..."}

Our Key Activities (benchmark each, verbatim):
${activityTexts.map((text) => `- ${text}`).join("\n")}

Competitor hiring and launch excerpts:
${excerpts.map((excerpt, index) => `[${index}] ${excerpt.slice(0, 2500)}`).join("\n\n")}`;
}

/**
 * Parse-or-null. Every row must name one of OUR Key Activities verbatim, and
 * a visible_investment row must additionally (a) name one of OUR researched
 * competitors exactly and (b) carry an evidence_quote that is a verbatim
 * substring of an excerpt the model was shown. ONE ungrounded/invented row
 * rejects the whole parse: silently dropping it from the payload would still
 * leave its narrative in body_md, shipping the invented investment claim to
 * the owner under a label that implies grounding. Every activity must come
 * back exactly once — a partial benchmark would silently hide the very
 * activity areas where we are most likely behind.
 */
export function parseOperationalBenchmarkArtifact(
  text: string,
  excerpts: string[],
  activityTexts: string[],
  competitorNames: string[],
): OperationalBenchmarkArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const allowedActivities = new Set(activityTexts);
  const allowedCompetitors = new Set(competitorNames);
  if (!Array.isArray(parsed.rows)) return null;
  const byActivity = new Map<string, OperationalBenchmarkRow>();
  for (const entry of parsed.rows) {
    const row = asRecord(entry);
    const activity = readString(row.activity);
    const signal = readString(row.signal);
    const gapRead = readString(row.gap_read);
    if (!activity || !gapRead) return null;
    // An activity that is not OURS verbatim is an invention.
    if (!allowedActivities.has(activity)) return null;
    if (signal !== "visible_investment" && signal !== "no_public_signal") return null;

    if (signal === "visible_investment") {
      const competitor = readString(row.competitor);
      const signalType = readString(row.signal_type);
      const evidenceQuote = readString(row.evidence_quote);
      // A visible-investment claim without a named researched competitor, a
      // recognized proxy type, and a quote the model was actually shown is
      // an invention — reject the parse, not just the row. This grounding
      // gate runs for EVERY row, duplicates included: an invented duplicate
      // must null the parse (its narrative would still ship in body_md),
      // never be silently skipped.
      if (!competitor || !allowedCompetitors.has(competitor)) return null;
      if (!signalType || !BENCHMARK_SIGNAL_TYPES.has(signalType)) return null;
      if (!evidenceQuote || !excerpts.some((excerpt) => excerpt.includes(evidenceQuote))) return null;
      // A grounded duplicate of an already-accepted activity restates, not
      // invents — keep the first row; completeness is judged on distinct
      // activities.
      if (byActivity.has(activity)) continue;
      byActivity.set(activity, {
        activity,
        signal,
        competitor,
        signal_type: signalType as BenchmarkSignalType,
        evidence_quote: evidenceQuote,
        gap_read: gapRead,
      });
      continue;
    }
    // A duplicate no-public-signal row claims nothing external either —
    // keep the first accepted row for the activity.
    if (byActivity.has(activity)) continue;
    // No public signal claims nothing external — normalize any stray fields
    // to null so the honest absence carries no half-grounded decoration.
    byActivity.set(activity, {
      activity,
      signal,
      competitor: null,
      signal_type: null,
      evidence_quote: null,
      gap_read: gapRead,
    });
  }
  const bodyMd = readString(parsed.body_md);
  // Every own activity must come back benchmarked — a partial benchmark
  // would silently hide unexamined activity areas.
  if (byActivity.size !== allowedActivities.size || !bodyMd) return null;
  const rows = activityTexts
    .filter((activity, index) => activityTexts.indexOf(activity) === index)
    .map((activity) => byActivity.get(activity) as OperationalBenchmarkRow);
  return { bodyMd, rows };
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
