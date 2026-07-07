import { asRecord } from "../../db/json.js";
import type { CanvasItemSource, SkillRun } from "./toolkit.js";

/**
 * vault.talent_radar — the Key Resources room's hiring radar: what functions
 * the researched competitors are hiring for right now, read as investment
 * signal ahead of any announcement. Every competitor comes back exactly once:
 * either the excerpts show hiring — grounded in live evidence (Grok search
 * over the competitors' job postings and careers pages), never in the
 * model's own market knowledge, with the competitor named EXACTLY from our
 * researched list and every hiring signal carrying an evidence_quote copied
 * VERBATIM from a retrieved excerpt (all parser-enforced; one invented
 * signal rejects the whole parse, because the body_md narrative would still
 * ship it) — or the read honestly says the evidence is too thin instead of
 * guessing a hiring pattern. Each grounded read closes with what the hiring
 * pattern implies the competitor will ship or expand next — an inference
 * labeled as such, sitting on quoted signals, never on memory. Grounded
 * signals are verifier-spot-checked (<=4) against the excerpt that contains
 * their quote; an all-thin radar has nothing external to check and honestly
 * reports zero checks. Our own Key Resources items ride along as optional
 * context so the radar reads competitor hiring against the capabilities we
 * actually have.
 */

export type TalentReadKind = "hiring_observed" | "evidence_thin";

export type TalentFunction =
  | "engineering"
  | "sales"
  | "marketing"
  | "product"
  | "data"
  | "ai"
  | "operations"
  | "customer_success"
  | "design"
  | "other";

const TALENT_FUNCTIONS = new Set<string>([
  "engineering",
  "sales",
  "marketing",
  "product",
  "data",
  "ai",
  "operations",
  "customer_success",
  "design",
  "other",
]);

export interface HiringSignal {
  /** The function the roles belong to — exactly one of TALENT_FUNCTIONS. */
  function: TalentFunction;
  /** One sentence on what the excerpts show them hiring, as reported. */
  signal: string;
  /** Verbatim substring of one of the retrieved excerpts — parser-enforced. */
  evidence_quote: string;
}

export interface CompetitorTalentRead {
  /** Exactly one of our researched competitors — parser-enforced. */
  competitor: string;
  read: TalentReadKind;
  /** >=1 grounded signals when hiring_observed; empty when evidence_thin. */
  signals: HiringSignal[];
  /**
   * What the hiring pattern implies they will ship or expand next — or the
   * honest too-thin note when the evidence shows nothing.
   */
  next_move: string;
}

export interface TalentRadarArtifact {
  bodyMd: string;
  reads: CompetitorTalentRead[];
}

