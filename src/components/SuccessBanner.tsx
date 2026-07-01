import { CheckCircle } from "lucide-react";

interface SuccessBannerProps {
  companyName: string;
}

export const SuccessBanner = ({ companyName }: SuccessBannerProps) => {
  return (
    <div className="w-full max-w-7xl mx-auto mb-8">
      <div className="bg-primary/5 border-l-4 border-primary rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <CheckCircle className="text-primary w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-primary mb-2">
              ✓ Source of Truth Created for {companyName}
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your AI-researched business context is ready. Click on any section below to review, edit, or refine details before generating strategic insights.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
