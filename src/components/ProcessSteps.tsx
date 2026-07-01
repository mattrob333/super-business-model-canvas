import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const STEPS = [
  {
    label: "AI Research",
    detail: "~60 sec",
    tip: "We gather and summarize public data about the company.",
  },
  {
    label: "You Refine",
    detail: "5–10 min",
    tip: "Review and edit for accuracy — these become your verified facts.",
  },
  {
    label: "Reuse Forever",
    detail: "Playbooks",
    tip: "Your Context File powers strategy frameworks and reports.",
  },
] as const;

export function ProcessSteps() {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto w-full max-w-md">
        <div className="relative flex items-start justify-between">
          {/* Connector line behind step circles */}
          <div
            className="absolute left-[16%] right-[16%] top-4 h-px bg-border"
            aria-hidden="true"
          />

          {STEPS.map((step, index) => (
            <Tooltip key={step.label}>
              <TooltipTrigger asChild>
                <div className="relative z-10 flex w-[30%] cursor-default flex-col items-center gap-2 text-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary">
                    {index + 1}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-foreground sm:text-sm">
                      {step.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground sm:text-xs">
                      {step.detail}
                    </p>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="max-w-[200px] text-xs">{step.tip}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
