import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  CANVAS_SECTION_KEYS,
  CANVAS_SECTION_LABELS,
  LEGACY_SECTION_KEYS,
  type CanvasSectionKey,
} from "@/components/canvas/section-types";
import { getActiveAnalysisCanvas } from "@/lib/active-analysis";
import { invalidateCompanyScope } from "@/lib/company-scope";

interface BridgeInput {
  accountId: string;
  userId: string | null;
  analysisData: Record<string, unknown>;
  sourceAnalysisId?: string | null;
  summaryPrefix?: string;
}

interface BridgeResult {
  businessContextVersionId: string;
  sectionCount: number;
}

export async function bridgeAnalysisToCanvasVersions(input: BridgeInput): Promise<BridgeResult> {
  const sections = extractCanvasSections(input.analysisData);
  const company = readRecord(input.analysisData.company);
  const companyName = readString(company?.name) ?? "Unknown Company";
  const industry = readString(company?.industry) ?? null;
  const website = readString(company?.website) ?? readString(company?.website_url) ?? null;
  const description = readString(company?.description) ?? null;

  const { data: context, error: contextError } = await supabase
    .from("business_context_versions")
    .insert({
      account_id: input.accountId,
      source_analysis_id: input.sourceAnalysisId ?? null,
      summary: [input.summaryPrefix, description].filter(Boolean).join(": ") || `Business context for ${companyName}`,
      company_name: companyName,
      website,
      industry,
      data: input.analysisData as Json,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (contextError || !context) {
    throw new Error(`Failed to create business context: ${contextError?.message ?? "unknown"}`);
  }
  // A new context can change the active company era — scoped readers must
  // not serve a stale cached scope after a bridge.
  invalidateCompanyScope(input.accountId);

  const rows = sections.map((section) => ({
    account_id: input.accountId,
    business_context_version_id: context.id,
    competitor_id: null,
    section_key: section.sectionKey,
    section_title: CANVAS_SECTION_LABELS[section.sectionKey],
    // Honest numbers: a bridged import has no measured confidence — writing a
    // placeholder (formerly 0.4) rendered as a fake "40% confidence" in the
    // canvas. Null renders as "No confidence score" until an agent run or the
    // grounding wizard produces a real one.
    items: section.items.map((text) => ({ text, confidence: null })) as Json,
    notes: section.notes,
    confidence: null,
    freshness_status: "unverified" as const,
    created_by: input.userId,
  }));

  if (rows.length === 0) {
    return { businessContextVersionId: context.id, sectionCount: 0 };
  }

  const { data: inserted, error: sectionError } = await supabase
    .from("canvas_section_versions")
    .insert(rows)
    .select("id, section_key");
  if (sectionError) throw new Error(`Failed to write canvas versions: ${sectionError.message}`);
  if (!inserted || inserted.length !== rows.length) {
    throw new Error(`Canvas version verify failed: wrote ${inserted?.length ?? 0}/${rows.length} sections`);
  }

  return { businessContextVersionId: context.id, sectionCount: inserted.length };
}

interface ExtractedSection {
  sectionKey: CanvasSectionKey;
  items: string[];
  notes: string | null;
}

function extractCanvasSections(data: Record<string, unknown>): ExtractedSection[] {
  const canvas = getActiveAnalysisCanvas(data);
  if (!canvas) return [];
  return CANVAS_SECTION_KEYS.flatMap((sectionKey) => {
    const legacyKey = LEGACY_SECTION_KEYS[sectionKey];
    const items = normalizeItems(canvas[legacyKey]);
    if (items.length === 0) return [];
    return [{
      sectionKey,
      items,
      notes: readString(canvas[`${legacyKey}_notes`]) ?? null,
    }];
  });
}

function normalizeItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      const text = entry.trim();
      return text ? [text] : [];
    }
    const record = readRecord(entry);
    const text = readString(record?.text)?.trim();
    return text ? [text] : [];
  });
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
