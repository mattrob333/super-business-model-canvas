import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Maximize2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ATLAS } from "@/lib/atlas";
import { AtlasChat } from "@/components/atlas/AtlasChat";
import { BriefingCard } from "@/components/atlas/BriefingCard";
import { safeGet, safeSet, useAtlasBriefing } from "@/components/atlas/useAtlasBriefing";

/**
 * Spec 12 §6 — Atlas's collapsible right dock. Collapsed it is a slim tab on
 * the right edge; expanded it holds the State of the Union briefing and the
 * War Room thread, beside the canvas it is helping to fill (Atlas is not a
 * tenth room). The briefing machinery lives in useAtlasBriefing, shared with
 * the full-page War Room; parents only decide whether a company exists.
 */

const DOCK_OPEN_KEY = "atlas:dock-open";

export function AtlasDock({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const navigate = useNavigate();
  const {
    accountId,
    profileId,
    profileError,
    briefing,
    briefingLoading,
    briefingError,
    refreshing,
    refreshError,
    refreshStalled,
    skillTitle,
    hasUnseen,
    markSeen,
    requestBriefing,
  } = useAtlasBriefing();

  // Atlas is a copilot, not a drawer: default OPEN on desktop (the canvas
  // shares the row with it) unless the user has explicitly closed it before.
  const [open, setOpen] = useState(() => {
    const stored = safeGet(DOCK_OPEN_KEY);
    if (stored !== null) return stored === "true";
    return typeof window !== "undefined" && window.innerWidth >= 1024;
  });
  // The chat mounts lazily on first expand and stays mounted after, so a
  // collapsed dock costs zero thread queries but reopening keeps its state.
  const [everOpened, setEverOpened] = useState(open);
  const asideRef = useRef<HTMLElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);

  // Mirror open state to the parent — including the persisted value on mount —
  // so the page can yield overlapping fixed UI to the dock.
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const setOpenPersist = useCallback((next: boolean) => {
    setOpen(next);
    safeSet(DOCK_OPEN_KEY, String(next));
    if (next) setEverOpened(true);
  }, []);

  // Reading the briefing clears the pulse — seen is per-briefing, not per-visit.
  useEffect(() => {
    if (open && briefing) markSeen();
  }, [open, briefing, markSeen]);

  // Move focus with the dock: into the aside on expand, back to the edge tab
  // on collapse. Skips the initial render so page load never steals focus.
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current === open) return;
    prevOpenRef.current = open;
    const frame = requestAnimationFrame(() => {
      if (open) asideRef.current?.focus();
      else tabRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Escape") return;
      // Only collapse when the Escape belongs to the dock — not to some other
      // overlay (dialog, menu) holding focus elsewhere on the page.
      if (asideRef.current && !asideRef.current.contains(document.activeElement)) return;
      setOpenPersist(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpenPersist]);

  if (!accountId) return null;

  const AtlasIcon = ATLAS.icon;

  return (
    <>
      {/* Collapsed tab — slim, vertically centered on the right edge */}
      {!open && (
        <button
          ref={tabRef}
          type="button"
          onClick={() => setOpenPersist(true)}
          className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-lg border border-r-0 border-border bg-card px-1.5 py-3 shadow-md transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Open ${ATLAS.name}, your ${ATLAS.role}`}
        >
          <AtlasIcon className="h-4 w-4 text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground [writing-mode:vertical-rl]">
            {ATLAS.name}
          </span>
          {hasUnseen && (
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
              aria-label="New briefing available"
            />
          )}
        </button>
      )}

      {/* Expanded dock — kept mounted so the slide transition runs both ways;
          visibility (not display) hides it from the tab order when closed. */}
      <aside
        ref={asideRef}
        tabIndex={-1}
        className={cn(
          // Below lg Atlas is a FULL-SCREEN chat (owner directive 2026-07-06:
          // "full screen chat or not open" — a 94vw sliver clipped content and
          // left a useless strip of canvas). Desktop keeps the side-dock width.
          // h-dvh (inset-y-0 kept as the no-dvh fallback) tracks the mobile
          // browser chrome so the composer at the flex bottom stays visible;
          // max-w + overflow-x-hidden stop any child from pushing past the
          // screen edge. Desktop metrics are unchanged (100dvh === 100vh).
          "fixed inset-y-0 right-0 z-40 flex h-dvh w-full max-w-[100vw] flex-col overflow-x-hidden border-l border-border bg-card shadow-2xl transition-[transform,visibility] duration-200 motion-reduce:transition-none lg:w-[clamp(440px,26vw,600px)]",
          open ? "translate-x-0" : "invisible translate-x-full",
        )}
        aria-hidden={!open}
        aria-label="Atlas strategy dock"
      >
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/40">
            <AtlasIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">{ATLAS.name}</p>
            <p className="text-xs text-muted-foreground">{ATLAS.role}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate("/war-room")}
            aria-label="Open the full-page War Room"
            title="Open the War Room"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => void requestBriefing()}
            disabled={refreshing || !profileId}
            aria-label="Refresh briefing"
            title="Refresh briefing"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setOpenPersist(false)}
            aria-label="Close Atlas"
            title="Close (Esc)"
          >
            {/* Full-screen mobile closes with an X; the desktop side dock
                collapses toward the right edge, so the chevron reads better. */}
            <X className="h-4 w-4 lg:hidden" />
            <ChevronRight className="hidden h-4 w-4 lg:block" />
          </Button>
        </header>

        {profileError ? (
          <div className="px-4 pt-4">
            <p className="text-xs leading-relaxed text-destructive" role="alert">
              {profileError}
            </p>
          </div>
        ) : everOpened && profileId ? (
          <AtlasChat
            accountId={accountId}
            agentProfileId={profileId}
            briefingSlot={
              <BriefingCard
                loading={briefingLoading}
                error={briefingError}
                refreshing={refreshing}
                refreshError={refreshError}
                refreshStalled={refreshStalled}
                briefing={briefing}
                skillTitle={skillTitle}
                canRequest={Boolean(profileId)}
                onRequest={() => void requestBriefing()}
              />
            }
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
            <BriefingCard
              loading={briefingLoading}
              error={briefingError}
              refreshing={refreshing}
              refreshError={refreshError}
                refreshStalled={refreshStalled}
              briefing={briefing}
              skillTitle={skillTitle}
              canRequest={Boolean(profileId)}
              onRequest={() => void requestBriefing()}
            />
          </div>
        )}
      </aside>
    </>
  );
}
