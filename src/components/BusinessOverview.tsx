import { Globe, Briefcase, MessageSquare, User } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BusinessOverviewEditor } from "@/components/BusinessOverviewEditor";

interface KeyExecutive {
  name: string;
  role: string;
}

interface BusinessOverviewProps {
  data: {
    name: string;
    industry: string;
    description: string;
    productsServices: string[];
    keyExecutives: KeyExecutive[];
    website: string;
    notes?: string;
  };
  onUpdate?: (data: BusinessOverviewProps['data']) => void;
}

export const BusinessOverview = ({ data, onUpdate }: BusinessOverviewProps) => {
  const [editorOpen, setEditorOpen] = useState(false);

  const handleSave = (updatedData: BusinessOverviewProps['data']) => {
    if (onUpdate) {
      onUpdate(updatedData);
    }
    setEditorOpen(false);
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="space-y-4">
          <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <span className="label-tech text-muted-foreground">Business Overview</span>
            <h2 className="text-4xl font-semibold tracking-tight leading-tight">{data.name}</h2>
          </div>
          <Button onClick={() => setEditorOpen(true)} size="sm" variant="outline">
            <MessageSquare className="h-4 w-4 mr-2" />
            Edit & Chat
          </Button>
        </div>

        <div className="card-mono">
          <div className="space-y-8">
            {/* Description */}
            <div>
              <p className="text-foreground/80 text-lg leading-relaxed">{data.description}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Key Facts */}
              <div className="space-y-4">
                <h3 className="label-tech text-muted-foreground">Key Facts</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Briefcase className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Industry</div>
                      <div className="text-foreground font-medium">{data.industry}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Globe className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Website</div>
                      <a 
                        href={data.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        {data.website}
                      </a>
                    </div>
                  </div>
                </div>

                {/* Key Executives */}
                <div className="pt-4 space-y-3">
                  <h3 className="label-tech text-muted-foreground">Key Leadership</h3>
                  <div className="space-y-2">
                    {data.keyExecutives.map((exec, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <User className="h-4 w-4 text-primary mt-1" />
                        <div className="flex-1">
                          <div className="text-foreground font-medium text-sm">{exec.name}</div>
                          <div className="text-xs text-muted-foreground">{exec.role}</div>
                        </div>
                      </div>
                    ))}
                    {data.keyExecutives.length === 0 && (
                      <p className="text-sm text-muted-foreground">No executives listed</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Products & Services */}
              <div className="space-y-4">
                <h3 className="label-tech text-muted-foreground">Products & Services</h3>
                <ul className="space-y-2">
                  {data.productsServices.map((item, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="h-1.5 w-1.5 bg-primary rounded-full mt-2" />
                      <span className="text-foreground/80">{item}</span>
                    </li>
                  ))}
                  {data.productsServices.length === 0 && (
                    <p className="text-sm text-muted-foreground">No products or services listed</p>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <BusinessOverviewEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        data={data}
        onSave={handleSave}
        companyName={data.name}
      />
    </div>
  );
};
