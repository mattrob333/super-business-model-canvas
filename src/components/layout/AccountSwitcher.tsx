import { useNavigate } from "react-router-dom";
import { Building2, ChevronDown, FolderOpen, LayoutGrid, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useActiveAnalysis } from "@/hooks/useActiveAnalysis";
import { clearActiveAnalysis } from "@/lib/active-analysis";
import { clearActiveWorkspaceName } from "@/lib/active-workspace";

/**
 * The workspace switcher is a real menu now: open the active company, jump
 * to saved companies, or start over. "New company" clears every session
 * pointer and hard-loads /canvas so the fresh hero is guaranteed — no stale
 * component state can keep the old company on screen (owner finding
 * 2026-07-06: there was no path to a clean slate).
 */
export function AccountSwitcher() {
  const navigate = useNavigate();
  const { workspaceLabel, activeCompanyName } = useActiveWorkspace();
  const { activeAnalysis } = useActiveAnalysis();
  const hasActiveCompany = Boolean(activeCompanyName && activeAnalysis?.data);

  const startNewCompany = () => {
    clearActiveAnalysis();
    clearActiveWorkspaceName();
    try {
      sessionStorage.removeItem("loadedAnalysis");
    } catch {
      // sessionStorage may be unavailable
    }
    window.location.assign("/canvas");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 w-full justify-start gap-2 px-2">
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm">{workspaceLabel}</span>
          <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {hasActiveCompany ? `Working on ${activeCompanyName}` : "No company selected"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hasActiveCompany && (
          <DropdownMenuItem onClick={() => navigate("/canvas")} className="gap-2">
            <LayoutGrid className="h-4 w-4" />
            Open canvas
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => navigate("/my-analyses")} className="gap-2">
          <FolderOpen className="h-4 w-4" />
          Saved companies
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={startNewCompany} className="gap-2">
          <Plus className="h-4 w-4" />
          New company
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
