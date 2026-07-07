import { asRecord } from "../../db/json.js";
import type { CanvasItemSource, SkillRun } from "./toolkit.js";

/**
 * anchor.churn_signal_audit — a churn signal audit for the Customer
 * Relationships room: complaint themes clustered from live customer reviews
 * of the analyzed company AND its researched competitors, each theme mapped
 * to a concrete retention play. Every theme is grounded in the retrieved
 * review excerpts — its evidence_quote must appear VERBATIM in one of them,
 * and its company must be the analyzed company or a researched competitor
 * (parser-enforced; one invented theme rejects the whole parse). Themes are
 * explicitly labeled "own" vs "competitor" so a rival's churn driver never
 * masquerades as ours. Our current Customer Relationships items ride along
 * as optional context so retention plays extend the canvas instead of
 * re-listing it. Up to four themes are verifier-spot-checked against the
 * excerpt that contains their quote.
 */

export type ChurnThemeSubject = "own" | "competitor";

const CHURN_THEME_SUBJECTS = new Set<string>(["own", "competitor"]);

export interface ChurnSignalTheme {
  theme: string;
  /** Whether the complaint theme was observed about US or a competitor. */
  observed_about: ChurnThemeSubject;
  /** The analyzed company ("own") or one of the researched competitors. */
  company: string;
  /** Verbatim substring of one of the retrieved review excerpts — parser-enforced. */
  evidence_quote: string;
  /** The concrete retention play this theme maps to. */
  retention_play: string;
}

export interface ChurnSignalAuditArtifact {
  bodyMd: string;
  themes: ChurnSignalTheme[];
}

