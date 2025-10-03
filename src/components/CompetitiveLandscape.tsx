import { ExternalLink, TrendingUp } from "lucide-react";

interface Competitor {
  name: string;
  description: string;
  website: string;
}

interface CompetitiveLandscapeProps {
  competitors: Competitor[];
}

export const CompetitiveLandscape = ({ competitors }: CompetitiveLandscapeProps) => {
  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="space-y-6">
        <div className="space-y-1">
          <span className="label-tech text-muted-foreground">Competitive Landscape</span>
          <h2 className="text-3xl font-semibold tracking-tight">Key Competitors</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {competitors.map((competitor, index) => (
            <div key={index} className="card-mono card-mono-hover">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 bg-primary rounded-full" />
                      <span className="label-tech text-primary">Competitor {index + 1}</span>
                    </div>
                    <h3 className="text-xl font-semibold">{competitor.name}</h3>
                  </div>
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                </div>

                <p className="text-foreground/80 text-sm leading-relaxed">
                  {competitor.description}
                </p>

                <a
                  href={competitor.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
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
