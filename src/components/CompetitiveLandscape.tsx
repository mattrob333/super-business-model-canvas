import { useRef, useState } from "react";
import { ExternalLink, MessageCircle, Building2, Loader2, Radar } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCompetitorResearch } from "@/hooks/useCompetitorResearch";

interface Competitor {
  id?: string;
  name: string;
  description: string;
  website: string;
}

interface CompetitiveLandscapeProps {
  competitors: Competitor[];
  onSimilarCompanyChat?: (competitor: Competitor) => void;
}

function competitorDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const CompetitiveLandscape = ({
  competitors,
  onSimilarCompanyChat,
}: CompetitiveLandscapeProps) => {
  const { stateFor, startResearch, ready } = useCompetitorResearch(competitors);
  // Synchronous double-fire guard: researchingAll is React state, so a fast
  // double-click would pass the disabled check twice before the re-render
  // lands (same production bug pattern as WorkspaceActionsPanel.startingRef).
  const researchAllRef = useRef(false);
  const [researchingAll, setResearchingAll] = useState(false);

  // Snapshot of the cards that would show "Research this competitor" —
  // already-researched, starting and queued ones are never re-enqueued.
  const unresearched = competitors.filter((competitor) => {
    const research = stateFor(competitor);
    return !research.researched && research.status !== "starting" && research.status !== "queued";
  });
  const allResearched =
    competitors.length > 0 && competitors.every((competitor) => stateFor(competitor).researched);

  const handleResearchAll = async () => {
    if (researchAllRef.current || !ready || unresearched.length === 0) return;
    researchAllRef.current = true;
    setResearchingAll(true);
    try {
      // Sequentially enqueue every unresearched competitor — the worker queue
      // serializes execution; each startResearch flips that card's own
      // pending state exactly as a single-card click does. startResearch
      // never throws (it records per-card errors), so one failure does not
      // stop the rest of the batch.
      for (const competitor of unresearched) {
        await startResearch(competitor);
      }
    } finally {
      researchAllRef.current = false;
      setResearchingAll(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            Market competition
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
            Industry landscape
          </h2>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Comparable companies in this space — research one to build its evidence-cited canvas
            and score the gaps against yours. Skills that need competitive data unlock once
            research lands.
          </p>
        </div>
        {competitors.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            disabled={!ready || researchingAll || unresearched.length === 0}
            onClick={() => void handleResearchAll()}
          >
            {researchingAll ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Starting research…
              </>
            ) : (
              <>
                <Radar className="h-3.5 w-3.5" />
                {unresearched.length > 0
                  ? `Research all competitors (${unresearched.length})`
                  : allResearched
                    ? "All competitors researched"
                    : "Research queued"}
              </>
            )}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {competitors.map((competitor, index) => {
          const research = stateFor(competitor);
          return (
            <article
              key={`${competitor.website || competitor.name}-${index}`}
              className="group relative flex flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/35"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40 text-primary">
                    {research.logoUrl ? (
                      <img src={research.logoUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Competitor {index + 1}
                    </p>
                    <h3 className="truncate text-base font-semibold leading-tight text-foreground">
                      {competitor.name}
                    </h3>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {competitorDomain(competitor.website)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {typeof research.threatIndex === "number" && (
                    <span
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
                      title="Threat Index (latest gap-engine run)"
                    >
                      <Radar className="h-3 w-3 text-primary" />
                      {Math.round(research.threatIndex)}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onSimilarCompanyChat?.(competitor)}
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    aria-label={`Chat about ${competitor.name}`}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <p className="mb-4 flex-1 text-sm leading-relaxed text-foreground/75 line-clamp-4">
                {competitor.description}
              </p>

              <a
                href={competitor.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                Visit website
                <ExternalLink className="h-3.5 w-3.5" />
              </a>

              {research.researched ? (
                <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                  <Link to={`/competitors/${research.entityId}/canvas`}>Open canvas</Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full gap-1.5"
                  disabled={!ready || research.status === "starting" || research.status === "queued"}
                  onClick={() => startResearch(competitor)}
                >
                  {research.status === "starting" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Starting research…
                    </>
                  ) : research.status === "queued" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Researching — takes a few minutes
                    </>
                  ) : research.status === "error" ? (
                    <>
                      <Radar className="h-3.5 w-3.5" />
                      Retry research
                    </>
                  ) : (
                    <>
                      <Radar className="h-3.5 w-3.5" />
                      {research.entityId ? "Re-run research" : "Research this competitor"}
                    </>
                  )}
                </Button>
              )}
              {research.status === "error" && research.error && (
                <p className="mt-2 text-[11px] text-destructive" role="alert">
                  {research.error}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
};
