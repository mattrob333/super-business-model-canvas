import { useState, type ComponentProps } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FocusDrawer } from "@/components/overlay/FocusDrawer";
import { BriefingCard } from "@/components/atlas/BriefingCard";
import { ATLAS } from "@/lib/atlas";
import { cn } from "@/lib/utils";

/**
 * The War Room's compact briefing entry point (owner finding 2026-07-14: the
 * full State of the Union panel permanently parked in the rail read as
 * clutter — status deserves a glance, reading deserves a drawer).
 *
 * One slim strip: label, headline snippet, age, unread pulse, refresh.
 * Tapping opens the full briefing in the house FocusDrawer. The briefing
 * document itself also lands on the shelf (worker-side), so history lives
 * with every other document the team produces.
 */
export function BriefingStrip({
  hasUnseen,
  onRead,
  ...card
}: {
  hasUnseen: boolean;
  /** Called when the user opens the drawer — the moment the briefing is truly read. */
  onRead: () => void;
} & ComponentProps<typeof BriefingCard>) {
  const [open, setOpen] = useState(false);
  const AtlasIcon = ATLAS.icon;

  const generatedAt = card.briefing
    ? !Number.isNaN(Date.parse(card.briefing.payload.generated_at))
      ? card.briefing.payload.generated_at
      : card.briefing.createdAt
    : null;
  const headline = card.briefing?.payload.headline ?? null;

  const statusLine = card.loading
    ? "Loading…"
    : card.error
      ? "Couldn't load — open for details"
      : headline
        ?? (card.refreshing ? "Atlas is writing your first briefing…" : "No briefing yet — open to get your first one");

  return (
    <>
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card pr-1 shadow-sm">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            onRead();
          }}
          aria-label="Open the State of the Union briefing"
          className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg py-2 pl-3 pr-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-1.5">
            <AtlasIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              State of the Union
            </span>
            {generatedAt && (
              <span className="min-w-0 truncate text-[10px] text-muted-foreground/80">
                {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}
              </span>
            )}
            {card.refreshing && (
              <span className="flex shrink-0 items-center gap-1 text-[10px] text-primary" role="status">
                <Loader2 className="h-3 w-3 animate-spin" />
                updating
              </span>
            )}
            {hasUnseen && !card.refreshing && (
              <span
                className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
                aria-label="New briefing available"
              />
            )}
            <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </span>
          <span className={cn("min-w-0 truncate text-xs", card.error ? "text-destructive" : "text-foreground")}>
            {statusLine}
          </span>
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

      <FocusDrawer
        open={open}
        onOpenChange={setOpen}
        size="reading"
        eyebrow="WAR ROOM"
        title="State of the Union"
        subtitle={generatedAt ? `Generated ${formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}` : undefined}
      >
        <BriefingCard {...card} />
      </FocusDrawer>
    </>
  );
}
