import { useState, useMemo } from "react";
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
} from "@/components/canvas/section-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info, Grid3X3, Sparkles } from "lucide-react";

/**
 * Standalone Canvas Workspace page (/canvas).
 *
 * This is the enterprise-grade BMC workspace. It renders all 9 sections
 * using the new CanvasSectionCard with agent badges, confidence indicators,
 * evidence counts, and gap badges.
 *
 * Data flow:
 * - Currently reads from legacy saved_analyses JSON (backward compatible)
 * - Will be upgraded to read canvas_section_versions table in a later phase
 * - The section card meta (agent, confidence, evidence, gaps) is currently
 *   empty/defaulted — it will be populated when agent runs start producing
 *   canvas_section_versions rows
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

function getSectionItems(
  data: LegacyCanvasData | null,
  sectionKey: string,
): string[] {
  if (!data) return [];
  const legacyKey = LEGACY_SECTION_KEYS[sectionKey as keyof typeof LEGACY_SECTION_KEYS];
  const items = data[legacyKey as keyof LegacyCanvasData];
  return Array.isArray(items) ? items : [];
}

function getSectionNotes(
  data: LegacyCanvasData | null,
  sectionKey: string,
): string | undefined {
  if (!data) return undefined;
  const legacyKey = LEGACY_SECTION_KEYS[sectionKey as keyof typeof LEGACY_SECTION_KEYS];
  const notesKey = `${legacyKey}_notes` as keyof LegacyCanvasData;
  return data[notesKey] as string | undefined;
}

export default function Canvas() {
  const navigate = useNavigate();
  const [activeVersion, setActiveVersion] = useState<number | null>(null);

  // Placeholder: no data yet — in later phases this comes from
  // business_context_versions + canvas_section_versions queries
  const canvasData: LegacyCanvasData | null = null;
  const sectionMetas: Partial<Record<string, CanvasSectionMeta>> = {};

  const totalItems = useMemo(() => {
    if (!canvasData) return 0;
    return CANVAS_SECTION_KEYS.reduce((sum, key) => {
      return sum + getSectionItems(canvasData, key).length;
    }, 0);
  }, [canvasData]);

  const sectionsWithGaps = useMemo(() => {
    return CANVAS_SECTION_KEYS.filter(
      (key) => (sectionMetas[key]?.gapCount ?? 0) > 0,
    ).length;
  }, [sectionMetas]);

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
        {activeVersion !== null && (
          <Badge variant="secondary">Context v{activeVersion}</Badge>
        )}
      </div>

      {/* Empty state when no canvas data */}
      {!canvasData && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Grid3X3 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No canvas yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Run a business analysis to generate your first Business Model
              Canvas. Once created, agent-assisted sections will appear here with
              confidence scores, evidence links, and gap indicators.
            </p>
            <Button onClick={() => navigate("/analyze")} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Start New Analysis
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Canvas grid — 5 columns on desktop */}
      {canvasData && (
        <>
          {/* Top rows: 5-column grid with tall side sections */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 auto-rows-[200px]">
            {CANVAS_SECTION_KEYS.slice(0, 7).map((sectionKey) => {
              const isTall = TALL_SECTIONS.has(sectionKey);
              return (
                <CanvasSectionCard
                  key={sectionKey}
                  title={CANVAS_SECTION_LABELS[sectionKey]}
                  items={getSectionItems(canvasData, sectionKey)}
                  notes={getSectionNotes(canvasData, sectionKey)}
                  meta={sectionMetas[sectionKey]}
                  span={isTall ? "col-span-1 row-span-2" : "col-span-1 row-span-1"}
                  height="h-full"
                  onClick={() => navigate("/analyze")}
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
                items={getSectionItems(canvasData, sectionKey)}
                notes={getSectionNotes(canvasData, sectionKey)}
                meta={sectionMetas[sectionKey]}
                span="flex-1"
                height="h-[200px]"
                onClick={() => navigate("/analyze")}
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
                freshness, linked evidence count, and open gaps. Click any section
                to edit items and notes. Canvas data is versioned — changes
                create new versions tracked in the context store.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
