import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Play, Target } from "lucide-react";
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
}

export const FrameworkDetailModal = ({
  isOpen,
  onClose,
  framework,
  onRunFramework,
  selectedAnalysis
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

            <div className="space-y-6">
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

              {/* Estimated Time */}
              <div>
                <h4 className="font-semibold mb-2">Estimated Time</h4>
                <p className="text-muted-foreground">{framework.estimated_time} minutes</p>
              </div>

              {/* Input Status */}
              {selectedAnalysis && (
                <div>
                  <h4 className="font-semibold mb-3">Inputs it will use</h4>
                  <div className="text-sm space-x-3">
                    <span className={availability.valueProps ? "text-green-600" : "text-muted-foreground"}>
                      Value Props {availability.valueProps ? "✓" : "•"}
                    </span>
                    <span className={availability.icp ? "text-green-600" : "text-muted-foreground"}>
                      ICP {availability.icp ? "✓" : "•"}
                    </span>
                    <span className={availability.channels ? "text-green-600" : "text-muted-foreground"}>
                      Channels {availability.channels ? "✓" : "•"}
                    </span>
                  </div>
                  
                  {hasMissingInputs && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-600">
                      <p className="font-medium">⚠️ Some inputs missing</p>
                      <p className="text-xs mt-1">
                        {!availability.icp && "ICP "}
                        {!availability.channels && "Channels "}
                        missing — add in Context first for best results.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 pb-6 pt-6">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={() => onRunFramework?.(framework.id)}
                className="gap-2"
                disabled={!onRunFramework}
              >
                <Play className="h-4 w-4" />
                Run Framework
              </Button>
            </DialogFooter>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