export const runChurnSignalAudit: SkillRun = async (toolkit, job, scope) => {
  // The whole audit hangs off the analyzed company's reviews — without a
  // company there is nothing to search complaints for.
  if (!scope.companyName) throw new Error("churn_signal_audit requires an analyzed company first");
  const companyName = scope.companyName;

  // Optional context: existing Customer Relationships items keep the
  // retention plays from re-proposing what the canvas already runs.
  const ownRelationships = await toolkit.loadOwnSectionItems(job.account_id, "customer_relationships", scope);
  // Competitor names widen the review search and anchor the own-vs-competitor
  // labeling; their absence must not block the audit.
  const competitors = await toolkit.loadCompetitors(job.account_id, scope);
  const competitorNames = toolkit.unique(competitors.map((competitor) => competitor.name).filter(Boolean));

  const feed = await toolkit.refreshFeed({
    accountId: job.account_id,
    feedKey: "grok_live_search",
    // Company-scoped: without the company slug, re-analyzing to a different
    // company within the feed TTL would serve the previous company's cached
    // review excerpts (cross-company contamination).
    cacheKey: `churn_signal_audit:${job.account_id}:${slug(companyName)}`,
    companyName,
    query: [companyName, ...competitorNames].join(" and ")
      + " customer reviews complaints churn cancelled switching",
  });
  const sources = feed.health === "ok"
    ? feed.evidence.filter((entry) => Boolean(entry.excerpt?.trim())).slice(0, 6)
    : [];
  if (sources.length === 0) {
    throw new Error("churn_signal_audit could not retrieve review evidence — check the Grok search feed");
  }

  // Every excerpt that feeds the prompt lands on the evidence ledger first —
  // the artifact's evidence_ids must point at what the model actually saw.
  const evidenceIds: string[] = [];
  for (const source of sources) {
    evidenceIds.push(await toolkit.writeEvidence(job, {
      title: `${companyName} churn signal source`,
      sourceUrl: source.sourceUrl ?? "grok_live_search",
      excerpt: source.excerpt ?? "",
    }));
  }
  const excerpts = sources.map((source) => source.excerpt ?? "");

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const verifyRoute = toolkit.requiredRoute(routes, job.account_id, "research_verify", "research_verify");
  const modelResult = await toolkit.runModel(
    `churn_signal_audit artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: churnSignalAuditPrompt(companyName, competitorNames, excerpts, ownRelationships),
      systemPrompt:
        "You cluster churn complaint themes strictly from the provided review excerpts. Every theme's evidence_quote must appear verbatim in one of the excerpts — never cite complaints from memory — and a competitor's complaint must never be labeled as the analyzed company's. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseChurnSignalAuditArtifact(modelResult.resultText, excerpts, companyName, competitorNames);
  if (!artifact) throw new Error("churn_signal_audit produced unparseable output; refusing to write an artifact");

  // Verifier spot-check: each top theme against the excerpt that contains
  // its quote (the parser guarantees one exists).
  const checks = artifact.themes.slice(0, 4).map((theme) => ({
    claim: `"${theme.theme}" is a complaint theme observed about ${theme.company}; retention play: ${theme.retention_play}`,
    excerpt: excerpts.find((excerpt) => excerpt.includes(theme.evidence_quote)) ?? "",
  }));
  const checked = await toolkit.verifyArtifactClaims(job, verifyRoute, checks, "churn_signal_audit");

  const ownThemes = artifact.themes.filter((theme) => theme.observed_about === "own").length;
  const competitorThemes = artifact.themes.length - ownThemes;
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "anchor.churn_signal_audit",
    agentKey: "agent_customer_relationships",
    title: `Churn signal audit — ${artifact.themes.length} complaint theme${artifact.themes.length === 1 ? "" : "s"} (${ownThemes} own, ${competitorThemes} competitor)`,
    bodyMd: artifact.bodyMd,
    payload: {
      themes: artifact.themes,
      own_themes: ownThemes,
      competitor_themes: competitorThemes,
      spot_check: checked,
    },
    evidenceIds: toolkit.unique(evidenceIds),
    inputs: {
      sections: ["customer_relationships"],
      company: companyName,
      competitors: competitorNames,
      evidence_excerpts: excerpts.length,
    },
  });
  await toolkit.markRunCompleted(job, "Churn signal audit completed", {
    skill_key: "anchor.churn_signal_audit",
    themes: artifact.themes.length,
    own_themes: ownThemes,
    competitor_themes: competitorThemes,
    spot_check_confirmed: checked.confirmed,
  });
};

export function churnSignalAuditPrompt(
  companyName: string,
  competitorNames: string[],
  excerpts: string[],
  ownRelationships: CanvasItemSource[],
): string {
  return `Cluster the churn signals in the customer review excerpts below into complaint themes for ${companyName}:
- Each theme names ONE recurring complaint pattern (billing surprises, poor support, missing feature, ...).
- "observed_about" is exactly "own" when the complaint is about ${companyName}, or "competitor" when it is about one of: ${competitorNames.length > 0 ? competitorNames.join(", ") : "(no researched competitors)"}. Never mix the two.
- "company" is the exact company the complaint targets: "${companyName}" for own themes, or one of the competitor names above.
- "retention_play" is ONE concrete play ${companyName} should run — a fix for its own themes, a counter-positioning move for competitor themes.
- Every theme's "evidence_quote" must be a phrase copied VERBATIM from one of the excerpts. Skip any complaint the excerpts do not contain.
Return JSON only:
{"themes":[{"theme":"...","observed_about":"own|competitor","company":"...","evidence_quote":"verbatim phrase from an excerpt","retention_play":"one concrete retention play"}],"body_md":"## Churn signal audit\\n..."}

Our current Customer Relationships (context only — plays should go beyond these):
${formatOwnItems(ownRelationships)}

Review excerpts:
${excerpts.map((excerpt, index) => `[${index}] ${excerpt.slice(0, 2500)}`).join("\n\n")}`;
}

export function parseChurnSignalAuditArtifact(
  text: string,
  excerpts: string[],
  companyName: string,
  competitorNames: string[],
): ChurnSignalAuditArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  if (!Array.isArray(parsed.themes)) return null;
  const knownCompetitors = new Set(competitorNames);
  const themes: ChurnSignalTheme[] = [];
  for (const entry of parsed.themes) {
    const row = asRecord(entry);
    const theme = readString(row.theme);
    const observedAbout = readString(row.observed_about);
    const company = readString(row.company);
    const evidenceQuote = readString(row.evidence_quote);
    const retentionPlay = readString(row.retention_play);
    // One ungrounded or invented theme rejects the WHOLE parse: silently
    // dropping it would still ship its narrative in body_md under a label
    // that implies every theme is excerpt-grounded.
    if (!theme || !company || !evidenceQuote || !retentionPlay) return null;
    if (!observedAbout || !CHURN_THEME_SUBJECTS.has(observedAbout)) return null;
    // The quote must live in one of the excerpts the model was shown — a
    // complaint cited from the model's memory is refused, not shipped.
    if (!excerpts.some((excerpt) => excerpt.includes(evidenceQuote))) return null;
    // Own themes must target the analyzed company; competitor themes must
    // target a researched competitor — an unknown company is invented.
    if (observedAbout === "own" && company !== companyName) return null;
    if (observedAbout === "competitor" && !knownCompetitors.has(company)) return null;
    themes.push({
      theme,
      observed_about: observedAbout as ChurnThemeSubject,
      company,
      evidence_quote: evidenceQuote,
      retention_play: retentionPlay,
    });
  }
  const bodyMd = readString(parsed.body_md);
  return themes.length > 0 && bodyMd ? { bodyMd, themes } : null;
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
