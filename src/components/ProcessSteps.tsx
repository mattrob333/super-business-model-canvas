import { Search, Edit, Repeat } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const ProcessSteps = () => {
  return (
    <TooltipProvider>
      <div className="flex flex-row items-center justify-center gap-3 sm:gap-6 md:gap-8 mb-6 md:mb-8 px-4 overflow-x-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <ProcessStep 
                icon={<Search className="w-8 h-8 sm:w-10 md:w-12" />}
                label="AI Research"
                sublabel="60 seconds"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>We'll fetch and summarize public data about the company.</p>
          </TooltipContent>
        </Tooltip>
        
        <ArrowRight className="w-4 h-4 sm:w-5 md:w-6 text-muted-foreground flex-shrink-0 mb-8 sm:mb-10 md:mb-12" />
        
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <ProcessStep 
                icon={<Edit className="w-8 h-8 sm:w-10 md:w-12" />}
                label="You Refine"
                sublabel="5-10 minutes"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Review and edit for accuracy — these become your verified facts.</p>
          </TooltipContent>
        </Tooltip>
        
        <ArrowRight className="w-4 h-4 sm:w-5 md:w-6 text-muted-foreground flex-shrink-0 mb-8 sm:mb-10 md:mb-12" />
        
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <ProcessStep 
                icon={<Repeat className="w-8 h-8 sm:w-10 md:w-12" />}
                label="Reuse Forever"
                sublabel="Apply frameworks"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Your Context File powers strategy playbooks and reports.</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};

interface ProcessStepProps {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
}

const ProcessStep = ({ icon, label, sublabel }: ProcessStepProps) => {
  return (
    <div className="flex flex-col items-center gap-1 sm:gap-2 text-center flex-shrink-0">
      <div className="w-10 h-10 sm:w-12 md:w-14 sm:h-12 md:h-14 rounded-full bg-primary/20 flex items-center justify-center text-primary">
        {icon}
      </div>
      <div>
        <div className="font-semibold text-foreground text-xs sm:text-sm md:text-base">{label}</div>
        <div className="text-[10px] sm:text-xs text-muted-foreground">{sublabel}</div>
      </div>
    </div>
  );
};
