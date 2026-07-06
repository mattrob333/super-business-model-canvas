import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { summarizePreviewItem } from "@/lib/canvas-preview";
import {
  Bot,
  FileCheck,
  AlertTriangle,
  Target,
  ChevronRight,
  Sparkles,
  Loader2,
  AlertCircle,
  ExternalLink,
  type LucideIcon,
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

export interface CanvasEvidenceItem {
  id: string;
  title: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  sourceDate?: string | null;
  excerpt?: string | null;
}

export interface CanvasItemEvidence {
  text: string;
  confidence?: number | null;
  freshness?: FreshnessStatus;
  evidence?: CanvasEvidenceItem[];
}

export interface CanvasSectionCardProps {
  title: string;
  items: Array<string | CanvasItemEvidence>;
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
  /** Max bullet items shown in preview (bottom row cards use fewer) */
  maxPreviewItems?: number;
  /** Tighter cards on the analysis results page — larger type, shorter bullets */
  compactPreview?: boolean;
  /** Tall pillar sections (2-row span) — show more text per bullet */
  tallPreview?: boolean;
  /** Section identity icon (the owning agent's motif) */
  icon?: LucideIcon;
  /** Accent text class for the icon (per-agent accent, spec 01) */
  iconAccentClass?: string;
  /** The visual hero of the canvas (Value Propositions) gets emphasis */
  hero?: boolean;
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
  maxPreviewItems = 3,
  compactPreview = false,
  tallPreview = false,
  icon: Icon,
  iconAccentClass,
  hero = false,
}: CanvasSectionCardProps) {
  const previewLimit = maxPreviewItems;
  const normalizedItems = items.map(normalizeCanvasItem);
  const previewItems = normalizedItems.slice(0, previewLimit);
  const remainingCount = Math.max(0, items.length - previewLimit);
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
        "relative flex flex-col cursor-pointer transition-all duration-200 group overflow-hidden",
        "hover:border-primary/40 hover:shadow-md",
        compactPreview ? "p-2.5 sm:p-3" : "p-3 sm:p-4",
        // The value proposition is the canvas's center of gravity — give it
        // a quiet emphasis so the eye lands there first.
        hero && "border-primary/30 bg-primary/[0.03]",
        span,
        height,
      )}
      onClick={onClick}
    >
      {/* Title — section identity: agent-accent icon + label */}
      <div className={cn("flex items-center gap-1.5 min-w-0 pr-6", compactPreview ? "mb-1.5" : "mb-2")}>
        {Icon && (
          <Icon className={cn("h-3.5 w-3.5 shrink-0", iconAccentClass ?? "text-primary")} />
        )}
        <h3
          className={cn(
            "truncate font-semibold uppercase tracking-wider text-primary",
            compactPreview ? "text-[10px] sm:text-xs" : "text-[11px] sm:text-xs",
          )}
        >
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
      <div className="min-h-0 flex-1 overflow-hidden pb-5">
        {items.length > 0 ? (
          <>
            <ul className={cn(compactPreview ? "space-y-1.5" : "space-y-2")}>
              {previewItems.map((item, index) => (
                <li key={index} className="flex items-start gap-2">
                  <div
                    className={cn(
                      "h-1 w-1 shrink-0 rounded-full bg-primary",
                      compactPreview ? "mt-2" : "mt-[9px]",
                    )}
                  />
                  <span
                    className={cn(
                      "text-foreground/85",
                      compactPreview
                        ? cn(
                            "text-sm leading-relaxed",
                            tallPreview ? "line-clamp-2" : "line-clamp-1",
                          )
                        : "line-clamp-2 text-sm leading-relaxed",
                    )}
                  >
                    {compactPreview
                      ? summarizePreviewItem(item.text, tallPreview ? 96 : 80)
                      : item.text}
                  </span>
                  {(item.evidence?.length ?? 0) > 0 && (
                    <EvidencePopover item={item} />
                  )}
                </li>
              ))}
            </ul>
            {remainingCount > 0 && (
              <p className="mt-1 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                +{remainingCount} more
                <ChevronRight className="h-3 w-3" />
              </p>
            )}
          </>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            No data yet. Click to add.
          </p>
        )}
      </div>

      {/* Sparkle — refine affordance, quiet until the card is hovered/focused
          (the header instruction carries discoverability; nine always-on
          sparkles read as noise). */}
      <div className="pointer-events-none absolute bottom-2 right-2">
        {isAnalyzing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <button
            type="button"
            onClick={handleAnalyzeClick}
            className="pointer-events-auto rounded p-1 text-primary/70 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={`Refine ${title} with AI`}
            aria-label={`Refine ${title} with AI`}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </Card>
  );
}

function normalizeCanvasItem(item: string | CanvasItemEvidence): CanvasItemEvidence {
  return typeof item === "string" ? { text: item } : item;
}

function EvidencePopover({ item }: { item: CanvasItemEvidence }) {
  const evidence = item.evidence ?? [];
  if (evidence.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className="ml-auto mt-0.5 shrink-0 rounded p-0.5 text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="View evidence"
          aria-label="View evidence"
        >
          <FileCheck className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 space-y-3 p-3 text-xs"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1">
          <p className="font-medium text-foreground">Evidence</p>
          <div className="flex items-center gap-2 text-muted-foreground">
            {typeof item.confidence === "number" && (
              <span>{Math.round(item.confidence * 100)}% confidence</span>
            )}
            {item.freshness && <span>{item.freshness}</span>}
          </div>
        </div>
        <div className="space-y-3">
          {evidence.map((entry) => (
            <div key={entry.id} className="space-y-1 border-t border-border/60 pt-2 first:border-t-0 first:pt-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium leading-snug text-foreground">{entry.title}</p>
                {entry.sourceUrl && (
                  <a
                    href={entry.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={(event) => event.stopPropagation()}
                    aria-label="Open evidence source"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {[entry.sourceName, entry.sourceDate].filter(Boolean).join(" - ")}
              </p>
              {entry.excerpt && (
                <p className="line-clamp-4 text-[11px] leading-relaxed text-foreground/80">
                  {entry.excerpt}
                </p>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
