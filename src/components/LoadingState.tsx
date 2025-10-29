import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface LoadingStateProps {
  companyName?: string;
}

const LOADING_STEPS = [
  "Researching company website and public filings",
  "Analyzing business model and revenue streams",
  "Mapping competitive landscape",
  "Identifying key partnerships and resources",
  "Structuring strategic framework database"
];

export const LoadingState = ({ companyName }: LoadingStateProps) => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < LOADING_STEPS.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 12000); // 12 seconds per step

    return () => clearInterval(interval);
  }, []);

  const progress = ((currentStep + 1) / LOADING_STEPS.length) * 100;

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="card-mono">
        <div className="flex flex-col items-center py-12 px-6 space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-semibold">Building Strategic Foundation...</h2>
            <p className="text-muted-foreground">
              {companyName ? `Researching ${companyName} from public sources` : "Researching from public sources"}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full max-w-md">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-1000 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Steps Checklist */}
          <div className="w-full max-w-md space-y-3">
            {LOADING_STEPS.map((step, index) => {
              const isCompleted = index < currentStep;
              const isActive = index === currentStep;
              
              return (
                <div 
                  key={index}
                  className={`flex items-start gap-3 transition-all duration-300 ${
                    isActive ? 'opacity-100' : isCompleted ? 'opacity-70' : 'opacity-40'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    isCompleted 
                      ? 'bg-primary/20' 
                      : isActive 
                        ? 'bg-primary/20 animate-pulse' 
                        : 'bg-white/10'
                  }`}>
                    {isCompleted ? (
                      <Check className="w-3 h-3 text-primary animate-scale-in" />
                    ) : isActive ? (
                      <Loader2 className="w-3 h-3 text-primary animate-spin" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                    )}
                  </div>
                  <span className={`text-sm ${
                    isCompleted || isActive ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            This usually takes 45-60 seconds
          </p>
        </div>
      </div>
    </div>
  );
};
