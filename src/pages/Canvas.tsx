import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CanvasSectionCard,
  type CanvasSectionMeta,
  type FreshnessStatus,
} from "@/components/canvas/CanvasSectionCard";
import {
  CANVAS_SECTION_KEYS,
  CANVAS_SECTION_LABELS,
  LEGACY_SECTION_KEYS,
  CANVAS_SECTION_AGENT_KEYS,
} from "@/components/canvas/section-types";
import type { CanvasSectionKey } from "@/components/canvas/section-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info, Grid3X3, Sparkles, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccountId } from "@/hooks/useAccountId";
import { useCanvasSectionRun } from "@/hooks/useCanvasSectionRun";
import { toast } from "sonner";

/**
 * Standalone Canvas Workspace page (/canvas).
 *
 * Enterprise-grade BMC workspace with 9 sections rendered using
 * CanvasSectionCard. Supports agent-assisted analysis runs via the
 * AgentRuntime interface (Phase 6 vertical slice).
 *
 * Data flow:
 * - Reads canvas_section_versions from the database (latest per section)
 * - Falls back to legacy saved_analyses JSON if no versioned data exists
 * - "Analyze" button on each card triggers MockAgentRuntime.startRun()
 * - Run creates agent_runs record → completes → writes canvas_section_versions
 * - UI refreshes to show the agent-produced analysis
 */

interface LegacyCanvasData {
  keyPartners: string[];
  keyActivities: string[];
  keyResources: string[];
  valuePropositions: string[];
  customerRelationships: string[];
  channels: string[];
  customerSegments: string[];
  costStructure: string[];
  revenueStreams: string[];
  keyPartners_notes?: string;
  keyActivities_notes?: string;
  keyResources_notes?: string;
  valuePropositions_notes?: string;
  customerRelationships_notes?: string;
  channels_notes?: string;
  customerSegments_notes?: string;
  costStructure_notes?: string;
  revenueStreams_notes?: string;
}

// Grid layout: which sections span 2 rows (taller) in the 5-column grid
const TALL_SECTIONS = new Set([
  "key_partners",
  "value_propositions",
  "customer_segments",
]);

// ─── Types for canvas_section_versions data ─────────────────────────────────

interface CanvasSectionVersion {
  id: string;
  section_key: string;
  section_title: string | null;
  items: string[] | { items: string[] } | unknown;
  notes: string | null;
  confidence: number | null;
  freshness_status: FreshnessStatus;
  last_verified_at: string | null;
  created_by_agent_profile_id: string | null;
  created_at: string;
}

interface AgentProfileBrief {
  id: string;
  display_name: string;
  agent_key: string;
  assigned_sections: string[];
}

/**
 * Normalizes the `items` field from the DB (JSON) to a string array.
 * The items column is Json — it may be a string[] or an object with items.
 */
function normalizeItems(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (raw && typeof raw === "object" && "items" in raw) {
    const inner = (raw as { items: unknown }).items;
    if (Array.isArray(inner)) return inner as string[];
  }
  return [];
}

