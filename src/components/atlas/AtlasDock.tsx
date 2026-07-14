import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, Maximize2, RefreshCw, X } from "lucide-react";
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
// Dock-only, per-account: whether the State of the Union card is expanded.
// The War Room always shows the full card — this key never applies there.
const briefingOpenKey = (accountId: string) => `atlas:briefing-open:${accountId}`;

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
  // Below lg the dock is a full-screen takeover, so it must NEVER auto-open
  // (owner bug 2026-07-08: the canvas showed for ~2s, then a persisted
  // dock-open state hijacked the screen) — mobile opens only from a tap.
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined" || window.innerWidth < 1024) return false;
    const stored = safeGet(DOCK_OPEN_KEY);
    if (stored !== null) return stored === "true";
    return true;
  });
  // The chat mounts lazily on first expand and stays mounted after, so a
  // collapsed dock costs zero thread queries but reopening keeps its state.
  const [everOpened, setEverOpened] = useState(open);
  const asideRef = useRef<HTMLElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);

  // Mirror open state to the parent — including the persisted value on mount —
  // so the page can yield overlapping fixed UI to the dock.
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const setOpenPersist = useCallback((next: boolean) => {
    setOpen(next);
    // Persist only the desktop preference — mobile always starts closed, and
    // a phone session must not flip the saved desktop state.
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      safeSet(DOCK_OPEN_KEY, String(next));
    }
    if (next) setEverOpened(true);
  }, []);

  // The briefing card starts COLLAPSED in the dock (owner 2026-07-08: "the
  // state of the union needs to go away at some point... something you can
  // run when you need an overall update"). The slim bar expands on click and
  // the preference persists per account. Two states override the preference
  // by design, without persisting: no briefing yet (the first-run welcome /
  // auto-briefing flow must stay visible) and an unseen briefing (it
  // announces itself expanded; collapsing it again is a click away).
  const [briefingOpen, setBriefingOpen] = useState(false);
  useEffect(() => {
    if (!accountId) return;
    setBriefingOpen(safeGet(briefingOpenKey(accountId)) === "true");
  }, [accountId]);
  useEffect(() => {
    // Also covers the briefing-error card — a hidden failure helps nobody.
    if (!briefingLoading && !briefing) setBriefingOpen(true);
  }, [briefingLoading, briefing]);
  useEffect(() => {
    if (hasUnseen) setBriefingOpen(true);
  }, [hasUnseen]);
  const setBriefingOpenPersist = useCallback(
    (next: boolean) => {
      setBriefingOpen(next);
      if (accountId) safeSet(briefingOpenKey(accountId), String(next));
    },
    [accountId],
  );

  // Reading the briefing clears the pulse — seen is per-briefing, not
  // per-visit, and "read" now means the card itself is expanded in the open
  // dock, not merely that the dock is open with the briefing collapsed.
  useEffect(() => {
    if (open && briefingOpen && briefing) markSeen();
  }, [open, briefingOpen, briefing, markSeen]);

  // Move focus with the dock: into the aside on expand, back to the edge tab
  // on collapse. Skips the initial render so page load never steals focus.
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current === open) return;
    prevOpenRef.current = open;
    const frame = requestAnimationFrame(() => {
      if (open) {
        asideRef.current?.focus();
        return;
      }
      // Two collapsed triggers exist (mobile pill / desktop edge tab) —
      // return focus to whichever one this viewport actually shows.
      const desktop =
        typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
      (desktop ? tabRef : pillRef).current?.focus();
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

  // One slot, two mounts (chat header on desktop flow, plain scroll fallback)
  // — both viewports get the same collapsible briefing.
  const briefingSlot = (
    <CollapsibleBriefing
      expanded={briefingOpen}
      onToggle={() => setBriefingOpenPersist(!briefingOpen)}
      hasUnseen={hasUnseen}
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
  );

  return (
    <>
      {/* Collapsed triggers — the Canvas/Atlas toggle. Below lg: a floating
          pill above the safe area (the full-screen chat's X is the way back).
          lg and up: the slim tab on the right edge, unchanged. */}
      {!open && (
        <>
          <button
            ref={pillRef}
            type="button"
            onClick={() => setOpenPersist(true)}
            className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 shadow-lg transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            aria-label={`Open ${ATLAS.name}, your ${ATLAS.role}`}
          >
            <AtlasIcon className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold">{ATLAS.name}</span>
            {hasUnseen && (
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
                aria-label="New briefing available"
              />
            )}
          </button>
          <button
            ref={tabRef}
            type="button"
            onClick={() => setOpenPersist(true)}
            className="fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-2 rounded-l-lg border border-r-0 border-border bg-card px-1.5 py-3 shadow-md transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex"
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
        </>
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
          <AtlasChat accountId={accountId} agentProfileId={profileId} briefingSlot={briefingSlot} fullPageOnWorkflow />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">{briefingSlot}</div>
        )}
      </aside>
    </>
  );
}

/**
 * Dock-only chrome around the shared BriefingCard: collapsed it is a slim bar
 * (Atlas icon, title, relative age, unseen pulse, chevron) with a Refresh
 * button — the "run when you need an overall update" action; expanded it
 * renders the untouched card inline below the same bar. The War Room keeps
 * using BriefingCard directly, always in full.
 */
function CollapsibleBriefing({
  expanded,
  onToggle,
  hasUnseen,
  ...card
}: {
  expanded: boolean;
  onToggle: () => void;
  hasUnseen: boolean;
} & ComponentProps<typeof BriefingCard>) {
  const AtlasIcon = ATLAS.icon;
  // Same timestamp rule as the card itself: trust payload.generated_at only
  // when it parses; the run row's created_at is the fallback.
  const generatedAt = card.briefing
    ? !Number.isNaN(Date.parse(card.briefing.payload.generated_at))
      ? card.briefing.payload.generated_at
      : card.briefing.createdAt
    : null;

  return (
    <div className="shrink-0">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card pr-1 shadow-sm">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} the State of the Union briefing`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2.5 pl-3 pr-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AtlasIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            State of the Union
          </span>
          {/* Expanded, the card right below shows the same timestamp. */}
          {!expanded && generatedAt && (
            <span className="min-w-0 truncate text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}
            </span>
          )}
          {hasUnseen && (
            <span
              className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
              aria-label="New briefing available"
            />
          )}
          <ChevronDown
            className={cn(
              "ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
              expanded && "rotate-180",
            )}
          />
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={card.onRequest}
          disabled={card.refreshing || !card.canRequest}
          aria-label="Refresh briefing"
          title="Refresh briefing"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", card.refreshing && "animate-spin")} />
        </Button>
      </div>
      {expanded && (
        <div className="mt-2">
          <BriefingCard {...card} />
        </div>
      )}
    </div>
  );
}
