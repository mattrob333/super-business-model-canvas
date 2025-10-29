import { CheckCircle } from "lucide-react";

interface SuccessBannerProps {
  companyName: string;
  reviewedSections: number;
  totalSections: number;
}

export const SuccessBanner = ({ companyName, reviewedSections, totalSections }: SuccessBannerProps) => {
  const progress = totalSections > 0 ? Math.round((reviewedSections / totalSections) * 100) : 0;
  
  return (
    <div className="w-full max-w-7xl mx-auto mb-8">
      <div className="bg-gradient-to-r from-green-900/20 to-transparent border-l-4 border-green-500 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
            <CheckCircle className="text-green-500 w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-green-400 mb-2">
              ✓ Source of Truth Created for {companyName}
            </h3>
            <p className="text-muted-foreground mb-4 text-sm">
              Your AI-researched business context is ready. Review the sections below and use 'Edit & Chat' to refine any details before generating strategic insights.
            </p>
            
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-muted-foreground">Review Progress:</span>
              <div className="flex-1 min-w-[200px] max-w-xs">
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <span className="text-sm text-primary font-medium">
                {reviewedSections}/{totalSections} sections reviewed
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
