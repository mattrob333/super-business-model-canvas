/**
 * Render-time salvage for generated framework reports.
 *
 * Live bug 2026-07-05: a Porter Five Forces run stored the model's raw JSON
 * (or fallback HTML wrapping escaped JSON) in generated_reports.report_content,
 * and the viewer showed it verbatim. The edge function is fixed to never emit
 * raw JSON again, but reports already written — and any generated before the
 * edge functions are redeployed — still need to read as professional reports.
 *
 * Mirrors supabase/functions/_shared/framework-report-normalize.ts
 * (jsonToReportHtml). The edge runtime can't share modules with the app, so
 * keep the two renderers in sync when changing either.
 */

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
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
 * Escape first, then honor bold/italic only.
 */
function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
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

/**
 * Render parsed JSON as readable report HTML: keys become section headings,
 * string arrays become lists, arrays of objects become cards.
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
      if (depth >= 2 && (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean")) {
        return `<p style="margin:0 0 0.5rem;line-height:1.6"><strong>${escapeHtml(humanizeKey(key))}:</strong> ${inlineMarkdown(String(entry))}</p>`;
      }
      const headingTag = depth === 0 ? "h3" : "h4";
      return `<section style="margin:0 0 1.25rem"><${headingTag} style="margin:0 0 0.5rem;color:#1a5490">${escapeHtml(humanizeKey(key))}</${headingTag}>${body}</section>`;
    })
    .join("");
}

export function isLikelyHtml(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.startsWith("<") &&
    /<(div|h1|h2|h3|section|article|p|ul|table)/i.test(trimmed)
  );
}

/**
 * Return display-ready HTML for a stored report. Three stored shapes salvage:
 * raw JSON (rendered structured), fallback HTML whose `.report-prose` block
 * wraps escaped JSON (block re-rendered structured), and clean HTML/prose
 * (returned untouched).
 */
export function salvageReportHtml(content: string): string {
  const direct = tryParseJsonContent(content);
  if (direct) {
    return `<div class="framework-report">${jsonToReportHtml(direct)}</div>`;
  }

  if (isLikelyHtml(content) && content.includes("report-prose") && typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(content, "text/html");
    const prose = doc.querySelector(".report-prose");
    const parsed = prose?.textContent ? tryParseJsonContent(prose.textContent) : null;
    if (prose && parsed) {
      prose.innerHTML = jsonToReportHtml(parsed);
      prose.removeAttribute("style");
      return doc.body.innerHTML;
    }
  }

  return content;
}
