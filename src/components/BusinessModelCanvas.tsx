import { useState } from "react";
import { Edit as EditIcon, Info } from "lucide-react";
import { BMCSectionEditor } from "./BMCSectionEditor";

interface CanvasSection {
  title: string;
  items: string[];
  notes?: string;
}

interface BusinessModelCanvasProps {
  data: {
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
  };
  companyName: string;
  businessContext?: {
    industry: string;
    description: string;
    productsServices: string[];
    keyExecutives: { name: string; role: string }[];
    website: string;
  };
  onSectionUpdate?: (sectionTitle: string, updatedData: { items: string[]; notes: string }) => void;
  onEditorOpenChange?: (open: boolean) => void;
}

export const BusinessModelCanvas = ({ data, companyName, businessContext, onSectionUpdate, onEditorOpenChange }: BusinessModelCanvasProps) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedSection, setSelectedSection] = useState<CanvasSection | null>(null);
  const [viewedSections, setViewedSections] = useState<Set<string>>(new Set());
  const [editedSections, setEditedSections] = useState<Set<string>>(new Set());

  const handleEditorOpenChange = (open: boolean) => {
    setEditorOpen(open);
    onEditorOpenChange?.(open);
  };

  const getSectionKey = (title: string): string => {
    const mapping: Record<string, string> = {
      'Key Partners': 'keyPartners',
      'Key Activities': 'keyActivities',
      'Key Resources': 'keyResources',
      'Value Propositions': 'valuePropositions',
      'Customer Relationships': 'customerRelationships',
      'Channels': 'channels',
      'Customer Segments': 'customerSegments',
      'Cost Structure': 'costStructure',
      'Revenue Streams': 'revenueStreams'
    };
    return mapping[title] || title;
  };

  const handleSectionClick = (title: string, items: string[]) => {
    const sectionKey = getSectionKey(title);
    const notesKey = `${sectionKey}_notes` as keyof typeof data;
    const notes = data[notesKey] as string | undefined;
    setSelectedSection({ title, items, notes });
    handleEditorOpenChange(true);
    setViewedSections(prev => new Set(prev).add(title));
  };

  const handleSectionSave = (updatedData: { items: string[]; notes: string }) => {
    if (selectedSection && onSectionUpdate) {
      onSectionUpdate(selectedSection.title, updatedData);
      setSelectedSection({
        ...selectedSection,
        items: updatedData.items,
        notes: updatedData.notes
      });
      setEditedSections(prev => new Set(prev).add(selectedSection.title));
    }
  };

  const getReviewStatus = (title: string): 'not-viewed' | 'viewed' | 'edited' => {
    if (editedSections.has(title)) return 'edited';
    if (viewedSections.has(title)) return 'viewed';
    return 'not-viewed';
  };

  const CanvasCard = ({ title, items, span = "col-span-1 row-span-1", height = "h-[180px] sm:h-[200px]" }: { title: string; items: string[]; span?: string; height?: string }) => {
    const reviewStatus = getReviewStatus(title);
    const previewItems = items.slice(0, 3);
    const remainingCount = items.length - 3;
    
    return (
      <div 
        className={`card-mono ${span} ${height} flex flex-col p-3 sm:p-3.5 cursor-pointer hover:border-primary/50 transition-colors group`}
        onClick={() => handleSectionClick(title, items)}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="label-tech text-muted-foreground">{title}</h3>
            {reviewStatus === 'edited' && (
              <div className="w-2 h-2 rounded-full bg-primary" title="Edited" />
            )}
            {reviewStatus === 'viewed' && (
              <div className="w-2 h-2 rounded-full bg-primary/50" title="Viewed" />
            )}
          </div>
          <EditIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        
        <div className="flex-1 overflow-hidden">
          {items.length > 0 ? (
            <>
              <ul className="space-y-2">
                {previewItems.map((item, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 bg-primary rounded-full mt-1.5 flex-shrink-0" />
                    <span className="text-foreground/80 text-sm leading-snug line-clamp-2">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
              {remainingCount > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  +{remainingCount} more...
                </p>
              )}
            </>
          ) : (
          <p className="text-sm text-muted-foreground italic">
            No data yet. Click to add.
          </p>
        )}
      </div>
    </div>
    );
  };

  return (
    <>
      <div className="w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-6">
        <div>
          <span className="label-tech text-muted-foreground">Business Model Canvas</span>
          <h2 className="text-3xl font-semibold tracking-tight">Strategic Framework</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Strategic framework showing how the business creates, delivers, and captures value
          </p>
        </div>
        
        <div className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-4 py-3 flex items-start gap-3 max-w-xs flex-shrink-0">
          <Info className="w-5 h-5 text-[hsl(var(--primary))] flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-300">
            Click any section to expand, review, and refine with AI assistance
          </p>
        </div>
      </div>

          {/* Business Model Canvas - Top Rows */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 auto-rows-[180px] sm:auto-rows-[200px]">
            <CanvasCard title="Key Partners" items={data.keyPartners} span="col-span-1 row-span-2" height="h-full" />
            <CanvasCard title="Key Activities" items={data.keyActivities} span="col-span-1" height="h-full" />
            <CanvasCard title="Value Propositions" items={data.valuePropositions} span="col-span-1 row-span-2" height="h-full" />
            <CanvasCard title="Customer Relationships" items={data.customerRelationships} span="col-span-1" height="h-full" />
            <CanvasCard title="Customer Segments" items={data.customerSegments} span="col-span-1 row-span-2" height="h-full" />
            <CanvasCard title="Key Resources" items={data.keyResources} span="col-span-1" height="h-full" />
            <CanvasCard title="Channels" items={data.channels} span="col-span-1" height="h-full" />
          </div>
          
          {/* Bottom Row - Full Width 50/50 Split */}
          <div className="flex flex-col md:flex-row gap-[2px] mt-[2px]">
            <CanvasCard title="Cost Structure" items={data.costStructure} span="flex-1" height="h-[200px]" />
            <CanvasCard title="Revenue Streams" items={data.revenueStreams} span="flex-1" height="h-[200px]" />
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
};
