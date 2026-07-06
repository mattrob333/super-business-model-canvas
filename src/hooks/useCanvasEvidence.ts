import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadCompanyScope } from "@/lib/company-scope";
import { useAccountId } from "@/hooks/useAccountId";
import { CANVAS_SECTION_KEYS } from "@/components/canvas/section-types";
import type { CanvasSectionKey } from "@/components/canvas/section-types";
import type {
  CanvasEvidenceItem,
  CanvasItemEvidence,
  FreshnessStatus,
} from "@/components/canvas/CanvasSectionCard";

export type CanvasEvidenceBySection = Partial<
  Record<CanvasSectionKey, CanvasItemEvidence[]>
>;

/**
 * Loads the latest `canvas_section_versions` row per section for the active
 * account and hydrates each item's `evidence_ids` into real `evidence_items`
 * rows — the data path behind the evidence popovers on the canvas.
 *
 * Sections without version rows are simply absent from the result; the canvas
 * falls back to the legacy analysis strings for those.
 */
export function useCanvasEvidence(options?: { enabled?: boolean }): {
  itemsBySection: CanvasEvidenceBySection;
  loading: boolean;
} {
  const enabled = options?.enabled ?? true;
  const { accountId } = useAccountId();
  const [itemsBySection, setItemsBySection] = useState<CanvasEvidenceBySection>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId || !enabled) {
      setItemsBySection({});
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        // Only the active company's context chain: after a company switch the
        // evidence popovers must not resurrect the previous company's rows.
        const scope = await loadCompanyScope(accountId);
        const { data: versions, error } = await supabase
          .from("canvas_section_versions")
          .select("section_key, items, freshness_status, created_at")
          .eq("account_id", accountId)
          .is("competitor_id", null)
          .in("business_context_version_id", scope.contextIds)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error || !versions) return;

        // Keep only the newest version per section.
        const latest = new Map<CanvasSectionKey, { items: unknown; freshness: FreshnessStatus }>();
        for (const version of versions) {
          const key = version.section_key as CanvasSectionKey;
          if (!CANVAS_SECTION_KEYS.includes(key) || latest.has(key)) continue;
          latest.set(key, {
            items: version.items,
            freshness: (version.freshness_status ?? "unverified") as FreshnessStatus,
          });
        }

        const parsed = new Map<CanvasSectionKey, ParsedItem[]>();
        const evidenceIds = new Set<string>();
        for (const [key, version] of latest) {
          const items = parseVersionItems(version.items, version.freshness);
          if (items.length === 0) continue;
          parsed.set(key, items);
          for (const item of items) {
            for (const id of item.evidenceIds) evidenceIds.add(id);
          }
        }

        const evidenceById = await loadEvidence([...evidenceIds]);
        if (cancelled) return;

        const result: CanvasEvidenceBySection = {};
        for (const [key, items] of parsed) {
          result[key] = items.map((item) => ({
            text: item.text,
            confidence: item.confidence,
            freshness: item.freshness,
            evidence: item.evidenceIds
              .map((id) => evidenceById.get(id))
              .filter((entry): entry is CanvasEvidenceItem => Boolean(entry)),
          }));
        }
        setItemsBySection(result);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [accountId, enabled]);

  return { itemsBySection, loading };
}

interface ParsedItem {
  text: string;
  confidence: number | null;
  freshness: FreshnessStatus;
  evidenceIds: string[];
}

function parseVersionItems(value: unknown, freshness: FreshnessStatus): ParsedItem[] {
  if (!Array.isArray(value)) return [];
  const items: ParsedItem[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      items.push({ text: entry, confidence: null, freshness, evidenceIds: [] });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.text !== "string" || record.text.length === 0) continue;
    items.push({
      text: record.text,
      confidence: typeof record.confidence === "number" ? record.confidence : null,
      freshness,
      evidenceIds: Array.isArray(record.evidence_ids)
        ? record.evidence_ids.filter((id): id is string => typeof id === "string")
        : [],
    });
  }
  return items;
}

async function loadEvidence(ids: string[]): Promise<Map<string, CanvasEvidenceItem>> {
  const byId = new Map<string, CanvasEvidenceItem>();
  if (ids.length === 0) return byId;

  const { data, error } = await supabase
    .from("evidence_items")
    .select("id, title, source_name, source_url, source_date, excerpt")
    .in("id", ids);
  if (error || !data) return byId;

  for (const row of data) {
    byId.set(row.id, {
      id: row.id,
      title: row.title,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      sourceDate: row.source_date,
      excerpt: row.excerpt,
    });
  }
  return byId;
}
