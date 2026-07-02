import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Play, Target, Clock, Layers } from "lucide-react";
import { getCategoryColor } from "@/data/dummy-frameworks";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Framework {
  id: string;
  title: string;
  category: string;
  description: string;
  estimated_time: number;
  departments: string[];
  when_to_use: string[];
  icon?: any;
}

interface FrameworkDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  framework: Framework | null;
  onRunFramework?: (frameworkId: string) => void;
  selectedAnalysis?: any;
  strategicGoal?: string;
}

export const FrameworkDetailModal = ({
  isOpen,
  onClose,
  framework,
  onRunFramework,
  selectedAnalysis,
  strategicGoal,
}: FrameworkDetailModalProps) => {
  if (!framework) return null;

  const IconComponent = framework.icon || Target;

  // Check input availability
  const getInputAvailability = () => {
    if (!selectedAnalysis) return { valueProps: false, icp: false, channels: false };
    
    const analysisData = selectedAnalysis.analysis_data;
    const canvas = analysisData?.canvas || {};
    
    return {
      valueProps: canvas.valuePropositions && canvas.valuePropositions.length > 0,
      icp: canvas.customerSegments && canvas.customerSegments.length > 0,
      channels: canvas.channels && canvas.channels.length > 0,
    };
  };

  const availability = getInputAvailability();
  const hasMissingInputs = !availability.icp || !availability.channels;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0">
        <ScrollArea className="max-h-[85vh] px-6 [&>[data-radix-scroll-area-viewport]]:max-h-[85vh]">
          <div className="py-6">
            <DialogHeader>
              <div className="flex items-start gap-4 mb-4">
                <div className={`p-3 rounded-lg ${getCategoryColor(framework.category)} border`}>
                  <IconComponent className="h-8 w-8" />
                </div>
                <div className="flex-1">
                  <DialogTitle className="text-2xl mb-2">{framework.title}</DialogTitle>
                  <DialogDescription className="text-base">
                    {framework.description}
                  </DialogDescription>
                  <Badge className={`mt-2 ${getCategoryColor(framework.category)}`}>
                    {framework.category}
                  </Badge>
                </div>
              </div>
            </DialogHeader>

            {/* Stat row */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Clock className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Est. Time</div>
                  <div className="text-sm font-semibold">{framework.estimated_time} min</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Layers className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Departments</div>
                  <div className="text-sm font-semibold">{(framework.departments || []).length || "—"}</div>
                </div>
              </div>
            </div>

            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="inputs">Inputs</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6 pt-5">
                {/* When to Use */}
                <div>
                  <h4 className="font-semibold mb-3">When to Use This Framework</h4>
                  <ul className="space-y-2">
                    {(framework.when_to_use || []).map((use, idx) => (
                      <li key={idx} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{use}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Departments Involved */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Departments Involved
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {(framework.departments || []).map((dept) => (
                      <Badge key={dept} variant="secondary">
                        {dept}
                      </Badge>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="inputs" className="space-y-3 pt-5">
                {selectedAnalysis ? (
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-semibold mb-3">AI will use from your context</h4>
                      <div className="text-sm space-x-3">
                        <span className={availability.valueProps ? "text-success" : "text-muted-foreground"}>
                          Value Props {availability.valueProps ? "✓" : "•"}
                        </span>
                        <span className={availability.icp ? "text-success" : "text-muted-foreground"}>
                          ICP {availability.icp ? "✓" : "•"}
                        </span>
                        <span className={availability.channels ? "text-success" : "text-muted-foreground"}>
                          Channels {availability.channels ? "✓" : "•"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Company: <span className="font-medium text-foreground">{selectedAnalysis.company_name}</span>
                        {" — "}full business model canvas, profile, and competitors are sent to the AI.
                      </p>
                      {strategicGoal && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Goal: <span className="text-foreground">{strategicGoal}</span>
                        </p>
                      )}
                    </div>

                    {hasMissingInputs && (
                      <div className="mt-3 p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm text-warning">
                        <p className="font-medium">⚠️ Some inputs missing</p>
                        <p className="text-xs mt-1">
                          {!availability.icp && "ICP "}
                          {!availability.channels && "Channels "}
                          missing — add in Context first for best results.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Select a company context to preview which inputs this framework will use.</p>
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="gap-2 pb-6 pt-6">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={() => onRunFramework?.(framework.id)}
                className="gap-2"
                disabled={!onRunFramework || !selectedAnalysis}
              >
                <Play className="h-4 w-4" />
                Run with AI
              </Button>
            </DialogFooter>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
