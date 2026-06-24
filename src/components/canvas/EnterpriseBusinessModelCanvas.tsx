import { useState, useCallback } from "react";
import { CanvasSectionCard } from "./CanvasSectionCard";
import type { CanvasSectionMeta } from "./CanvasSectionCard";
import {
  CANVAS_SECTION_KEYS,
  CANVAS_SECTION_LABELS,
  LEGACY_SECTION_KEYS,
} from "./section-types";
import type { CanvasSectionKey } from "./section-types";
import { BMCSectionEditor } from "@/components/BMCSectionEditor";
import { Info } from "lucide-react";

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

  const renderSection = (key: CanvasSectionKey) => {
    const { items, notes } = getSectionData(key);
    const meta = sectionMeta?.[key];
    return (
      <CanvasSectionCard
        key={key}
        title={CANVAS_SECTION_LABELS[key]}
        items={items}
        notes={notes}
        meta={meta}
        onClick={() => handleSectionClick(key)}
      />
    );
  };

  return (
    <>
      <div className="w-full max-w-7xl mx-auto">
        {/* Header */}
        <div className="hidden md:flex items-start justify-between mb-6 gap-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Business Model Canvas
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Explore how this organization creates, delivers, and captures
              value. Click any section to refine or expand with AI.
            </p>
          </div>
          <div className="bg-muted/50 border border-border rounded-lg px-4 py-3 flex items-start gap-3 max-w-xs flex-shrink-0">
            <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Click any section to expand. Agent badges and confidence
              indicators show AI-assisted coverage.
            </p>
          </div>
        </div>

        {/* Mobile header */}
        <div className="md:hidden mb-4">
          <h2 className="text-xl font-bold">Business Model Canvas</h2>
        </div>

        {/* Canvas Grid — standard BMC layout */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 auto-rows-[180px] sm:auto-rows-[200px]">
          {/* Row 1-2: Key Partners (left, 2 rows), Key Activities, Value Props (center, 2 rows), Customer Relationships, Customer Segments (right, 2 rows) */}
          <div className="md:col-span-1 md:row-span-2 h-full">
            {renderSection("key_partners")}
          </div>
          <div className="md:col-span-1 md:row-span-1 h-full">
            {renderSection("key_activities")}
          </div>
          <div className="md:col-span-1 md:row-span-2 h-full">
            {renderSection("value_propositions")}
          </div>
          <div className="md:col-span-1 md:row-span-1 h-full">
            {renderSection("customer_relationships")}
          </div>
          <div className="md:col-span-1 md:row-span-2 h-full">
            {renderSection("customer_segments")}
          </div>

          {/* Row 2: Key Resources, Channels */}
          <div className="md:col-span-1 md:row-span-1 h-full">
            {renderSection("key_resources")}
          </div>
          <div className="md:col-span-1 md:row-span-1 h-full">
            {renderSection("channels")}
          </div>
        </div>

        {/* Bottom Row — Cost Structure + Revenue Streams */}
        <div className="flex flex-col md:flex-row gap-2 mt-2">
          <div className="flex-1 h-[200px]">{renderSection("cost_structure")}</div>
          <div className="flex-1 h-[200px]">{renderSection("revenue_streams")}</div>
        </div>
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
