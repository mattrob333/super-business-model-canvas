import { useState } from "react";
import { MessageSquare } from "lucide-react";
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
  };

  const handleSectionSave = (updatedData: { items: string[]; notes: string }) => {
    if (selectedSection && onSectionUpdate) {
      onSectionUpdate(selectedSection.title, updatedData);
      setSelectedSection({
        ...selectedSection,
        items: updatedData.items,
        notes: updatedData.notes
      });
    }
  };

  const CanvasCard = ({ title, items, span = "col-span-1 row-span-1", height = "h-[200px]" }: { title: string; items: string[]; span?: string; height?: string }) => (
    <div
      onClick={() => handleSectionClick(title, items)}
      className={`card-mono card-mono-hover cursor-pointer ${span} ${height} group relative flex flex-col p-3.5`}
    >
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <MessageSquare className="h-5 w-5 text-primary" />
      </div>
      <div className="flex flex-col h-full">
        <h3 className="label-tech text-muted-foreground mb-3 flex-shrink-0">{title}</h3>
        <div className="flex-1 overflow-y-auto pr-1.5 scrollbar-dark">
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={index} className="flex items-start gap-2">
                <div className="h-1.5 w-1.5 bg-primary rounded-full mt-1.5 flex-shrink-0" />
                <span className="text-foreground/80 text-sm leading-snug">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="w-full max-w-7xl mx-auto">
        <div className="space-y-6">
          <div className="space-y-1">
            <span className="label-tech text-muted-foreground">Business Model Canvas</span>
            <h2 className="text-3xl font-semibold tracking-tight">Strategic Framework</h2>
            <p className="text-muted-foreground text-sm">Click any section to explore deeper insights</p>
          </div>

          {/* Business Model Canvas - Top Rows */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 auto-rows-[200px]">
            <CanvasCard title="Key Partners" items={data.keyPartners} span="col-span-1 row-span-2" height="h-full" />
            <CanvasCard title="Key Activities" items={data.keyActivities} span="col-span-1" height="h-full" />
            <CanvasCard title="Value Propositions" items={data.valuePropositions} span="col-span-1 row-span-2" height="h-full" />
            <CanvasCard title="Customer Relationships" items={data.customerRelationships} span="col-span-1" height="h-full" />
            <CanvasCard title="Customer Segments" items={data.customerSegments} span="col-span-1 row-span-2" height="h-full" />
            <CanvasCard title="Key Resources" items={data.keyResources} span="col-span-1" height="h-full" />
            <CanvasCard title="Channels" items={data.channels} span="col-span-1" height="h-full" />
          </div>
          
          {/* Bottom Row - Full Width 50/50 Split */}
          <div className="flex flex-col md:flex-row gap-3">
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
