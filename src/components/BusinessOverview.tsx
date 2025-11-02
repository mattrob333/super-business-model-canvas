import { Globe, Briefcase, MessageSquare, User, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
    <div className="w-full max-w-7xl mx-auto space-y-6 sm:space-y-8">
      {/* Hero Header - Company Name + Tagline */}
      <div className="space-y-2 sm:space-y-3">
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-none">
          {data.name}
        </h1>
        
        {/* Industry Tagline */}
        <p className="text-base sm:text-lg md:text-xl text-primary font-medium">
          {data.industry}
        </p>
        
        {/* AI-generated microcopy */}
        <p className="text-sm text-muted-foreground mt-1">
          AI-generated profile — review and edit for accuracy.
        </p>
      </div>

      {/* Section Header with Edit Button */}
      <div className="flex items-center justify-between gap-2">
        <div className="label-tech text-muted-foreground">Business Overview — AI Drafted (Editable)</div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              onClick={() => setEditorOpen(true)} 
              size="sm" 
              variant="outline"
              className="h-9 px-3 gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Refine with AI</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Edit this section or chat with AI to refine descriptions and add missing details.</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Card Content */}
      <div 
        className="card-mono cursor-pointer md:cursor-default 
                   border border-white/[0.08] 
                   shadow-[0_8px_24px_rgba(0,0,0,0.4)]
                   hover:border-primary/50 hover:shadow-[0_10px_20px_rgba(0,0,0,0.35),0_0_20px_rgba(196,248,42,0.15)]
                   transition-all duration-300"
        onClick={() => window.innerWidth < 768 && setIsExpanded(!isExpanded)}
      >
        <div className="space-y-4 sm:space-y-6">
          {/* Description */}
          <div>
            <p className={`text-foreground/80 text-sm sm:text-base md:text-lg leading-loose ${
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
                      <div key={index} className="flex items-start gap-3 p-2 rounded-lg hover:bg-primary/5 transition-colors">
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
