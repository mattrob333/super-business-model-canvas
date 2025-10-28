import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Lightbulb, Play, ArrowRight, Clock } from "lucide-react";
import { DUMMY_FRAMEWORKS } from "@/data/dummy-frameworks";

interface StrategyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  recommendations: any;
  companyName?: string;
  onSelectFramework: (frameworkId: string) => void;
}

export const StrategyDrawer = ({ 
  isOpen, 
  onClose, 
  recommendations, 
  companyName,
  onSelectFramework 
}: StrategyDrawerProps) => {
  if (!recommendations) return null;

  const getRelevanceBadgeColor = (relevance: string) => {
    switch(relevance.toLowerCase()) {
      case 'high': return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'critical': return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'medium': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:w-[1200px] sm:max-w-[85vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            AI Strategy Recommendations
          </SheetTitle>
          <SheetDescription>
            Based on your goals {companyName && `for ${companyName}`}
          </SheetDescription>
        </SheetHeader>

        {/* Key Strategic Insights */}
        <div className="mt-6">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Lightbulb className="h-4 w-4" />
            Key Strategic Insights
          </h3>
          <div className="space-y-3">
            {recommendations.insights.map((insight: string, idx: number) => (
              <div key={idx} className="flex gap-3 items-start">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">{insight}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recommended Frameworks */}
        <div className="mt-8">
          <h3 className="font-semibold mb-4">Recommended Frameworks</h3>
          <div className="space-y-3">
            {recommendations.frameworks.map((rec: any) => {
              const framework = DUMMY_FRAMEWORKS.find(f => f.id === rec.id);
              if (!framework) return null;

              return (
                <Card 
                  key={rec.id}
                  className="cursor-pointer hover:border-primary transition-all"
                  onClick={() => onSelectFramework(rec.id)}
                >
                  <CardHeader className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <CardTitle className="text-base">{framework.title}</CardTitle>
                      <Badge className={getRelevanceBadgeColor(rec.relevance)}>
                        {rec.relevance}
                      </Badge>
                    </div>
                    <CardDescription className="text-sm mb-2">
                      {rec.alignment}
                    </CardDescription>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Timeline: {rec.timeline}
                      </div>
                      <Button size="sm" variant="outline" className="h-7">
                        <Play className="h-3 w-3 mr-1" />
                        Run
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Execution Roadmap / Next Steps */}
        <div className="mt-8 p-4 bg-primary/5 rounded-lg border border-primary/20">
          <h3 className="font-semibold flex items-center gap-2 mb-3">
            <ArrowRight className="h-4 w-4" />
            Next Steps
          </h3>
          <ul className="space-y-2">
            {recommendations.nextSteps.map((step: string, idx: number) => (
              <li key={idx} className="flex gap-2 text-sm">
                <ArrowRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
};