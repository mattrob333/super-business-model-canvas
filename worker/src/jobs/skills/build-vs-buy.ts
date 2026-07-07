import { asRecord } from "../../db/json.js";
import type { CanvasItemSource, SkillRun } from "./toolkit.js";

/**
 * tempo.build_vs_buy — "build vs buy" for the Key Activities room: for each
 * of our Key Activities, is there a managed service or SaaS platform that
 * already does this, and should we keep building it in-house? Verdicts are
 * grounded in live market evidence (Grok search per activity), never in the
 * model's own market knowledge — every named alternative must quote one of
 * that activity's retrieved excerpts verbatim (parser-enforced) and the top
 * alternative claims are verifier-spot-checked against the excerpt that
 * contains their quote. An activity whose feed came back empty is still
 * classified, but the quote gate means it can only ship as keep_in_house
 * with zero alternatives — no evidence, no buy recommendation.
 */

export type BuildVsBuyVerdict = "keep_in_house" | "consider_buying" | "strong_buy_candidate";

const BUILD_VS_BUY_VERDICTS = new Set<string>(["keep_in_house", "consider_buying", "strong_buy_candidate"]);

export interface MarketAlternative {
  name: string;
  /** Verbatim substring of one of the activity's retrieved excerpts — parser-enforced. */
  evidence_quote: string;
}

export interface BuildVsBuyRow {
  activity: string;
  verdict: BuildVsBuyVerdict;
  market_alternatives: MarketAlternative[];
  switching_sketch: string | null;
  rationale: string;
}

export interface BuildVsBuyArtifact {
  bodyMd: string;
  rows: BuildVsBuyRow[];
}

/** One retrieved market excerpt, tagged with the activity whose search produced it. */
export interface ActivityExcerpt {
  activity: string;
  excerpt: string;
}

