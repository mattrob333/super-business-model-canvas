import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Play, Target } from "lucide-react";
import { DUMMY_FRAMEWORKS, getCategoryColor } from "@/data/dummy-frameworks";

interface FrameworkDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  frameworkId: string | null;
  onRunFramework?: (frameworkId: string) => void;
}

export const FrameworkDetailModal = ({
  isOpen,
  onClose,
  frameworkId,
  onRunFramework
}: FrameworkDetailModalProps) => {
  if (!frameworkId) return null;

  const framework = DUMMY_FRAMEWORKS.find(f => f.id === frameworkId);
  if (!framework) return null;

  const IconComponent = framework.icon;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
          {/* Overview */}
          <div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Target className="h-4 w-4" />
              What is it?
            </h4>
            <p className="text-muted-foreground">{framework.description}</p>
          </div>

          {/* When to Use */}
          <div>
            <h4 className="font-semibold mb-3">When to Use This Framework</h4>
            <ul className="space-y-2">
              {framework.whenToUse.map((use, idx) => (
                <li key={idx} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{use}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* What You'll Get */}
          <div>
            <h4 className="font-semibold mb-3">What You'll Get</h4>
            <ul className="space-y-2">
              {framework.whatYouGet.map((output, idx) => (
                <li key={idx} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="text-primary mt-0.5">✓</span>
                  <span>{output}</span>
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
              {framework.departments.map((dept) => (
                <Badge key={dept} variant="secondary">
                  {dept}
                </Badge>
              ))}
            </div>
          </div>

          {/* Time & Complexity */}
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Estimated Time</p>
              <p className="text-sm text-muted-foreground">
                {framework.estimatedTime} minutes
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
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
      </DialogContent>
    </Dialog>
  );
};