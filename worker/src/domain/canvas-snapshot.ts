import type { SupabaseClient } from "@supabase/supabase-js";
import { readVariables, type BrainConfidence, type BrainVariable } from "../db/brain.js";
import { SECTION_LABELS, type SectionKey } from "./sections.js";

/** The compact, serializable shape injected into workflow prompts. */
export interface CanvasSnapshotItem {
  text: string;
  confidence: BrainConfidence | number;
}

export interface CanvasSnapshotSection {
  sectionKey: SectionKey;
  label: string;
  weight: number;
  items: CanvasSnapshotItem[];
}

export interface CanvasSnapshot {
  snapshot: string;
  chars: number;
  maxChars: number;
  truncated: boolean;
  sections: CanvasSnapshotSection[];
  includedSections: SectionKey[];
  omittedSections: SectionKey[];
  originalItemCount: number;
  includedItemCount: number;
  warnings: string[];
}

export interface CanvasSnapshotOptions {
  /** Defaults to the workflow context budget of approximately 2k tokens. */
  maxChars?: number;
}

/**
 * Canonical BMC ordering and the coverage-manifest weights. Keep this local to
 * the snapshot so building a prompt never depends on database row ordering.
 */
const SECTION_ORDER: readonly SectionKey[] = [
  "customer_segments",
  "value_propositions",
  "channels",
  "customer_relationships",
  "revenue_streams",
  "key_resources",
  "key_activities",
  "key_partners",
  "cost_structure",
];

const SECTION_WEIGHTS: Record<SectionKey, number> = {
  customer_segments: 10,
  value_propositions: 9,
  channels: 7,
  customer_relationships: 6,
  revenue_streams: 8,
  key_resources: 7,
  key_activities: 7,
  key_partners: 6,
  cost_structure: 8,
};

const DEFAULT_MAX_CHARS = 8000;
const MAX_ITEM_TEXT = 1200;

/**
 * Build a deterministic compact canvas context from account-scoped brain rows.
 * Rows may arrive in any order, and old mirrors may contain strings or objects;
 * both are normalized to {text, confidence} before rendering.
 */
export function buildCanvasSnapshot(
  variables: Pick<BrainVariable, "path" | "value" | "confidence">[],
  options: CanvasSnapshotOptions = {},
): CanvasSnapshot {
  const maxChars = Math.max(1, Math.floor(options.maxChars ?? DEFAULT_MAX_CHARS));
  const bySection = new Map<SectionKey, CanvasSnapshotItem[]>();
  const warnings: string[] = [];
  let originalItemCount = 0;

  for (const variable of variables) {
    const sectionKey = sectionKeyFromPath(variable.path);
    if (!sectionKey) continue;
    const rawItems = Array.isArray(variable.value) ? variable.value : [];
    if (!Array.isArray(variable.value) && variable.value !== null && variable.value !== undefined) {
      warnings.push(`Ignored non-array value for ${variable.path}`);
    }
    const items = rawItems
      .map((item) => normalizeItem(item, variable.confidence))
      .filter((item): item is CanvasSnapshotItem => item !== null);
    originalItemCount += items.length;
    // A duplicate row should not make output depend on query order. The latest
    // row is selected by BrainStore's unique path contract; this also makes the
    // pure helper safe with fixtures containing duplicate rows.
    bySection.set(sectionKey, items);
  }

  const allSections = SECTION_ORDER
    .map((sectionKey) => ({
      sectionKey,
      label: SECTION_LABELS[sectionKey],
      weight: SECTION_WEIGHTS[sectionKey],
      items: bySection.get(sectionKey) ?? [],
    }))
    .filter((section) => section.items.length > 0);

  let sections = [...allSections];
  let snapshot = renderSnapshot(sections);
  const omittedSections: SectionKey[] = [];

  // Remove complete sections from lowest value weight first. Ties use the
  // canonical order, so the result is stable across database/query order.
  while (snapshot.length > maxChars && sections.length > 1) {
    const lowest = sections.reduce((candidate, section) => (
      section.weight < candidate.weight ? section : candidate
    ), sections[0]);
    omittedSections.push(lowest.sectionKey);
    sections = sections.filter((section) => section.sectionKey !== lowest.sectionKey);
    snapshot = renderSnapshot(sections);
  }

  if (omittedSections.length > 0) {
    omittedSections.sort((a, b) => SECTION_ORDER.indexOf(a) - SECTION_ORDER.indexOf(b));
    warnings.push(`Snapshot exceeded ${maxChars} characters; omitted lower-weight sections: ${omittedSections.join(", ")}`);
  }

  // A single section can itself exceed the budget. Preserve its heading and
  // highest-value section, then hard-cap the rendered context as a last resort.
  if (snapshot.length > maxChars) {
    snapshot = snapshot.slice(0, maxChars);
    warnings.push(`Snapshot still exceeded ${maxChars} characters after section trimming; content was hard-truncated.`);
  }

  const includedItemCount = sections.reduce((total, section) => total + section.items.length, 0);
  return {
    snapshot,
    chars: snapshot.length,
    maxChars,
    truncated: omittedSections.length > 0 || snapshot.length < renderSnapshot(allSections).length,
    sections,
    includedSections: sections.map((section) => section.sectionKey),
    omittedSections,
    originalItemCount,
    includedItemCount,
    warnings,
  };
}

/** Load one company's canvas namespace (pass CompanyScope.companyKey). */
export async function loadCanvasSnapshot(
  client: SupabaseClient,
  accountId: string,
  companyKey: string | null,
  options: CanvasSnapshotOptions = {},
): Promise<CanvasSnapshot> {
  const variables = await readVariables(client, accountId, companyKey, { prefix: "canvas." });
  return buildCanvasSnapshot(variables, options);
}

function sectionKeyFromPath(path: string): SectionKey | null {
  if (!path.startsWith("canvas.")) return null;
  const key = path.slice("canvas.".length) as SectionKey;
  return SECTION_ORDER.includes(key) ? key : null;
}

function normalizeItem(value: unknown, fallback: BrainConfidence): CanvasSnapshotItem | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? { text, confidence: fallback } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.text !== "string" || !record.text.trim()) return null;
  const confidence = isConfidence(record.confidence) ? record.confidence : fallback;
  return { text: record.text.trim(), confidence };
}

function isConfidence(value: unknown): value is BrainConfidence | number {
  return typeof value === "number" || value === "high" || value === "medium" || value === "low";
}

function renderSnapshot(sections: CanvasSnapshotSection[]): string {
  if (sections.length === 0) return "Canvas snapshot: empty.";
  const blocks = sections.map((section) => {
    const items = section.items
      .map((item) => `- ${truncate(item.text)} [confidence: ${String(item.confidence)}]`)
      .join("\n");
    return `## ${section.label} (${section.sectionKey}; weight ${section.weight})\n${items}`;
  });
  return `Canvas snapshot (deterministic; ${sections.length} sections):\n${blocks.join("\n")}`;
}

function truncate(text: string): string {
  return text.length <= MAX_ITEM_TEXT ? text : `${text.slice(0, MAX_ITEM_TEXT - 1)}…`;
}
