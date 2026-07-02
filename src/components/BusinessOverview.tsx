import {
  Globe,
  Briefcase,
  MessageSquare,
  User,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
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
  onUpdate?: (data: BusinessOverviewProps["data"]) => void;
  /** When true, hides the company title block (shown by parent instead) */
  hideHeader?: boolean;
}

export const BusinessOverview = ({
  data,
  onUpdate,
  hideHeader = false,
}: BusinessOverviewProps) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSave = (updatedData: BusinessOverviewProps["data"]) => {
    onUpdate?.(updatedData);
    setEditorOpen(false);
  };

  return (
    <div className="w-full">
      {!hideHeader && (
        <div className="mb-3 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {data.name}
          </h1>
          <p className="text-sm font-medium text-primary">{data.industry}</p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card/50">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Business overview
            </span>
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setEditorOpen(true)}
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 gap-1.5 px-2 text-xs"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Refine</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Edit or chat with AI to refine this overview.</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {!isExpanded ? (
          <p className="px-3 py-2.5 text-sm leading-relaxed text-muted-foreground line-clamp-2">
            {data.description}
          </p>
        ) : (
          <div className="space-y-4 p-3 sm:p-4">
            <p className="text-sm leading-relaxed text-foreground/85">
              {data.description}
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Key facts
                </h3>
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Industry
                      </div>
                      <div className="text-sm font-medium">{data.industry}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Globe className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Website
                      </div>
                      <a
                        href={data.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {data.website}
                      </a>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Key leadership
                  </h3>
                  {data.keyExecutives.length > 0 ? (
                    data.keyExecutives.map((exec, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <User className="mt-0.5 h-3.5 w-3.5 text-primary" />
                        <div>
                          <div className="text-sm font-medium">{exec.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {exec.role}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No executives listed
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Products &amp; services
                </h3>
                <ul className="space-y-1.5">
                  {data.productsServices.map((item, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <div className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                      <span className="text-sm text-foreground/85">{item}</span>
                    </li>
                  ))}
                  {data.productsServices.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No products or services listed
                    </p>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}
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
