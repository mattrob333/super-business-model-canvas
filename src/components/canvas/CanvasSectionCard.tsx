import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Bot,
  FileCheck,
  AlertTriangle,
  Target,
  ChevronRight,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";

export type FreshnessStatus =
  | "fresh"
  | "stale"
  | "outdated"
  | "unverified";

export interface CanvasSectionMeta {
  /** Agent display name if an agent owns this section */
  agentName?: string | null;
  /** 0–1 confidence score */
  confidence?: number | null;
  /** Freshness of the data */
  freshness?: FreshnessStatus;
  /** Number of linked evidence items */
  evidenceCount?: number;
  /** Number of open gaps affecting this section */
  gapCount?: number;
  /** Whether this section has strategic notes */
  hasNotes?: boolean;
}

export interface CanvasSectionCardProps {
  title: string;
  items: string[];
  notes?: string;
  meta?: CanvasSectionMeta;
  /** Grid span classes */
  span?: string;
  height?: string;
  onClick?: () => void;
  /** Whether an agent analysis is running for this section */
  isAnalyzing?: boolean;
  /** Callback when user clicks "Analyze" */
  onAnalyze?: () => void;
  /** Error message from the last analysis run */
  analysisError?: string;
}

const freshnessConfig: Record<
  FreshnessStatus,
  { label: string; className: string }
> = {
  fresh: {
    label: "Fresh",
    className: "bg-success/10 text-success border-success/20",
  },
  stale: {
    label: "Stale",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  outdated: {
    label: "Outdated",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  unverified: {
    label: "Unverified",
    className: "bg-muted text-muted-foreground border-border",
  },
};

function confidenceLabel(score: number): string {
  if (score >= 0.8) return "High";
  if (score >= 0.5) return "Medium";
  return "Low";
}

function confidenceColor(score: number): string {
  if (score >= 0.8) return "text-success";
  if (score >= 0.5) return "text-warning";
  return "text-destructive";
}

export function CanvasSectionCard({
  title,
  items,
  notes,
  meta,
  span = "col-span-1 row-span-1",
  height = "h-[180px] sm:h-[200px]",
  onClick,
  isAnalyzing = false,
  onAnalyze,
  analysisError,
}: CanvasSectionCardProps) {
  const previewItems = items.slice(0, 3);
  const remainingCount = items.length - 3;
  const freshness = meta?.freshness ?? "unverified";
  const freshnessCfg = freshnessConfig[freshness];
  const confidence = meta?.confidence ?? null;

  const handleAnalyzeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAnalyze) {
      onAnalyze();
    } else {
      onClick?.();
    }
  };

  return (
    <Card
      className={cn(
        "relative flex flex-col p-3 sm:p-4 cursor-pointer transition-all duration-200 group overflow-hidden",
        "hover:border-primary/40 hover:shadow-md",
        span,
        height,
      )}
      onClick={onClick}
    >
      {/* Title */}
      <div className="mb-2 flex items-center gap-1.5 min-w-0 pr-1">
        <h3 className="text-xs sm:text-sm font-medium uppercase tracking-wide text-muted-foreground truncate">
          {title}
        </h3>
        {meta?.hasNotes || notes ? (
          <Target className="h-3.5 w-3.5 shrink-0 text-primary opacity-70" />
        ) : null}
      </div>

      {/* Analysis error banner */}
      {analysisError && !isAnalyzing && (
        <div className="mb-2 flex items-center gap-1 text-[10px] text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">{analysisError}</span>
        </div>
      )}

      {/* Loading overlay when analyzing */}
      {isAnalyzing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-[10px] text-muted-foreground">
              Agent analyzing…
            </span>
          </div>
        </div>
      )}

      {/* Meta badges row */}
      {(meta?.agentName ||
        confidence !== null ||
        freshness !== "unverified" ||
        (meta?.evidenceCount ?? 0) > 0 ||
        (meta?.gapCount ?? 0) > 0) && (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {meta?.agentName && (
            <Badge
              variant="outline"
              className="gap-0.5 px-1.5 py-0 text-[10px] font-normal"
            >
              <Bot className="h-2.5 w-2.5" />
              {meta.agentName}
            </Badge>
          )}
          {confidence !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[10px] font-medium",
                confidenceColor(confidence),
              )}
              title={`Confidence: ${Math.round(confidence * 100)}%`}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
              {confidenceLabel(confidence)}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 text-[10px] font-medium",
              freshnessCfg.className,
            )}
          >
            {freshnessCfg.label}
          </span>
          {(meta?.evidenceCount ?? 0) > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground"
              title={`${meta?.evidenceCount} evidence items`}
            >
              <FileCheck className="h-2.5 w-2.5" />
              {meta?.evidenceCount}
            </span>
          )}
          {(meta?.gapCount ?? 0) > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-destructive"
              title={`${meta?.gapCount} open gaps`}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              {meta?.gapCount}
            </span>
          )}
        </div>
      )}

      {/* Content: items preview */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {items.length > 0 ? (
          <>
            <ul className="space-y-1.5">
              {previewItems.map((item, index) => (
                <li key={index} className="flex items-start gap-1.5">
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="line-clamp-2 text-sm leading-snug text-foreground/80">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
            {remainingCount > 0 && (
              <p className="mt-1.5 inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                +{remainingCount} more
                <ChevronRight className="h-3 w-3" />
              </p>
            )}
          </>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No data yet. Click to add.
          </p>
        )}
      </div>

      {/* Analyze — bottom right */}
      <div className="mt-auto flex justify-end pt-2">
        {isAnalyzing ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            Analyzing…
          </span>
        ) : (
          <button
            type="button"
            onClick={handleAnalyzeClick}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/5 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={`Analyze ${title}`}
            aria-label={`Analyze ${title}`}
          >
            <Sparkles className="h-3 w-3" />
            Analyze
          </button>
        )}
      </div>
    </Card>
  );
}
