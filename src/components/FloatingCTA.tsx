import { ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface FloatingCTAProps {
  show: boolean;
  onNavigate: () => void;
  variant?: 'inline' | 'floating';
}

export const FloatingCTA = ({ show, onNavigate, variant = 'floating' }: FloatingCTAProps) => {
  if (!show) return null;

  if (variant === 'inline') {
    return (
      <div className="w-full max-w-7xl mx-auto mb-8">
      <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
          <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-primary animate-bounce flex-shrink-0" />
          <p className="text-foreground leading-snug">
            Scroll down to review your business context before generating strategic insights
          </p>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 animate-fade-in">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onNavigate}
            size="sm"
            className="rounded-full bg-primary px-4 font-medium text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
          >
            <span className="mr-1.5">Strategy insights</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Run AI-driven frameworks like SWOT, Ansoff, and Porter using this verified context.</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
