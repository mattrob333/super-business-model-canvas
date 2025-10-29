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
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
          <div className="flex items-center gap-3 text-sm">
            <ChevronDown className="w-5 h-5 text-primary animate-bounce" />
            <p className="text-foreground">
              Scroll down to review your business context before generating strategic insights
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
      <Button
        onClick={onNavigate}
        size="lg"
        className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xl hover:scale-105 transition-all rounded-full px-6 py-6 font-semibold"
      >
        <span className="mr-2">Ready to Generate Insights</span>
        <ArrowRight className="w-5 h-5" />
      </Button>
    </div>
  );
};
