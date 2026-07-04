import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { useAccountId } from "@/hooks/useAccountId";
import {
  CANVAS_SECTION_KEYS,
  type CanvasSectionKey,
} from "@/components/canvas/section-types";
import type {
  CanvasEvidenceItem,
  CanvasItemEvidence,
  FreshnessStatus,
} from "@/components/canvas/CanvasSectionCard";
import type { Database } from "@/integrations/supabase/types";

type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];

export type CompetitorCanvasBySection = Partial<
  Record<CanvasSectionKey, CanvasItemEvidence[]>
>;

export interface CompetitorMetric {
  metric_key: string;
  value: number;
  label: string | null;
  inputs: Record<string, unknown>;
  section_key: string | null;
  computed_at: string;
}

interface MetricRow {
  metric_key: string;
  value: number | string;
  label: string | null;
  inputs: Record<string, unknown> | null;
  section_key: string | null;
  computed_at: string;
}

export function useCompetitorCanvasEvidence(competitorId: string | undefined): {
  competitor: CompanyRow | null;
  itemsBySection: CompetitorCanvasBySection;
  metrics: CompetitorMetric[];
  loading: boolean;
} {
  const { accountId } = useAccountId();
  const [competitor, setCompetitor] = useState<CompanyRow | null>(null);
  const [itemsBySection, setItemsBySection] = useState<CompetitorCanvasBySection>({});
  const [metrics, setMetrics] = useState<CompetitorMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId || !competitorId) {
      setCompetitor(null);
      setItemsBySection({});
      setMetrics([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [companyRes, versionsRes, metricsRes] = await Promise.all([
          supabase
            .from("companies")
            .select("*")
            .eq("account_id", accountId)
            .eq("id", competitorId)
            .eq("is_competitor", true)
            .maybeSingle(),
          supabase
            .from("canvas_section_versions")
            .select("section_key, items, freshness_status, created_at")
            .eq("account_id", accountId)
            .eq("competitor_id", competitorId)
            .order("created_at", { ascending: false })
            .limit(200),
          supabaseUntyped
            .from<MetricRow>("metric_snapshots")
            .select("metric_key, value, label, inputs, section_key, computed_at")
            .eq("account_id", accountId)
            .in("metric_key", ["competitor.section_delta", "competitor.threat_index"])
            .order("computed_at", { ascending: false })
            .limit(100),
        ]);
        if (cancelled) return;

        setCompetitor(companyRes.error ? null : companyRes.data ?? null);

        const parsed = new Map<CanvasSectionKey, ParsedItem[]>();
        const evidenceIds = new Set<string>();
        if (!versionsRes.error && versionsRes.data) {
          const latest = new Map<CanvasSectionKey, { items: unknown; freshness: FreshnessStatus }>();
          for (const version of versionsRes.data) {
            const key = version.section_key as CanvasSectionKey;
            if (!CANVAS_SECTION_KEYS.includes(key) || latest.has(key)) continue;
            latest.set(key, {
              items: version.items,
              freshness: (version.freshness_status ?? "unverified") as FreshnessStatus,
            });
          }
          for (const [key, version] of latest) {
            const items = parseVersionItems(version.items, version.freshness);
            if (items.length === 0) continue;
            parsed.set(key, items);
            for (const item of items) {
              for (const id of item.evidenceIds) evidenceIds.add(id);
            }
          }
        }

        const evidenceById = await loadEvidence([...evidenceIds]);
        if (cancelled) return;

        const result: CompetitorCanvasBySection = {};
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
        setMetrics(
          metricsRes.error
            ? []
            : (metricsRes.data ?? [])
                .filter((metric) => metric.inputs && (metric.inputs as Record<string, unknown>).competitor_id === competitorId)
                .map((metric) => ({
                  metric_key: metric.metric_key,
                  value: Number(metric.value),
                  label: metric.label,
                  inputs: (metric.inputs ?? {}) as Record<string, unknown>,
                  section_key: metric.section_key,
                  computed_at: metric.computed_at,
                })),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [accountId, competitorId]);

  return { competitor, itemsBySection, metrics, loading };
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
