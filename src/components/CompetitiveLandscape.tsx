import { ExternalLink, MessageCircle, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

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
  return (
    <div className="w-full">
      <div className="mb-4 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
          Market competition
        </p>
        <h2 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
          Industry landscape
        </h2>
        <p className="max-w-2xl text-xs text-muted-foreground">
          Comparable companies in this space — analyze or compare strategy.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {competitors.map((competitor, index) => (
          <article
            key={index}
            className="group relative flex flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/35"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-primary">
                  <Building2 className="h-4 w-4" />
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onSimilarCompanyChat?.(competitor)}
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                aria-label={`Chat about ${competitor.name}`}
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
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
            {competitor.id && (
              <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                <Link to={`/competitors/${competitor.id}/canvas`}>
                  Open canvas
                </Link>
              </Button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
};
