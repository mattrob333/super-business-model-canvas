import { useEffect, useState } from "react";
import { CheckCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SuccessBannerProps {
  companyName: string;
  /** Auto-hide after this many ms (default 5s) */
  durationMs?: number;
}

export const SuccessBanner = ({
  companyName,
  durationMs = 5000,
}: SuccessBannerProps) => {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  const dismiss = () => {
    setExiting(true);
    window.setTimeout(() => setVisible(false), 300);
  };

  useEffect(() => {
    const timer = window.setTimeout(dismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed top-16 right-4 z-50 max-w-sm animate-in fade-in slide-in-from-top-2 duration-300",
        exiting && "animate-out fade-out slide-out-to-top-2 duration-300",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-card px-3 py-2.5 shadow-lg">
        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            Source of truth created
          </p>
          <p className="truncate text-xs text-muted-foreground">{companyName}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
