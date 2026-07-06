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

/** First matching record among camelCase / snake_case aliases for a force. */
function pickForce(source: JsonRecord, aliases: string[]): JsonRecord | null {
  for (const alias of aliases) {
    const record = asRecord(source[alias]);
    if (record) return record;
  }
  return null;
}

/**
 * Convert legacy/variant Porter schemas → analysis.forces[]. Models return the
 * five forces under many shapes: camelCase or snake_case named keys, a
 * top-level forces array, or fiveForces. All of them must end up as
 * analysis.forces so the output_template renders instead of falling through
 * to the raw-response fallback.
 */
export function normalizePorterAnalysis(data: JsonRecord): JsonRecord {
  const analysis = asRecord(data.analysis) ?? {};
  const existingForces = [
    analysis.forces,
    data.forces,
    analysis.fiveForces,
    (analysis as JsonRecord)["five_forces"],
    data.fiveForces,
    (data as JsonRecord)["five_forces"],
  ].find((candidate) => Array.isArray(candidate) && candidate.length > 0);

  if (Array.isArray(existingForces)) {
    const normalized = existingForces
      .map((entry, index) => {
        const record = asRecord(entry);
        if (!record) return null;
        return buildForce(String(record.name ?? record.force ?? `Force ${index + 1}`), record);
      })
      .filter(Boolean) as JsonRecord[];
    if (normalized.length > 0) {
      return { ...data, analysis: { ...analysis, forces: normalized } };
    }
  }

  // Named-key shapes: check the analysis wrapper first, then the root.
  const sources = [analysis, data];
  for (const source of sources) {
    const forces = [
      buildForce("Threat of New Entrants", pickForce(source, ["threatOfNewEntrants", "threat_of_new_entrants", "newEntrants", "new_entrants"])),
      buildForce("Bargaining Power of Suppliers", pickForce(source, ["supplierPower", "supplier_power", "bargainingPowerOfSuppliers", "bargaining_power_of_suppliers"])),
      buildForce("Bargaining Power of Buyers", pickForce(source, ["buyerPower", "buyer_power", "bargainingPowerOfBuyers", "bargaining_power_of_buyers"])),
      buildForce("Threat of Substitutes", pickForce(source, ["threatOfSubstitutes", "threat_of_substitutes", "substitutes"])),
      buildForce("Competitive Rivalry", pickForce(source, ["competitiveRivalry", "competitive_rivalry", "rivalry", "industryRivalry", "industry_rivalry"])),
    ].filter(Boolean) as JsonRecord[];
    if (forces.length === 0) continue;

    const overall =
      analysis.overallAssessment ??
      (analysis as JsonRecord)["overall_assessment"] ??
      data.overallAssessment ??
      (data as JsonRecord)["overall_assessment"] ??
      source.summary;

    return {
      ...data,
      analysis: {
        ...analysis,
        forces,
        ...(typeof overall === "string" && overall ? { overallAssessment: overall } : {}),
      },
    };
  }

  return data;
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Model-written strings carry markdown emphasis ("**Capital Requirements:**")
 * — escaped verbatim they read as asterisk noise in the finished document.
 * Escape first, then honor bold/italic only. Kept in sync with
 * src/lib/report-content.ts.
 */
function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
}

/**
 * Render arbitrary parsed JSON as readable report HTML: keys become section
 * headings, string arrays become lists, arrays of objects become cards. This
 * is the last-resort formatter — a report must never show raw JSON.
 */
export function jsonToReportHtml(value: unknown, depth = 0): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") {
    return `<p style="line-height:1.7;white-space:pre-wrap">${inlineMarkdown(value)}</p>`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `<p>${escapeHtml(String(value))}</p>`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    if (value.every((item) => typeof item === "string" || typeof item === "number")) {
      const items = value
        .map((item) => `<li style="margin-bottom:0.35rem">${inlineMarkdown(String(item))}</li>`)
        .join("");
      return `<ul style="padding-left:1.25rem;line-height:1.6">${items}</ul>`;
    }
    return value
      .map((item) => {
        const record = asRecord(item);
        if (!record) return jsonToReportHtml(item, depth + 1);
        const title = record.name ?? record.title ?? record.force ?? record.label;
        const rest = { ...record };
        delete rest.name;
        delete rest.title;
        delete rest.force;
        delete rest.label;
        const heading = typeof title === "string" && title
          ? `<h4 style="margin:0 0 0.5rem;color:#1a5490">${escapeHtml(title)}</h4>`
          : "";
        return `<div class="report-card" style="border:1px solid #e2e8f0;border-radius:8px;padding:1rem 1.25rem;margin:0 0 1rem;background:#fff">${heading}${jsonToReportHtml(rest, depth + 1)}</div>`;
      })
      .join("");
  }
  const record = asRecord(value);
  if (!record || depth > 5) return `<p>${escapeHtml(JSON.stringify(value))}</p>`;
  return Object.entries(record)
    .filter(([, entry]) => entry !== null && entry !== undefined && entry !== "")
    .map(([key, entry]) => {
      const body = jsonToReportHtml(entry, depth + 1);
      if (!body) return "";
      // Scalars under a key read best as "Label: value" rows inside cards.
      if (depth >= 2 && (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean")) {
        return `<p style="margin:0 0 0.5rem;line-height:1.6"><strong>${escapeHtml(humanizeKey(key))}:</strong> ${inlineMarkdown(String(entry))}</p>`;
      }
      const headingTag = depth === 0 ? "h3" : "h4";
      return `<section style="margin:0 0 1.25rem"><${headingTag} style="margin:0 0 0.5rem;color:#1a5490">${escapeHtml(humanizeKey(key))}</${headingTag}>${body}</section>`;
    })
    .join("");
}

/** Parse content that is (possibly fenced) JSON; null when it isn't. */
export function tryParseJsonContent(content: string): JsonRecord | null {
  let trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    trimmed = trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed.replace(/,(\s*[}\]])/g, "$1"));
    return asRecord(parsed);
  } catch {
    return null;
  }
}

export function proseFallbackReport(
  frameworkTitle: string,
  companyName: string,
  strategicGoal: string | null | undefined,
  rawContent: string,
): string {
  const escaped = escapeHtml;

  // The raw model response may be JSON (a template mismatch landed us here) —
  // render it structured rather than dumping raw JSON at the user.
  const parsedJson = isLikelyHtml(rawContent) ? null : tryParseJsonContent(rawContent);

  const body = isLikelyHtml(rawContent)
    ? rawContent
    : parsedJson
      ? jsonToReportHtml(parsedJson)
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
