import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { ChatDrawer } from "./ChatDrawer";

interface CanvasSection {
  title: string;
  items: string[];
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
  };
  companyName: string;
}

export const BusinessModelCanvas = ({ data, companyName }: BusinessModelCanvasProps) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSection, setSelectedSection] = useState<CanvasSection | null>(null);

  const handleSectionClick = (title: string, items: string[]) => {
    setSelectedSection({ title, items });
    setDrawerOpen(true);
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

          {/* Single Grid - Business Model Canvas */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <CanvasCard title="Key Partners" items={data.keyPartners} span="col-span-1 row-span-2" height="h-[400px]" />
            <CanvasCard title="Key Activities" items={data.keyActivities} span="col-span-1" height="h-[200px]" />
            <CanvasCard title="Value Propositions" items={data.valuePropositions} span="col-span-1 row-span-2" height="h-[400px]" />
            <CanvasCard title="Customer Relationships" items={data.customerRelationships} span="col-span-1" height="h-[200px]" />
            <CanvasCard title="Customer Segments" items={data.customerSegments} span="col-span-1 row-span-2" height="h-[400px]" />
            <CanvasCard title="Key Resources" items={data.keyResources} span="col-span-1" height="h-[200px]" />
            <CanvasCard title="Channels" items={data.channels} span="col-span-1" height="h-[200px]" />
            <div className="col-span-1 md:col-span-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <CanvasCard title="Cost Structure" items={data.costStructure} height="h-[200px]" />
              <CanvasCard title="Revenue Streams" items={data.revenueStreams} height="h-[200px]" />
            </div>
          </div>
        </div>
      </div>

      <ChatDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        section={selectedSection}
        companyName={companyName}
      />
    </>
  );
};
