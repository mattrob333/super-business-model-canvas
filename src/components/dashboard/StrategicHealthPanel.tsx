import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StrategicHealthPanelProps {
  className?: string;
  /** Severity-weighted health score (0–100), or null when not yet assessed. */
  score?: number | null;
  /** Count of open (open / acknowledged / in_progress) gaps. */
  openGaps?: number;
  loading?: boolean;
}

export function StrategicHealthPanel({
  className,
  score = null,
  openGaps = 0,
  loading = false,
}: StrategicHealthPanelProps) {
  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Heart className="h-4 w-4" />
          Strategic Health
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : score !== null ? (
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-semibold tracking-tight">{score}</p>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {openGaps === 0
                ? "No open gaps affecting strategic health."
                : `Reduced by ${openGaps} open gap${openGaps === 1 ? "" : "s"} weighted by severity.`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Run a strategy playbook or canvas analysis to assess strategic health.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
