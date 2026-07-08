import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CANVAS_SECTION_KEYS,
  CANVAS_SECTION_LABELS,
  CANVAS_SECTION_PURPOSES,
  type CanvasSectionKey,
} from "@/components/canvas/section-types";
import { AGENT_ROSTER, ATLAS } from "@/lib/agent-roster";

/**
 * Slim top bar for the full-screen rooms (spec 02 "Route & entry"): back to
 * canvas, the current agent's door plate, and the room switcher — a mini BMC
 * map for jumping between rooms without returning to the canvas. The War Room
 * is the tenth stop: same bar, Atlas's door plate ("atlas" room key).
 */
export function WorkspaceTopBar({ room }: { room: CanvasSectionKey | "atlas" }) {
  const navigate = useNavigate();
  const isAtlas = room === "atlas";
  const current = isAtlas ? ATLAS : AGENT_ROSTER[room];
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

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 ${current.avatarClass}`}>
          <CurrentIcon className="h-3.5 w-3.5" />
        </span>
        {/* Section first, and the room must SAY what work happens in it —
            "Key Partners" is BMC jargon a first-time user can't act on
            (owner directive 2026-07-08). */}
        <p className="shrink-0 text-base font-bold leading-none">
          {isAtlas ? "War Room" : CANVAS_SECTION_LABELS[room]}
        </p>
        <span className="hidden h-4 w-px shrink-0 bg-border sm:block" aria-hidden />
        <p className="hidden min-w-0 truncate text-xs text-muted-foreground sm:block">
          {isAtlas
            ? "Your chief strategist reads the whole canvas and hands you the one move that matters most right now."
            : CANVAS_SECTION_PURPOSES[room]}
        </p>
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
                const active = key === room;
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
                      <span className="block truncate text-xs font-medium">{CANVAS_SECTION_LABELS[key]}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {entry.callsign} · {entry.role}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-1 border-t border-border pt-1">
              <button
                type="button"
                onClick={() => navigate("/war-room")}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${
                  isAtlas ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ${ATLAS.avatarClass}`}>
                  <ATLAS.icon className="h-3 w-3" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{ATLAS.callsign} — War Room</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{ATLAS.role}</span>
                </span>
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
