import { asRecord } from "../../db/json.js";
import type { CanvasItemSource, SkillRun } from "./toolkit.js";

/**
 * yield.wtp_signals — willingness-to-pay signals for the Revenue Streams
 * room. Mines live review language about price (Grok search over
 * "<company> reviews pricing worth the money ...") and reads, for EVERY one
 * of our Customer Segments, whether the reviews suggest we are underpriced,
 * overpriced, aligned — or honestly "unknown" when the excerpts never speak
 * to that segment. Grounding is parser-enforced twice over: each row's
 * segment must repeat one of our Customer Segments items verbatim, and each
 * row's evidence_quote must be a verbatim substring of one of the retrieved
 * excerpts — one ungrounded row rejects the whole parse rather than shipping
 * a made-up pricing read next to real ones. Directional rows (not "unknown")
 * are verifier-spot-checked against the excerpt containing their quote.
 */

export type WtpSignal = "underpriced" | "overpriced" | "aligned" | "unknown";

const WTP_SIGNALS = new Set<string>(["underpriced", "overpriced", "aligned", "unknown"]);

export interface WtpSignalRow {
  /** Verbatim one of our Customer Segments items — parser-enforced. */
  segment: string;
  signal: WtpSignal;
  rationale: string;
  /** Verbatim substring of one of the retrieved excerpts — parser-enforced. */
  evidence_quote: string;
}

export interface WtpSignalsArtifact {
  bodyMd: string;
  signals: WtpSignalRow[];
}

