import { Link } from "react-router-dom";
import { ExternalLink, FileText, Loader2, PencilLine } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cleanExcerpt } from "@/lib/clean-excerpt";
import { splitAssumption } from "@/lib/assumption";
import type { CanvasItemEvidence } from "@/components/canvas/CanvasSectionCard";
import type { CanvasSectionKey } from "@/components/canvas/section-types";
import { CANVAS_SECTION_LABELS } from "@/components/canvas/section-types";
import { AGENT_ROSTER } from "@/lib/agent-roster";

/**
 * Spec 02 zone 1b — the section's live canvas, physically present in the room.
 * Read view for slice 1: items with confidence dots (● ≥0.7 / ○ below),
 * freshness desaturation, and evidence popovers on the count badge. Inline
 * edit ships with a later 5B slice; "Edit on canvas" keeps the existing path
 * one click away meanwhile.
 */
export function SectionCanvasPanel({
  sectionKey,
  items,
  loading,
  onVerifyAssumption,
}: {
  sectionKey: CanvasSectionKey;
  items: CanvasItemEvidence[];
  loading: boolean;
  onVerifyAssumption?: (text: string) => void;
}) {
  const entry = AGENT_ROSTER[sectionKey];

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Section canvas
        </h2>
        <Link
          to="/canvas"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <PencilLine className="h-3 w-3" />
          Edit on canvas
        </Link>
      </div>
      <p className="mt-0.5 text-sm font-semibold">{CANVAS_SECTION_LABELS[sectionKey]}</p>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          No canvas items yet. Run the section analysis from the canvas to give{" "}
          {entry.callsign} something to work with.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item, index) => {
            const solid = (item.confidence ?? 0) >= 0.7;
            const stale = item.freshness === "stale" || item.freshness === "outdated";
            const evidence = item.evidence ?? [];
            const assumption = splitAssumption(item.text);
            return (
              <li
                key={`${index}-${item.text.slice(0, 24)}`}
                className={`flex items-start gap-2 text-sm leading-snug ${stale ? "opacity-60" : ""}`}
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    solid ? `bg-current ${entry.accentTextClass}` : "border border-muted-foreground/60"
                  }`}
                  title={
                    item.confidence === null
                      ? "No confidence score"
                      : `Confidence ${Math.round((item.confidence ?? 0) * 100)}%`
                  }
                />
                <span className="min-w-0 flex-1">
                  {assumption.assumed && onVerifyAssumption ? (
                    <button
                      type="button"
                      onClick={() => onVerifyAssumption(assumption.text)}
                      className="text-left underline-offset-2 hover:text-primary hover:underline"
                      title="Ask the agent to verify this assumption"
                    >
                      {assumption.text}
                    </button>
                  ) : (
                    assumption.text
                  )}
                  {assumption.assumed && (
                    <span className="ml-1.5 inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px align-middle text-[9px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      assumed
                    </span>
                  )}
                </span>
                {evidence.length > 0 && <EvidenceBadge evidence={evidence} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function EvidenceBadge({ evidence }: { evidence: NonNullable<CanvasItemEvidence["evidence"]> }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground"
          aria-label={`${evidence.length} evidence source${evidence.length > 1 ? "s" : ""}`}
        >
          <FileText className="h-2.5 w-2.5" />
          {evidence.length}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-3">
        {evidence.map((entry) => (
          <div key={entry.id} className="space-y-1">
            <p className="text-xs font-semibold leading-snug">{entry.title}</p>
            <p className="text-[10px] text-muted-foreground">
              {[entry.sourceName, entry.sourceDate ? new Date(entry.sourceDate).toLocaleDateString() : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {entry.excerpt && (
              <p className="line-clamp-3 text-[11px] leading-relaxed text-foreground/80">
                “{cleanExcerpt(entry.excerpt)}”
              </p>
            )}
            {entry.sourceUrl && (
              <a
                href={entry.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
              >
                Open source
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
