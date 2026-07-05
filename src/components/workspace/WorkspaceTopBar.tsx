import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CANVAS_SECTION_KEYS,
  CANVAS_SECTION_LABELS,
  type CanvasSectionKey,
} from "@/components/canvas/section-types";
import { AGENT_ROSTER, ATLAS } from "@/lib/agent-roster";

/**
 * Slim top bar for the full-screen workspace rooms (spec 02 "Route & entry"):
 * back to canvas, the current agent's door plate, and the 9-dot switcher —
 * a mini BMC map for jumping between rooms without returning to the canvas.
 * The War Room is the visually distinct tenth stop, disabled until Phase 6.
 */
export function WorkspaceTopBar({ sectionKey }: { sectionKey: CanvasSectionKey }) {
  const navigate = useNavigate();
  const current = AGENT_ROSTER[sectionKey];
  const CurrentIcon = current.icon;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-3 sm:px-4">
      <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
        <Link to="/canvas">
          <ArrowLeft className="h-4 w-4" />
          Canvas
        </Link>
      </Button>

      <div className="h-5 w-px bg-border" aria-hidden />

      <div className="flex min-w-0 items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 ${current.avatarClass}`}>
          <CurrentIcon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">{current.callsign}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {CANVAS_SECTION_LABELS[sectionKey]}
          </p>
        </div>
      </div>

      <div className="ml-auto">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5" aria-label="Switch workspace">
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Rooms</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-2">
            <p className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Agent workspaces
            </p>
            <div className="grid grid-cols-1 gap-0.5">
              {CANVAS_SECTION_KEYS.map((key) => {
                const entry = AGENT_ROSTER[key];
                const Icon = entry.icon;
                const active = key === sectionKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => navigate(`/workspace/${key}`)}
                    className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${
                      active ? "bg-muted" : "hover:bg-muted/60"
                    }`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ${entry.avatarClass}`}>
                      <Icon className="h-3 w-3" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">{entry.callsign}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {CANVAS_SECTION_LABELS[key]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-1 border-t border-border pt-1">
              <button
                type="button"
                disabled
                title="The War Room opens with Atlas in Phase 6"
                className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-md px-2 py-1.5 text-left opacity-50"
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ${ATLAS.avatarClass}`}>
                  <ATLAS.icon className="h-3 w-3" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{ATLAS.callsign} — War Room</span>
                  <span className="block truncate text-[10px] text-muted-foreground">Coming with Phase 6</span>
                </span>
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
