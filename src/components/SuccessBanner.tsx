import { CheckCircle } from "lucide-react";

interface SuccessBannerProps {
  companyName: string;
}

export const SuccessBanner = ({ companyName }: SuccessBannerProps) => {
  return (
    <div className="w-full max-w-7xl mx-auto mb-8">
      <div className="bg-gradient-to-r from-[hsl(var(--primary))]/10 to-transparent border-l-4 border-[hsl(var(--primary))] rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-[hsl(var(--primary))]/20 flex items-center justify-center shrink-0">
            <CheckCircle className="text-[hsl(var(--primary))] w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-[hsl(var(--primary))] mb-2">
              ✓ Source of Truth Created for {companyName}
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              Your AI-researched business context is ready. Click on any section below to review, edit, or refine details before generating strategic insights.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
