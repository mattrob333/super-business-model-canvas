import { ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="fixed bottom-4 left-4 right-4 sm:bottom-6 sm:right-6 sm:left-auto z-50 animate-fade-in">
      <Button
        onClick={onNavigate}
        size="lg"
        className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xl hover:scale-105 transition-all rounded-full px-4 py-4 sm:px-6 sm:py-6 font-semibold w-full sm:w-auto min-h-[44px] text-sm sm:text-base"
      >
        <span className="mr-2">Ready to Generate Insights</span>
        <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
      </Button>
    </div>
  );
};
