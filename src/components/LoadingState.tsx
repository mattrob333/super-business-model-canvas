import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface LoadingStateProps {
  companyName?: string;
  /** When true, renders without outer card wrapper (for embedding in UrlInput) */
  embedded?: boolean;
}

const LOADING_STEPS = [
  "Researching company website and public filings",
  "Analyzing business model and revenue streams",
  "Mapping competitive landscape",
  "Identifying key partnerships and resources",
  "Structuring strategic framework database",
];

export function LoadingState({ companyName, embedded = false }: LoadingStateProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) =>
        prev < LOADING_STEPS.length - 1 ? prev + 1 : prev,
      );
    }, 12000);

    return () => clearInterval(interval);
  }, []);

  const progress = ((currentStep + 1) / LOADING_STEPS.length) * 100;

  const content = (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h3 className="text-lg font-semibold tracking-tight sm:text-xl">
          Building strategic foundation
        </h3>
        <p className="text-sm text-muted-foreground">
          {companyName
            ? `Researching ${companyName} from public sources`
            : "Researching from public sources"}
        </p>
      </div>

      <div className="space-y-2">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Usually takes 45–60 seconds
        </p>
      </div>

      <ul className="space-y-2.5">
        {LOADING_STEPS.map((step, index) => {
          const isCompleted = index < currentStep;
          const isActive = index === currentStep;

          return (
            <li
              key={step}
              className={`flex items-start gap-3 transition-opacity duration-300 ${
                isActive ? "opacity-100" : isCompleted ? "opacity-80" : "opacity-45"
              }`}
            >
              <div
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  isCompleted
                    ? "bg-primary/15"
                    : isActive
                      ? "bg-primary/15"
                      : "bg-muted"
                }`}
              >
                {isCompleted ? (
                  <Check className="h-3 w-3 text-primary" />
                ) : isActive ? (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                ) : (
                  <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                )}
              </div>
              <span
                className={`text-sm leading-snug ${
                  isCompleted || isActive
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="w-full">
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        {content}
      </div>
    </div>
  );
}