export default function Canvas() {
  const navigate = useNavigate();
  const { accountId, loading: accountLoading } = useAccountId();
  const {
    runSectionAnalysis,
    isSectionRunning,
    getSectionError,
    getSectionResult,
  } = useCanvasSectionRun();

  const [sectionVersions, setSectionVersions] = useState<
    Record<string, CanvasSectionVersion>
  >({});
  const [agentProfiles, setAgentProfiles] = useState<
    Record<string, AgentProfileBrief>
  >({});
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load canvas_section_versions + agent_profiles from DB
  const loadCanvasData = useCallback(async () => {
    if (accountLoading || !accountId) {
      setVersionsLoading(false);
      return;
    }

    setVersionsLoading(true);
    try {
      // Fetch latest canvas_section_version per section_key
      const [versionsRes, profilesRes] = await Promise.all([
        supabase
          .from("canvas_section_versions")
          .select(
            "id, section_key, section_title, items, notes, confidence, freshness_status, last_verified_at, created_by_agent_profile_id, created_at",
          )
          .eq("account_id", accountId)
          .order("created_at", { ascending: false }),
        supabase
          .from("agent_profiles")
          .select("id, display_name, agent_key, assigned_sections")
          .eq("account_id", accountId),
      ]);

      // Deduplicate: keep only the latest version per section_key
      const latestPerSection: Record<string, CanvasSectionVersion> = {};
      if (versionsRes.data) {
        for (const row of versionsRes.data as CanvasSectionVersion[]) {
          if (!latestPerSection[row.section_key]) {
            latestPerSection[row.section_key] = row;
          }
        }
      }
      setSectionVersions(latestPerSection);

      // Index agent profiles by agent_key for section meta
      const profilesByKey: Record<string, AgentProfileBrief> = {};
      if (profilesRes.data) {
        for (const p of profilesRes.data as AgentProfileBrief[]) {
          profilesByKey[p.agent_key] = p;
        }
      }
      setAgentProfiles(profilesByKey);
    } catch (err) {
      console.error("Failed to load canvas data:", err);
    } finally {
      setVersionsLoading(false);
    }
  }, [accountId, accountLoading]);

  useEffect(() => {
    void loadCanvasData();
  }, [loadCanvasData, refreshKey]);

  // Refresh canvas data when a run completes (lastResults changes)
  const lastResultKeys = Object.keys(getSectionResult);
  const lastResultJson = lastResultKeys
    .map((k) => `${k}:${getSectionResult[k as CanvasSectionKey]?.runId}`)
    .join(",");

  useEffect(() => {
    if (lastResultKeys.length > 0) {
      void loadCanvasData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResultJson]);

  // Build section meta from agent profiles + version data
  const sectionMetas = useMemo(() => {
    const metas: Partial<Record<string, CanvasSectionMeta>> = {};
    for (const sectionKey of CANVAS_SECTION_KEYS) {
      const agentKey = CANVAS_SECTION_AGENT_KEYS[sectionKey];
      const profile = agentProfiles[agentKey];
      const version = sectionVersions[sectionKey];

      metas[sectionKey] = {
        agentName: profile?.display_name ?? null,
        confidence: version?.confidence ?? null,
        freshness: version?.freshness_status ?? "unverified",
        hasNotes: !!version?.notes,
      };
    }
    return metas;
  }, [sectionVersions, agentProfiles]);

  // Get items for a section — from DB version, or from hook result, or empty
  const getSectionItems = useCallback(
    (sectionKey: CanvasSectionKey): string[] => {
      // If a run just completed, show the result
      const result = getSectionResult(sectionKey);
      if (result) return result.items;

      // Otherwise, use the DB version
      const version = sectionVersions[sectionKey];
      if (version) return normalizeItems(version.items);

      return [];
    },
    [sectionVersions, getSectionResult],
  );

  const getSectionNotes = useCallback(
    (sectionKey: CanvasSectionKey): string | undefined => {
      const result = getSectionResult(sectionKey);
      if (result) return result.notes;

      const version = sectionVersions[sectionKey];
      return version?.notes ?? undefined;
    },
    [sectionVersions, getSectionResult],
  );

  const totalItems = useMemo(() => {
    return CANVAS_SECTION_KEYS.reduce((sum, key) => {
      return sum + getSectionItems(key).length;
    }, 0);
  }, [getSectionItems]);

  const sectionsWithGaps = useMemo(() => {
    return CANVAS_SECTION_KEYS.filter(
      (key) => (sectionMetas[key]?.gapCount ?? 0) > 0,
    ).length;
  }, [sectionMetas]);

  const hasCanvasData = totalItems > 0 || Object.keys(sectionVersions).length > 0;
  const isAnalyzingAny = CANVAS_SECTION_KEYS.some((k) => isSectionRunning(k));

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    toast.info("Refreshing canvas data…");
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Business Model Canvas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Strategic framework overview with agent-assisted analysis, evidence
            tracking, and gap detection.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={versionsLoading || isAnalyzingAny}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${versionsLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/analyze")}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Run New Analysis
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="gap-1.5">
          <Grid3X3 className="h-3 w-3" />
          {totalItems} items across 9 sections
        </Badge>
        {sectionsWithGaps > 0 && (
          <Badge variant="destructive" className="gap-1.5">
            {sectionsWithGaps} sections with open gaps
          </Badge>
        )}
        {isAnalyzingAny && (
          <Badge variant="secondary" className="gap-1.5">
            <Sparkles className="h-3 w-3 animate-pulse" />
            Agent analysis in progress…
          </Badge>
        )}
      </div>

      {/* Empty state when no canvas data */}
      {!hasCanvasData && !versionsLoading && !accountLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Grid3X3 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No canvas yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Click <span className="font-medium text-primary">Analyze</span> on
              any section below to run an agent analysis, or start a full
              business analysis to generate all sections at once.
            </p>
            <Button onClick={() => navigate("/analyze")} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Start New Analysis
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Canvas grid — always show sections so users can run per-section analysis */}
      {(hasCanvasData || !versionsLoading) && (
        <>
          {/* Top rows: 5-column grid with tall side sections */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 auto-rows-[200px]">
            {CANVAS_SECTION_KEYS.slice(0, 7).map((sectionKey) => {
              const isTall = TALL_SECTIONS.has(sectionKey);
              return (
                <CanvasSectionCard
                  key={sectionKey}
                  title={CANVAS_SECTION_LABELS[sectionKey]}
                  items={getSectionItems(sectionKey)}
                  notes={getSectionNotes(sectionKey)}
                  meta={sectionMetas[sectionKey]}
                  span={isTall ? "col-span-1 row-span-2" : "col-span-1 row-span-1"}
                  height="h-full"
                  onClick={() => navigate("/analyze")}
                  isAnalyzing={isSectionRunning(sectionKey)}
                  onAnalyze={() => void runSectionAnalysis(sectionKey)}
                  analysisError={getSectionError(sectionKey)}
                />
              );
            })}
          </div>

          {/* Bottom row: Cost Structure + Revenue Streams (50/50) */}
          <div className="flex flex-col md:flex-row gap-3">
            {CANVAS_SECTION_KEYS.slice(7).map((sectionKey) => (
              <CanvasSectionCard
                key={sectionKey}
                title={CANVAS_SECTION_LABELS[sectionKey]}
                items={getSectionItems(sectionKey)}
                notes={getSectionNotes(sectionKey)}
                meta={sectionMetas[sectionKey]}
                span="flex-1"
                height="h-[200px]"
                onClick={() => navigate("/analyze")}
                isAnalyzing={isSectionRunning(sectionKey)}
                onAnalyze={() => void runSectionAnalysis(sectionKey)}
                analysisError={getSectionError(sectionKey)}
              />
            ))}
          </div>

          {/* Info panel */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                About This Canvas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Each section card shows agent ownership, confidence level, data
                freshness, linked evidence count, and open gaps. Click{" "}
                <span className="font-medium text-primary">Analyze</span> to run
                an agent analysis on a section — this creates an{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  agent_runs
                </code>{" "}
                record and saves the result as a new{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  canvas_section_versions
                </code>{" "}
                entry. View all runs in the{" "}
                <button
                  onClick={() => navigate("/activity")}
                  className="text-primary hover:underline"
                >
                  Activity page
                </button>
                .
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
