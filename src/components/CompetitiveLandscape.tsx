import { ExternalLink, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Competitor {
  name: string;
  description: string;
  website: string;
}

interface CompetitiveLandscapeProps {
  competitors: Competitor[];
  onSimilarCompanyChat?: (competitor: Competitor) => void;
}

export const CompetitiveLandscape = ({ competitors, onSimilarCompanyChat }: CompetitiveLandscapeProps) => {
  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="space-y-6">
        <div className="space-y-1">
          <span className="label-tech text-muted-foreground">Industry Landscape</span>
          <h2 className="text-3xl font-semibold tracking-tight">Similar Companies</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {competitors.map((competitor, index) => (
            <div key={index} className="card-mono">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 bg-primary rounded-full" />
                      <span className="label-tech text-primary">Company {index + 1}</span>
                    </div>
                    <h3 className="text-xl font-semibold">{competitor.name}</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onSimilarCompanyChat?.(competitor)}
                    className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <MessageCircle className="h-5 w-5" />
                  </Button>
                </div>

                <p className="text-foreground/80 text-sm leading-relaxed">
                  {competitor.description}
                </p>

                <a
                  href={competitor.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors hover:underline relative z-10 cursor-pointer"
                >
                  <span>Visit Website</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