export const runBuildVsBuy: SkillRun = async (toolkit, job, scope) => {
  const activities = await toolkit.loadOwnSectionItems(job.account_id, "key_activities", scope);
  if (activities.length === 0) throw new Error("build_vs_buy requires our Key Activities canvas items first");

  // Market evidence per activity (up to 4 activities, up to 2 excerpts each).
  // A single failed feed does not fail the run — that activity simply has no
  // excerpts to quote, so the parser's quote gate confines it to
  // keep_in_house with zero alternatives.
  const considered = activities.slice(0, 4);
  const excerpts: ActivityExcerpt[] = [];
  const evidenceIds: string[] = [];
  for (const activity of considered) {
    const feed = await toolkit.refreshFeed({
      accountId: job.account_id,
      feedKey: "grok_live_search",
      cacheKey: `build_vs_buy:${job.account_id}:${slug(activity.text)}`,
      companyName: activity.text,
      query: `managed service or SaaS platform that provides "${activity.text}" build vs buy`,
    });
    if (feed.health !== "ok") continue;
    for (const item of feed.evidence.slice(0, 2)) {
      const excerpt = item.excerpt?.trim();
      if (!excerpt) continue;
      // Every excerpt that feeds the prompt lands on the evidence ledger
      // first — the artifact's evidence_ids must point at what the model saw.
      evidenceIds.push(await toolkit.writeEvidence(job, {
        title: `${activity.text} — market alternative source`,
        sourceUrl: item.sourceUrl ?? "grok_live_search",
        excerpt,
      }));
      excerpts.push({ activity: activity.text, excerpt });
    }
  }
  if (excerpts.length === 0) {
    throw new Error("build_vs_buy could not retrieve market evidence for any activity — check the Grok search feed");
  }

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const verifyRoute = toolkit.requiredRoute(routes, job.account_id, "research_verify", "research_verify");
  const modelResult = await toolkit.runModel(
    `build_vs_buy artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: buildVsBuyPrompt(considered, excerpts),
      systemPrompt:
        "You judge build vs buy strictly from the provided market excerpts. Every alternative's evidence_quote must appear verbatim in one of that activity's excerpts — never cite from memory. No evidenced alternative means keep_in_house. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseBuildVsBuyArtifact(modelResult.resultText, considered.map((item) => item.text), excerpts);
  if (!artifact) throw new Error("build_vs_buy produced unparseable output; refusing to write an artifact");

  // Verifier spot-check: each surviving alternative against the excerpt that
  // contains its quote (the parser guarantees one exists). An all-keep_in_house
  // read with zero alternatives asserts nothing about the market — nothing to
  // check, and the honest spot_check says so.
  const checks = artifact.rows
    .flatMap((row) => row.market_alternatives.map((alternative) => ({
      claim: `${alternative.name} is a market alternative for ${row.activity}`,
      excerpt: excerpts.find((entry) => entry.activity === row.activity && entry.excerpt.includes(alternative.evidence_quote))?.excerpt ?? "",
    })));
  const checked = checks.length > 0
    ? await toolkit.verifyArtifactClaims(job, verifyRoute, checks.slice(0, 4), "build_vs_buy")
    : { checked: 0, confirmed: 0 };

  const buyCandidates = artifact.rows.filter((row) => row.verdict !== "keep_in_house").length;
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "tempo.build_vs_buy",
    agentKey: "agent_key_activities",
    title: `Build vs buy — ${artifact.rows.length} activit${artifact.rows.length === 1 ? "y" : "ies"}, ${buyCandidates} buy candidate${buyCandidates === 1 ? "" : "s"}`,
    bodyMd: artifact.bodyMd,
    payload: { rows: artifact.rows, spot_check: checked },
    evidenceIds: toolkit.unique(evidenceIds),
    inputs: { sections: ["key_activities"], activities_scanned: considered.length, evidence_excerpts: excerpts.length },
  });
  await toolkit.markRunCompleted(job, "Build vs buy analysis completed", {
    skill_key: "tempo.build_vs_buy",
    activities: artifact.rows.length,
    buy_candidates: buyCandidates,
    spot_check_confirmed: checked.confirmed,
  });
};

export function buildVsBuyPrompt(activities: CanvasItemSource[], excerpts: ActivityExcerpt[]): string {
  return `Classify EVERY one of our Key Activities below as build vs buy, using ONLY the market excerpts:
- "keep_in_house": the activity is differentiating, or the excerpts name no credible managed alternative.
- "consider_buying": the excerpts name at least one credible managed service or SaaS alternative worth evaluating.
- "strong_buy_candidate": the activity is commodity work and the excerpts name mature alternatives — building it is a distraction.
- "market_alternatives" lists ONLY vendors named in that activity's excerpts; each "evidence_quote" must be a phrase copied VERBATIM from one of those excerpts. An activity with no usable excerpt gets an empty list and keep_in_house.
- "switching_sketch" is a one-sentence migration outline for buy verdicts, or null for keep_in_house.
Return JSON only:
{"rows":[{"activity":"<verbatim one of our activities>","verdict":"keep_in_house|consider_buying|strong_buy_candidate","market_alternatives":[{"name":"...","evidence_quote":"verbatim phrase from an excerpt"}],"switching_sketch":"one sentence or null","rationale":"one-sentence reasoning"}],"body_md":"## Build vs buy\\n..."}

Our Key Activities (classify each, verbatim):
${activities.map((item) => `- ${item.text}`).join("\n")}

Market excerpts (per activity):
${excerpts.map((entry, index) => `[${index}] activity=${entry.activity}\n${entry.excerpt.slice(0, 2500)}`).join("\n\n")}`;
}

export function parseBuildVsBuyArtifact(
  text: string,
  allowedActivities: string[],
  excerpts: ActivityExcerpt[],
): BuildVsBuyArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const allowed = new Set(allowedActivities);
  const seen = new Set<string>();
  const rows: BuildVsBuyRow[] = Array.isArray(parsed.rows)
    ? parsed.rows.flatMap((entry) => {
        const row = asRecord(entry);
        const activity = readString(row.activity);
        const verdict = readString(row.verdict);
        const rationale = readString(row.rationale);
        // Activities must be OUR items verbatim — the model may not invent
        // work we never claimed to do — and an unknown verdict drops the row.
        if (!activity || !rationale || !allowed.has(activity) || seen.has(activity)) return [];
        if (!verdict || !BUILD_VS_BUY_VERDICTS.has(verdict)) return [];
        const activityExcerpts = excerpts.filter((item) => item.activity === activity);
        const alternatives: MarketAlternative[] = Array.isArray(row.market_alternatives)
          ? row.market_alternatives.flatMap((alternative) => {
              const record = asRecord(alternative);
              const name = readString(record.name);
              const evidenceQuote = readString(record.evidence_quote);
              if (!name || !evidenceQuote) return [];
              // The quote must live in one of THIS activity's excerpts — an
              // alternative cited from the model's memory (or another
              // activity's evidence) is dropped, not shipped.
              if (!activityExcerpts.some((item) => item.excerpt.includes(evidenceQuote))) return [];
              return [{ name, evidence_quote: evidenceQuote }];
            })
          : [];
        // A buy verdict with zero surviving alternatives is an unsupported
        // recommendation — downgrade to keep_in_house (and drop the switching
        // sketch: there is nothing evidenced to switch to).
        const survivingVerdict = verdict !== "keep_in_house" && alternatives.length === 0
          ? "keep_in_house"
          : (verdict as BuildVsBuyVerdict);
        seen.add(activity);
        return [{
          activity,
          verdict: survivingVerdict,
          market_alternatives: alternatives,
          switching_sketch: survivingVerdict === "keep_in_house" ? null : readString(row.switching_sketch) ?? null,
          rationale,
        }];
      })
    : [];
  const bodyMd = readString(parsed.body_md);
  return rows.length > 0 && bodyMd ? { bodyMd, rows } : null;
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

// Mirror of skill-run.ts's slug — feed cache keys must be stable per activity.
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "activity";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
