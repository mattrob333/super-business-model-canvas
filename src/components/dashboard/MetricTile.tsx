import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type LucideIcon, ArrowUp, ArrowDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricTileProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  /** Plain-language explanation of what the metric means and where it comes from. */
  hint?: string;
}

export function MetricTile({ title, value, subtitle, icon: Icon, trend, trendValue, hint }: MetricTileProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-medium text-muted-foreground">{title}</p>
            {hint && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
                    aria-label={`What does ${title} mean?`}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-72 text-xs leading-relaxed">
                  {hint}
                </TooltipContent>
              </Tooltip>
            )}
          </span>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          {trend && trendValue && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                trend === "up" && "text-success",
                trend === "down" && "text-destructive",
                trend === "neutral" && "text-muted-foreground",
              )}
            >
              {trend === "up" && <ArrowUp className="h-3 w-3" />}
              {trend === "down" && <ArrowDown className="h-3 w-3" />}
              {trendValue}
            </span>
          )}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
