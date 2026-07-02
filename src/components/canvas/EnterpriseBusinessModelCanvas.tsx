import { useState, useCallback } from "react";
import { CanvasSectionCard } from "./CanvasSectionCard";
import { CanvasGridFrame } from "./CanvasGridFrame";
import type { CanvasSectionMeta } from "./CanvasSectionCard";
import {
  CANVAS_SECTION_KEYS,
  CANVAS_SECTION_LABELS,
  LEGACY_SECTION_KEYS,
  CANVAS_SECTION_GRID_PLACEMENT,
} from "./section-types";
import type { CanvasSectionKey } from "./section-types";
import { BMCSectionEditor } from "@/components/BMCSectionEditor";

/** Two-row pillar sections — extra vertical room for all bullets */
const TALL_PILLAR_SECTIONS = new Set<CanvasSectionKey>([
  "key_partners",
  "value_propositions",
  "customer_segments",
]);

/**
 * Legacy data shape from saved_analyses.analysis_data JSON.
 * Keys are camelCase.
 */
export interface LegacyCanvasData {
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

export interface EnterpriseBusinessModelCanvasProps {
  data: LegacyCanvasData;
  companyName: string;
  businessContext?: {
    industry: string;
    description: string;
    productsServices: string[];
    keyExecutives: { name: string; role: string }[];
    website: string;
  };
  /** Optional metadata per section (agent name, confidence, evidence, gaps) */
  sectionMeta?: Partial<Record<CanvasSectionKey, CanvasSectionMeta>>;
  onSectionUpdate?: (
    sectionKey: CanvasSectionKey,
    updatedData: { items: string[]; notes: string },
  ) => void;
  onEditorOpenChange?: (open: boolean) => void;
  /** Tighter grid for analysis results — fits more on one screen */
  compact?: boolean;
}

interface SelectedSection {
  title: string;
  items: string[];
  notes?: string;
  sectionKey: CanvasSectionKey;
}

export function EnterpriseBusinessModelCanvas({
  data,
  companyName,
  businessContext,
  sectionMeta,
  onSectionUpdate,
  onEditorOpenChange,
  compact = false,
}: EnterpriseBusinessModelCanvasProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedSection, setSelectedSection] =
    useState<SelectedSection | null>(null);

  const handleEditorOpenChange = useCallback(
    (open: boolean) => {
      setEditorOpen(open);
      onEditorOpenChange?.(open);
    },
    [onEditorOpenChange],
  );

  const getSectionData = useCallback(
    (key: CanvasSectionKey): { items: string[]; notes?: string } => {
      const legacyKey = LEGACY_SECTION_KEYS[key];
      const notesKey = `${legacyKey}_notes` as keyof LegacyCanvasData;
      return {
        items: (data[legacyKey as keyof LegacyCanvasData] as string[]) ?? [],
        notes: data[notesKey] as string | undefined,
      };
    },
    [data],
  );

  const handleSectionClick = useCallback(
    (key: CanvasSectionKey) => {
      const { items, notes } = getSectionData(key);
      setSelectedSection({
        title: CANVAS_SECTION_LABELS[key],
        items,
        notes,
        sectionKey: key,
      });
      handleEditorOpenChange(true);
    },
    [getSectionData, handleEditorOpenChange],
  );

  const handleSectionSave = useCallback(
    (updatedData: { items: string[]; notes: string }) => {
      if (selectedSection && onSectionUpdate) {
        onSectionUpdate(selectedSection.sectionKey, updatedData);
        setSelectedSection({
          ...selectedSection,
          items: updatedData.items,
          notes: updatedData.notes,
        });
      }
    },
    [selectedSection, onSectionUpdate],
  );

  const renderSection = (
    key: CanvasSectionKey,
    height: string,
    maxPreviewItems?: number,
  ) => {
    const { items, notes } = getSectionData(key);
    const meta = sectionMeta?.[key];
    const isTallPillar = TALL_PILLAR_SECTIONS.has(key);
    const previewCount = compact
      ? isTallPillar
        ? items.length
        : (maxPreviewItems ?? 3)
      : (maxPreviewItems ?? 3);

    return (
      <CanvasSectionCard
        key={key}
        title={CANVAS_SECTION_LABELS[key]}
        items={items}
        notes={notes}
        meta={meta}
        span={CANVAS_SECTION_GRID_PLACEMENT[key]}
        height={height}
        maxPreviewItems={previewCount}
        compactPreview={compact}
        tallPreview={compact && isTallPillar}
        onClick={() => handleSectionClick(key)}
      />
    );
  };

  const topRowHeight = compact ? "h-[136px] md:h-full" : "h-[180px] md:h-full";
  const bottomRowHeight = compact ? "h-[168px] md:h-[176px]" : "h-[200px]";
  const gridRowClass = compact
    ? "md:auto-rows-[minmax(136px,1fr)]"
    : "md:auto-rows-[200px]";

  return (
    <>
      <div className="w-full">
        {!compact && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
              Business Model Canvas
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Click a section or the{" "}
              <span className="font-medium text-primary">✦</span> icon to refine
              with AI.
            </p>
          </div>
        )}

        {compact && (
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Business Model Canvas
            </h2>
            <p className="text-[10px] text-muted-foreground">
              Click a section or <span className="text-primary">✦</span> to refine
            </p>
          </div>
        )}

        <CanvasGridFrame className={compact ? "p-2 sm:p-2.5" : undefined}>
          <div
            className={`grid grid-cols-1 md:grid-cols-5 gap-1.5 md:gap-2 ${gridRowClass}`}
          >
            {CANVAS_SECTION_KEYS.slice(0, 7).map((key) =>
              renderSection(key, topRowHeight),
            )}
          </div>

          <div className="flex flex-col md:flex-row gap-1.5 md:gap-2">
            {CANVAS_SECTION_KEYS.slice(7).map((key) => (
              <div key={key} className="flex-1">
                {renderSection(key, bottomRowHeight, 3)}
              </div>
            ))}
          </div>
        </CanvasGridFrame>
      </div>

      {selectedSection && (
        <BMCSectionEditor
          open={editorOpen}
          onOpenChange={handleEditorOpenChange}
          section={selectedSection}
          companyName={companyName}
          businessContext={businessContext}
          onSave={handleSectionSave}
        />
      )}
    </>
  );
}
