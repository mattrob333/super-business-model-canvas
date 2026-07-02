import { Link } from "react-router-dom";
import { Building2, ArrowRight, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";

interface ActiveCompanyBannerProps {
  /** Where "Full analysis" should link — defaults to /canvas */
  analysisPath?: string;
  /** Optional secondary action label */
  secondaryLabel?: string;
  secondaryPath?: string;
}

/**
 * Shown on Dashboard / Canvas when a company analysis is loaded in session.
 * Gives users a clear way back to the full analysis view.
 */
export function ActiveCompanyBanner({
  analysisPath = "/canvas",
  secondaryLabel,
  secondaryPath,
}: ActiveCompanyBannerProps) {
  const { activeCompanyName } = useActiveWorkspace();

  if (!activeCompanyName) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Building2 className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            Active company
          </p>
          <p className="text-base font-semibold text-foreground">
            {activeCompanyName}
          </p>
          <p className="text-xs text-muted-foreground">
            Your analysis is saved in this session — open it anytime from here.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {secondaryLabel && secondaryPath && (
          <Button variant="outline" size="sm" asChild>
            <Link to={secondaryPath} className="gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5" />
              {secondaryLabel}
            </Link>
          </Button>
        )}
        <Button size="sm" asChild>
          <Link to={analysisPath} className="gap-1.5">
            Full analysis
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
