import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface StrategicHealthPanelProps {
  className?: string;
}

export function StrategicHealthPanel({ className }: StrategicHealthPanelProps) {
  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Heart className="h-4 w-4" />
          Strategic Health
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground">
          Run a strategy playbook or canvas analysis to assess strategic health.
        </p>
      </CardContent>
    </Card>
  );
}