export const runTalentRadar: SkillRun = async (toolkit, job, scope) => {
  // The radar is defined by who we are up against — without researched
  // competitors there is no hiring to read.
  const competitors = await toolkit.loadCompetitors(job.account_id, scope);
  if (competitors.length === 0) throw new Error("talent_radar requires at least one researched competitor first");
  const competitorNames = toolkit.unique(competitors.map((competitor) => competitor.name));

  // Optional context: our own Key Resources anchor which competitor hiring
  // moves actually threaten us — their absence must not block the radar.
  const ownResources = await toolkit.loadOwnSectionItems(job.account_id, "key_resources", scope);

  const companyName = scope.companyName ?? "";
  const feed = await toolkit.refreshFeed({
    accountId: job.account_id,
    feedKey: "grok_live_search",
    // Scoped to the company AND the competitor set: the query subject is the
    // competitor list, and FeedRunner serves cache hits by cache key alone —
    // without the competitor slug, adding a competitor within the feed TTL
    // would replay excerpts that never searched for the new one, and the
    // radar would report them 'evidence_thin' from a search that never ran
    // (and switching companies would replay the previous company's excerpts).
    cacheKey: `talent_radar:${job.account_id}:${slug(companyName)}:${slug(competitorNames.join("-"))}`,
    companyName,
    query: `${competitorNames.join(", ")} hiring jobs careers roles engineering sales data AI`,
  });
  const sources = feed.health === "ok"
    ? feed.evidence.filter((entry) => Boolean(entry.excerpt?.trim())).slice(0, 6)
    : [];
  if (sources.length === 0) {
    throw new Error("talent_radar could not retrieve competitor hiring evidence — check the Grok search feed");
  }

  // Every excerpt that feeds the prompt lands on the evidence ledger first —
  // the artifact's evidence_ids must point at what the model actually saw.
  const evidenceIds: string[] = [];
  for (const source of sources) {
    evidenceIds.push(await toolkit.writeEvidence(job, {
      title: `${companyName || "talent radar"} competitor hiring source`,
      sourceUrl: source.sourceUrl ?? "grok_live_search",
      excerpt: source.excerpt ?? "",
    }));
  }
  const excerpts = sources.map((source) => source.excerpt ?? "");

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const verifyRoute = toolkit.requiredRoute(routes, job.account_id, "research_verify", "research_verify");
  const modelResult = await toolkit.runModel(
    `talent_radar artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: talentRadarPrompt(competitorNames, excerpts, ownResources),
      systemPrompt:
        "You read competitor hiring strictly from the provided excerpts. Every signal's evidence_quote must appear verbatim in one of the excerpts and its competitor must be one of the listed competitors — a competitor the excerpts say nothing about is honestly 'evidence_thin', never a hiring pattern guessed from memory. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseTalentRadarArtifact(modelResult.resultText, excerpts, competitorNames);
  if (!artifact) throw new Error("talent_radar produced unparseable output; refusing to write an artifact");

  // Verifier spot-check (<=4): ONLY grounded signals have an excerpt to
  // check against (the parser guarantees one contains each quote). An
  // evidence_thin read claims an absence — there is nothing external to
  // verify, so an all-thin radar honestly reports zero checks instead of
  // faking a verifier pass.
  const checks = artifact.reads
    .filter((read) => read.read === "hiring_observed")
    .flatMap((read) => read.signals.map((signal) => ({
      claim: `${read.competitor} is hiring in ${signal.function}: ${signal.signal}`,
      excerpt: excerpts.find((excerpt) => excerpt.includes(signal.evidence_quote)) ?? "",
    })))
    .slice(0, 4);
  const checked = checks.length > 0
    ? await toolkit.verifyArtifactClaims(job, verifyRoute, checks, "talent_radar")
    : { checked: 0, confirmed: 0 };

  const hiringReads = artifact.reads.filter((read) => read.read === "hiring_observed");
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "vault.talent_radar",
    agentKey: "agent_key_resources",
    title: `Talent radar — ${hiringReads.length} of ${artifact.reads.length} competitors show hiring signals`,
    bodyMd: artifact.bodyMd,
    payload: {
      reads: artifact.reads,
      hiring_observed: hiringReads.length,
      evidence_thin: artifact.reads.length - hiringReads.length,
      spot_check: checked,
    },
    // The model saw the retrieved excerpts AND our own resources — the
    // ledger ids for both back the artifact.
    evidenceIds: toolkit.unique([...evidenceIds, ...ownResources.flatMap((item) => item.evidenceIds)]),
    inputs: {
      sections: ["key_resources"],
      company: companyName,
      competitors: competitorNames,
      evidence_excerpts: excerpts.length,
    },
  });
  await toolkit.markRunCompleted(job, "Talent radar completed", {
    skill_key: "vault.talent_radar",
    competitors: artifact.reads.length,
    hiring_observed: hiringReads.length,
    spot_check_confirmed: checked.confirmed,
  });
};

export function talentRadarPrompt(
  competitorNames: string[],
  excerpts: string[],
  ownResources: CanvasItemSource[],
): string {
  return `Read competitor hiring strictly from the excerpts below. Hiring by function reveals investment before any announcement. Return one read per competitor — cover EVERY researched competitor, exactly once each:
- "competitor": EXACTLY one of our researched competitors: ${competitorNames.join(", ")}.
- "read": "hiring_observed" when the excerpts report roles, job postings, or hiring for that competitor; "evidence_thin" when the excerpts show nothing about their hiring — say so honestly, never infer a pattern from memory.
- For hiring_observed reads: "signals" is a non-empty list; each signal's "function" is exactly one of engineering, sales, marketing, product, data, ai, operations, customer_success, design, other; "signal" is one sentence on what they are hiring in that function; "evidence_quote" is a phrase copied VERBATIM from one of the excerpts that reports it.
- For evidence_thin reads: "signals" is an empty list.
- "next_move": one sentence on what the hiring pattern implies they will ship or expand next — an inference from the quoted signals only (for evidence_thin, an honest note that the evidence is too thin to read a pattern).
Return JSON only:
{"reads":[{"competitor":"...","read":"hiring_observed|evidence_thin","signals":[{"function":"engineering","signal":"one sentence","evidence_quote":"verbatim phrase from an excerpt"}],"next_move":"one sentence"}],"body_md":"## Talent radar\\n..."}

Our Key Resources (context only — the capabilities we already have):
${formatOwnItems(ownResources)}

Competitor hiring excerpts:
${excerpts.map((excerpt, index) => `[${index}] ${excerpt.slice(0, 2500)}`).join("\n\n")}`;
}

/**
 * Parse-or-null. Every read must name one of OUR researched competitors
 * exactly, every competitor must come back exactly once (a partial radar
 * would silently hide the competitor quietly staffing up against us), and a
 * hiring_observed read must carry at least one signal whose evidence_quote
 * is a verbatim substring of an excerpt the model was shown and whose
 * function is a recognized class. ONE ungrounded/invented signal rejects the
 * whole parse: silently dropping it would still leave its narrative in
 * body_md, shipping the invented hiring push to the owner under a label that
 * implies grounding.
 */
export function parseTalentRadarArtifact(
  text: string,
  excerpts: string[],
  competitorNames: string[],
): TalentRadarArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const allowedCompetitors = new Set(competitorNames);
  if (!Array.isArray(parsed.reads)) return null;
  const byCompetitor = new Map<string, CompetitorTalentRead>();
  for (const entry of parsed.reads) {
    const row = asRecord(entry);
    const competitor = readString(row.competitor);
    const read = readString(row.read);
    const nextMove = readString(row.next_move);
    if (!competitor || !nextMove) return null;
    // A read about a company we never researched is an invention.
    if (!allowedCompetitors.has(competitor)) return null;
    if (read !== "hiring_observed" && read !== "evidence_thin") return null;
    // A duplicate of an already-accepted competitor restates, not invents —
    // keep the first read; completeness is judged on distinct competitors.
    if (byCompetitor.has(competitor)) continue;

    if (read === "hiring_observed") {
      if (!Array.isArray(row.signals) || row.signals.length === 0) return null;
      const signals: HiringSignal[] = [];
      for (const signalEntry of row.signals) {
        const signal = asRecord(signalEntry);
        const fn = readString(signal.function);
        const signalText = readString(signal.signal);
        const evidenceQuote = readString(signal.evidence_quote);
        // A signal without a quote the model was actually shown — or with a
        // function class we never defined — is an invention: reject the
        // parse, not just the signal.
        if (!fn || !TALENT_FUNCTIONS.has(fn)) return null;
        if (!signalText || !evidenceQuote) return null;
        if (!excerpts.some((excerpt) => excerpt.includes(evidenceQuote))) return null;
        signals.push({ function: fn as TalentFunction, signal: signalText, evidence_quote: evidenceQuote });
      }
      byCompetitor.set(competitor, { competitor, read, signals, next_move: nextMove });
      continue;
    }
    // Evidence-thin claims nothing external — normalize any stray signals to
    // empty so the honest absence carries no half-grounded decoration.
    byCompetitor.set(competitor, { competitor, read, signals: [], next_move: nextMove });
  }
  // Every researched competitor must come back read — a partial radar would
  // silently hide the competitor quietly staffing up against us.
  if (byCompetitor.size !== allowedCompetitors.size) return null;

  const bodyMd = readString(parsed.body_md);
  if (!bodyMd) return null;
  const reads = competitorNames
    .filter((name, index) => competitorNames.indexOf(name) === index)
    .map((name) => byCompetitor.get(name) as CompetitorTalentRead);
  return { bodyMd, reads };
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
