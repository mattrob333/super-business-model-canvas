import { Globe, Briefcase, MessageSquare, User, ChevronDown, ChevronUp } from "lucide-react";
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
  const [isExpanded, setIsExpanded] = useState(() => {
    // Collapsed on mobile (< 768px), expanded on desktop
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true; // Default to expanded for SSR
  });

  const handleSave = (updatedData: BusinessOverviewProps['data']) => {
    if (onUpdate) {
      onUpdate(updatedData);
    }
    setEditorOpen(false);
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="space-y-3 sm:space-y-4">
        {/* Header: Company Name + Edit Button */}
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-semibold tracking-tight leading-tight flex-1">
            {data.name}
          </h2>
          <Button 
            onClick={() => setEditorOpen(true)} 
            size="sm" 
            variant="outline"
            className="h-8 px-2 sm:px-3"
          >
            <MessageSquare className="h-3.5 w-3.5 sm:mr-2" />
            <span className="hidden sm:inline">Edit & Chat</span>
          </Button>
        </div>

        {/* Mobile Links Row - Only on mobile when collapsed */}
        {!isExpanded && (
          <div className="flex items-center gap-3 md:hidden">
            {data.website && (
              <a 
                href={data.website} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>Website</span>
              </a>
            )}
          </div>
        )}

        {/* Card Content */}
        <div 
          className="card-mono cursor-pointer md:cursor-default"
          onClick={() => window.innerWidth < 768 && setIsExpanded(!isExpanded)}
        >
          <div className="space-y-4 sm:space-y-6">
            {/* Description */}
            <div>
              <p className={`text-foreground/80 text-sm sm:text-base md:text-lg leading-relaxed ${
                !isExpanded ? 'line-clamp-5 sm:line-clamp-3' : ''
              }`}>
                {data.description}
              </p>
            </div>

            {/* Two-column grid - Collapsible on mobile */}
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 ${
              !isExpanded ? 'hidden md:grid' : ''
            }`}>
              {/* Left Column: Key Facts */}
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

                {/* Key Leadership - Only when expanded */}
                {isExpanded && (
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
                )}
              </div>

              {/* Right Column: Products & Services */}
              <div className="space-y-4">
                <h3 className="label-tech text-muted-foreground">Products & Services</h3>
                <ul className="space-y-2">
                  {/* First 2 products - Always visible */}
                  {data.productsServices.slice(0, 2).map((item, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="h-1.5 w-1.5 bg-primary rounded-full mt-2" />
                      <span className="text-foreground/80">{item}</span>
                    </li>
                  ))}
                  
                  {/* Remaining products - Only when expanded */}
                  {isExpanded && data.productsServices.slice(2).map((item, index) => (
                    <li key={index + 2} className="flex items-start gap-3">
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

            {/* Toggle indicator - Mobile only */}
            {!isExpanded && (
              <div className="flex justify-center md:hidden pt-1">
                <ChevronDown className="h-4 w-4 text-muted-foreground animate-pulse" />
              </div>
            )}
            
            {/* Close button when expanded - Mobile only */}
            {isExpanded && (
              <div className="flex justify-center md:hidden pt-2">
                <Button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(false);
                  }} 
                  variant="ghost" 
                  size="sm"
                  className="gap-2 text-muted-foreground hover:text-foreground"
                >
                  <ChevronUp className="h-4 w-4" />
                  <span>Close</span>
                </Button>
              </div>
            )}
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
