import { useState } from "react";
import { MessageSquare, ChevronDown, ChevronUp, Check, Edit as EditIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
}

export const BusinessModelCanvas = ({ data, companyName, businessContext, onSectionUpdate }: BusinessModelCanvasProps) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedSection, setSelectedSection] = useState<CanvasSection | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['Value Propositions']));
  const [viewedSections, setViewedSections] = useState<Set<string>>(new Set());
  const [editedSections, setEditedSections] = useState<Set<string>>(new Set());

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
    setEditorOpen(true);
    setEditedSections(prev => new Set(prev).add(title));
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

  const toggleSection = (title: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(title)) {
        newSet.delete(title);
      } else {
        newSet.add(title);
        setViewedSections(prevViewed => new Set(prevViewed).add(title));
      }
      return newSet;
    });
  };

  const getReviewStatus = (title: string): 'not-viewed' | 'viewed' | 'edited' => {
    if (editedSections.has(title)) return 'edited';
    if (viewedSections.has(title) || expandedSections.has(title)) return 'viewed';
    return 'not-viewed';
  };

  const CanvasCard = ({ title, items, span = "col-span-1 row-span-1", height = "h-[200px]" }: { title: string; items: string[]; span?: string; height?: string }) => {
    const isExpanded = expandedSections.has(title);
    const reviewStatus = getReviewStatus(title);
    
    return (
      <div className={`card-mono ${span} ${height} flex flex-col p-3.5`}>
        <div 
          onClick={() => toggleSection(title)}
          className="flex items-center justify-between mb-3 cursor-pointer group"
        >
          <div className="flex items-center gap-2">
            <h3 className="label-tech text-muted-foreground">{title}</h3>
            {reviewStatus === 'edited' && (
              <div className="w-2 h-2 rounded-full bg-primary" title="Edited" />
            )}
            {reviewStatus === 'viewed' && (
              <div className="w-2 h-2 rounded-full bg-primary/50" title="Viewed" />
            )}
          </div>
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            )}
          </div>
        </div>
        
        {isExpanded && (
          <div className="flex flex-col flex-1 animate-accordion-down">
            <div className="flex-1 overflow-y-auto pr-1.5 scrollbar-dark mb-3">
              <ul className="space-y-2">
                {items.map((item, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 bg-primary rounded-full mt-1.5 flex-shrink-0" />
                    <span className="text-foreground/80 text-sm leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                handleSectionClick(title, items);
              }}
              variant="outline"
              size="sm"
              className="w-full border-primary/30 hover:bg-primary/10 hover:border-primary"
            >
              <EditIcon className="w-4 h-4 mr-2" />
              Edit & Chat
              {reviewStatus === 'edited' && (
                <Check className="w-4 h-4 ml-2 text-primary" />
              )}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="w-full max-w-7xl mx-auto">
        <div className="space-y-3">
          <div className="space-y-1">
            <span className="label-tech text-muted-foreground">Business Model Canvas</span>
            <h2 className="text-3xl font-semibold tracking-tight">Strategic Framework</h2>
            <p className="text-muted-foreground text-sm">Click any section to explore deeper insights</p>
          </div>

          {/* Business Model Canvas - Top Rows */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 auto-rows-[200px]">
            <CanvasCard title="Key Partners" items={data.keyPartners} span="col-span-1 row-span-2" height="h-full" />
            <CanvasCard title="Key Activities" items={data.keyActivities} span="col-span-1" height="h-full" />
            <CanvasCard title="Value Propositions" items={data.valuePropositions} span="col-span-1 row-span-2" height="h-full" />
            <CanvasCard title="Customer Relationships" items={data.customerRelationships} span="col-span-1" height="h-full" />
            <CanvasCard title="Customer Segments" items={data.customerSegments} span="col-span-1 row-span-2" height="h-full" />
            <CanvasCard title="Key Resources" items={data.keyResources} span="col-span-1" height="h-full" />
            <CanvasCard title="Channels" items={data.channels} span="col-span-1" height="h-full" />
          </div>
          
          {/* Bottom Row - Full Width 50/50 Split */}
          <div className="flex flex-col md:flex-row gap-2">
            <CanvasCard title="Cost Structure" items={data.costStructure} span="flex-1" height="h-[200px]" />
            <CanvasCard title="Revenue Streams" items={data.revenueStreams} span="flex-1" height="h-[200px]" />
          </div>
        </div>
      </div>

      {selectedSection && (
        <BMCSectionEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          section={selectedSection}
          companyName={companyName}
          businessContext={businessContext}
          onSave={handleSectionSave}
        />
      )}
    </>
  );
};
