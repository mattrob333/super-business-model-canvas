import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Bot,
  FileCheck,
  AlertTriangle,
  Target,
  Edit3,
  ChevronRight,
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
}: CanvasSectionCardProps) {
  const previewItems = items.slice(0, 3);
  const remainingCount = items.length - 3;
  const freshness = meta?.freshness ?? "unverified";
  const freshnessCfg = freshnessConfig[freshness];
  const confidence = meta?.confidence ?? null;

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
      {/* Header row: title + edit icon */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <h3 className="text-xs sm:text-sm font-medium uppercase tracking-wide text-muted-foreground truncate">
            {title}
          </h3>
          {meta?.hasNotes || notes ? (
            <Target className="w-3.5 h-3.5 text-primary opacity-70 flex-shrink-0" />
          ) : null}
        </div>
        <Edit3 className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
      </div>

      {/* Meta badges row */}
      {(meta?.agentName ||
        confidence !== null ||
        freshness !== "unverified" ||
        (meta?.evidenceCount ?? 0) > 0 ||
        (meta?.gapCount ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-1 mb-2">
          {meta?.agentName && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 font-normal gap-0.5"
            >
              <Bot className="w-2.5 h-2.5" />
              {meta.agentName}
            </Badge>
          )}
          {confidence !== null && (
            <span
              className={cn(
                "text-[10px] font-medium inline-flex items-center gap-0.5",
                confidenceColor(confidence),
              )}
              title={`Confidence: ${Math.round(confidence * 100)}%`}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
              {confidenceLabel(confidence)}
            </span>
          )}
          <span
            className={cn(
              "text-[10px] font-medium inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full border",
              freshnessCfg.className,
            )}
          >
            {freshnessCfg.label}
          </span>
          {(meta?.evidenceCount ?? 0) > 0 && (
            <span
              className="text-[10px] font-medium inline-flex items-center gap-0.5 text-muted-foreground"
              title={`${meta?.evidenceCount} evidence items`}
            >
              <FileCheck className="w-2.5 h-2.5" />
              {meta?.evidenceCount}
            </span>
          )}
          {(meta?.gapCount ?? 0) > 0 && (
            <span
              className="text-[10px] font-medium inline-flex items-center gap-0.5 text-destructive"
              title={`${meta?.gapCount} open gaps`}
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              {meta?.gapCount}
            </span>
          )}
        </div>
      )}

      {/* Content: items preview */}
      <div className="flex-1 overflow-hidden">
        {items.length > 0 ? (
          <>
            <ul className="space-y-1.5">
              {previewItems.map((item, index) => (
                <li key={index} className="flex items-start gap-1.5">
                  <div className="h-1.5 w-1.5 bg-primary rounded-full mt-1.5 flex-shrink-0" />
                  <span className="text-foreground/80 text-sm leading-snug line-clamp-2">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
            {remainingCount > 0 && (
              <p className="text-xs text-muted-foreground mt-1.5 inline-flex items-center gap-0.5">
                +{remainingCount} more
                <ChevronRight className="w-3 h-3" />
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No data yet. Click to add.
          </p>
        )}
      </div>
    </Card>
  );
}
