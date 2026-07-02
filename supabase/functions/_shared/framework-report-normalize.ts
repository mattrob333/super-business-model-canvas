/**
 * Normalizes AI JSON payloads so Handlebars output templates render correctly.
 * Fixes schema mismatches between DB migrations and output_template fields.
 */

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function capitalizeIntensity(value: unknown): string {
  const raw = String(value ?? "Medium").trim();
  const lower = raw.toLowerCase();
  if (lower.includes("high")) return "High";
  if (lower.includes("low")) return "Low";
  return "Medium";
}

function buildForce(
  name: string,
  source: JsonRecord | null,
): JsonRecord | null {
  if (!source) return null;

  const factors = Array.isArray(source.factors)
    ? (source.factors as string[]).join("; ")
    : "";
  const impact = String(source.impact ?? source.analysis ?? "").trim();
  const implications = String(
    source.implications ?? source.impact ?? source.analysis ?? "",
  ).trim();

  const analysisParts = [impact, factors ? `Key factors: ${factors}` : ""].filter(
    Boolean,
  );

  return {
    name,
    intensity: capitalizeIntensity(source.strength ?? source.intensity),
    analysis: analysisParts.join(" ") || "Analysis pending.",
    implications: implications || "Review competitive positioning for this force.",
  };
}

/** Convert legacy Porter schema (competitiveRivalry, etc.) → analysis.forces[] */
export function normalizePorterAnalysis(data: JsonRecord): JsonRecord {
  const analysis = asRecord(data.analysis) ?? {};
  const existingForces = analysis.forces;

  if (Array.isArray(existingForces) && existingForces.length > 0) {
    return data;
  }

  const forces = [
    buildForce("Threat of New Entrants", asRecord(analysis.threatOfNewEntrants)),
    buildForce(
      "Bargaining Power of Suppliers",
      asRecord(analysis.supplierPower),
    ),
    buildForce("Bargaining Power of Buyers", asRecord(analysis.buyerPower)),
    buildForce("Threat of Substitutes", asRecord(analysis.threatOfSubstitutes)),
    buildForce("Competitive Rivalry", asRecord(analysis.competitiveRivalry)),
  ].filter(Boolean) as JsonRecord[];

  return {
    ...data,
    analysis: {
      ...analysis,
      forces,
    },
  };
}

export function normalizeFrameworkAnalysis(
  shortcut: string | null | undefined,
  data: JsonRecord,
): JsonRecord {
  if (shortcut === "PORTER") {
    return normalizePorterAnalysis(data);
  }
  return data;
}

export function isLikelyHtml(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.startsWith("<") &&
    /<(div|h1|h2|h3|section|article|p|ul|table)/i.test(trimmed)
  );
}

export function proseFallbackReport(
  frameworkTitle: string,
  companyName: string,
  strategicGoal: string | null | undefined,
  rawContent: string,
): string {
  const escaped = (text: string) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const body = isLikelyHtml(rawContent)
    ? rawContent
    : `<div class="report-prose" style="white-space:pre-wrap;line-height:1.7">${escaped(rawContent)}</div>`;

  const goalBlock = strategicGoal
    ? `<p class="report-meta"><strong>Strategic Goal:</strong> ${escaped(strategicGoal)}</p>`
    : "";

  return `<div class="framework-report porters-container">
  <h1>${escaped(frameworkTitle)}</h1>
  <h2>${escaped(companyName)}</h2>
  ${goalBlock}
  <div class="report-body">${body}</div>
</div>`;
}

/** Detect templates that rendered only headers with no substantive body */
export function isThinReport(html: string): boolean {
  const withoutTags = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return withoutTags.length < 120;
}