export const runWtpSignals: SkillRun = async (toolkit, job, scope) => {
  // The review search hangs off the analyzed company's name — without a
  // company there are no reviews to mine.
  if (!scope.companyName) throw new Error("wtp_signals requires an analyzed company first");
  const companyName = scope.companyName;

  const revenueItems = await toolkit.loadOwnSectionItems(job.account_id, "revenue_streams", scope);
  if (revenueItems.length === 0) throw new Error("wtp_signals requires our Revenue Streams canvas items first");
  const segments = await toolkit.loadOwnSectionItems(job.account_id, "customer_segments", scope);
  if (segments.length === 0) throw new Error("wtp_signals requires Customer Segments canvas items first");

  const feed = await toolkit.refreshFeed({
    accountId: job.account_id,
    feedKey: "grok_live_search",
    // Company-scoped: without the company slug, re-analyzing to a different
    // company within the feed TTL would serve the previous company's cached
    // review excerpts (cross-company contamination).
    cacheKey: `wtp_signals:${job.account_id}:${slug(companyName)}`,
    companyName,
    query: `${companyName} reviews pricing worth the money expensive cheap value for money`,
  });
  const sources = feed.health === "ok"
    ? feed.evidence.filter((entry) => Boolean(entry.excerpt?.trim())).slice(0, 6)
    : [];
  if (sources.length === 0) {
    throw new Error("wtp_signals could not retrieve pricing review evidence — check the Grok search feed");
  }

  // Every excerpt that feeds the prompt lands on the evidence ledger first —
  // the artifact's evidence_ids must point at what the model actually saw.
  const evidenceIds: string[] = [];
  for (const source of sources) {
    evidenceIds.push(await toolkit.writeEvidence(job, {
      title: `${companyName} pricing review source`,
      sourceUrl: source.sourceUrl ?? "grok_live_search",
      excerpt: source.excerpt ?? "",
    }));
  }
  const excerpts = sources.map((source) => source.excerpt ?? "");

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const verifyRoute = toolkit.requiredRoute(routes, job.account_id, "research_verify", "research_verify");
  const modelResult = await toolkit.runModel(
    `wtp_signals artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: wtpSignalsPrompt(companyName, revenueItems, segments, excerpts),
      systemPrompt:
        "You read willingness-to-pay strictly from the provided review excerpts. Every evidence_quote must appear verbatim in one of the excerpts, and 'unknown' is the honest signal when the excerpts never speak to a segment — never infer a price read from memory. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseWtpSignalsArtifact(
    modelResult.resultText,
    segments.map((item) => item.text),
    excerpts,
  );
  if (!artifact) throw new Error("wtp_signals produced unparseable output; refusing to write an artifact");

  // Verifier spot-check: each directional read against the excerpt that
  // contains its quote (the parser guarantees one exists). "unknown" rows
  // assert the ABSENCE of a signal — there is no excerpt claim to check, so
  // they are honestly excluded rather than run through a fake pass.
  const checks = artifact.signals
    .filter((row) => row.signal !== "unknown")
    .slice(0, 4)
    .map((row) => ({
      claim: `Reviews suggest ${companyName} is ${row.signal} for the "${row.segment}" segment: ${row.rationale}`,
      excerpt: excerpts.find((excerpt) => excerpt.includes(row.evidence_quote)) ?? "",
    }));
  const checked = checks.length > 0
    ? await toolkit.verifyArtifactClaims(job, verifyRoute, checks, "wtp_signals")
    : { checked: 0, confirmed: 0 };

  const flagged = artifact.signals.filter((row) => row.signal === "underpriced" || row.signal === "overpriced").length;
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "yield.wtp_signals",
    agentKey: "agent_revenue_streams",
    title: `Willingness-to-pay signals — ${artifact.signals.length} segment read${artifact.signals.length === 1 ? "" : "s"}, ${flagged} mispricing flag${flagged === 1 ? "" : "s"}`,
    bodyMd: artifact.bodyMd,
    payload: { signals: artifact.signals, spot_check: checked },
    evidenceIds: toolkit.unique(evidenceIds),
    inputs: {
      sections: ["revenue_streams", "customer_segments"],
      company: companyName,
      evidence_excerpts: excerpts.length,
    },
  });
  await toolkit.markRunCompleted(job, "Willingness-to-pay signals completed", {
    skill_key: "yield.wtp_signals",
    segments: artifact.signals.length,
    flagged,
    spot_check_confirmed: checked.confirmed,
  });
};

export function wtpSignalsPrompt(
  companyName: string,
  revenueItems: CanvasItemSource[],
  segments: CanvasItemSource[],
  excerpts: string[],
): string {
  return `Read willingness-to-pay for ${companyName} from the review excerpts below, per customer segment:
- Give EVERY one of our Customer Segments exactly one row, with "segment" repeating the item VERBATIM, character for character.
- "signal" is exactly one of: underpriced (reviewers say it is a bargain / would pay more), overpriced (reviewers balk at the price), aligned (reviewers call the price fair for the value), unknown (the excerpts never speak to this segment's price perception).
- Every row's "evidence_quote" must be a phrase copied VERBATIM from one of the excerpts — for "unknown" rows quote the closest pricing language the excerpts do contain. Never quote from memory.
- "rationale" is one sentence tying the quote to the read against our current revenue streams.
Return JSON only:
{"signals":[{"segment":"<verbatim one of our Customer Segments>","signal":"underpriced|overpriced|aligned|unknown","rationale":"one-sentence reasoning","evidence_quote":"verbatim phrase from an excerpt"}],"body_md":"## Willingness-to-pay signals\\n..."}

Our Revenue Streams (how we charge today):
${formatOwnItems(revenueItems)}

Our Customer Segments (one row each, verbatim):
${formatOwnItems(segments)}

Review excerpts:
${excerpts.map((excerpt, index) => `[${index}] ${excerpt.slice(0, 2500)}`).join("\n\n")}`;
}

export function parseWtpSignalsArtifact(
  text: string,
  allowedSegments: string[],
  excerpts: string[],
): WtpSignalsArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  if (!Array.isArray(parsed.signals)) return null;

  // One ungrounded row rejects the WHOLE parse: silently dropping it would
  // still leave its narrative in body_md, shipping an invented pricing read
  // to the owner under a label that implies review grounding.
  const allowed = new Set(allowedSegments);
  const bySegment = new Map<string, WtpSignalRow>();
  for (const entry of parsed.signals) {
    const row = asRecord(entry);
    const segment = readString(row.segment);
    const signal = readString(row.signal);
    const rationale = readString(row.rationale);
    const evidenceQuote = readString(row.evidence_quote);
    if (!segment || !rationale || !evidenceQuote) return null;
    // The segment must be OUR canvas item verbatim — the model may not
    // invent audiences — and an unrecognized signal rejects the parse.
    if (!allowed.has(segment)) return null;
    if (!signal || !WTP_SIGNALS.has(signal)) return null;
    // The quote must live in one of the excerpts the model was shown — a
    // read cited from the model's memory is a fabrication, not a signal.
    if (!excerpts.some((excerpt) => excerpt.includes(evidenceQuote))) return null;
    // Two reads for one segment contradict the per-segment contract.
    if (bySegment.has(segment)) return null;
    bySegment.set(segment, { segment, signal: signal as WtpSignal, rationale, evidence_quote: evidenceQuote });
  }

  const bodyMd = readString(parsed.body_md);
  const uniqueSegments = allowedSegments.filter((segment, index) => allowedSegments.indexOf(segment) === index);
  // Every segment must come back read — a partial read would silently hide
  // the very segments whose pricing perception nobody has looked at.
  if (bySegment.size !== uniqueSegments.length || !bodyMd) return null;
  const signals = uniqueSegments.map((segment) => bySegment.get(segment) as WtpSignalRow);
  return { bodyMd, signals };
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
