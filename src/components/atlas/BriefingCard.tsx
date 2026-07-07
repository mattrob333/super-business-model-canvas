import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CANVAS_SECTION_KEYS,
  CANVAS_SECTION_LABELS,
} from "@/components/canvas/section-types";
import { AGENT_ROSTER } from "@/lib/agent-roster";
import { ATLAS, type AtlasBriefingPayload } from "@/lib/atlas";
import type { LoadedBriefing } from "@/components/atlas/useAtlasBriefing";

/**
 * The State of the Union card (spec 12 §1): headline, deltas, position,
 * coverage board, ONE directed move, watchouts. Shared verbatim by the Atlas
 * dock and the full-page War Room — one briefing, two surfaces.
 */
export function BriefingCard({
  loading,
  error,
  refreshing,
  refreshError,
  briefing,
  skillTitle,
  canRequest,
  onRequest,
}: {
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refreshError: string | null;
  briefing: LoadedBriefing | null;
  skillTitle: string | null;
  canRequest: boolean;
  onRequest: () => void;
}) {
  const navigate = useNavigate();
  const AtlasIcon = ATLAS.icon;

  if (loading) {
    return (
      <section className="shrink-0 rounded-lg border border-border bg-card p-4 shadow-sm">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-1.5 h-4 w-3/4" />
        <div className="mt-4 grid grid-cols-3 gap-1.5 min-[420px]:grid-cols-9 min-[420px]:gap-1">
          {CANVAS_SECTION_KEYS.map((key) => (
            <Skeleton key={key} className="h-7 w-full rounded min-[420px]:h-auto min-[420px]:aspect-square" />
          ))}
        </div>
        <Skeleton className="mt-4 h-20 w-full rounded-lg" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="shrink-0 rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          State of the Union
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-destructive" role="alert">
          {error}
        </p>
        {refreshError && (
          <p className="mt-1 text-xs leading-relaxed text-destructive" role="alert">
            {refreshError}
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-3 h-8 gap-1.5"
          disabled={refreshing || !canRequest}
          onClick={onRequest}
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Try again
        </Button>
      </section>
    );
  }

  if (!briefing) {
    return (
      <section className="shrink-0 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/40">
            <AtlasIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Atlas hasn’t briefed you yet</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              One read of where you stand, what data exists, and the single move to make first.
            </p>
          </div>
          <Button size="sm" className="h-8 gap-1.5" disabled={refreshing || !canRequest} onClick={onRequest}>
            {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Get your first briefing
          </Button>
          {refreshing && (
            <p className="text-[11px] text-muted-foreground">Usually under a minute.</p>
          )}
          {refreshError && (
            <p className="text-xs leading-relaxed text-destructive" role="alert">
              {refreshError}
            </p>
          )}
        </div>
      </section>
    );
  }

  const { payload, createdAt } = briefing;
  // Trust the payload timestamp only when it parses; the run row's created_at
  // is the safe fallback for a malformed or missing generated_at.
  const generatedAt = !Number.isNaN(Date.parse(payload.generated_at))
    ? payload.generated_at
    : createdAt;

  return (
    <section className="shrink-0 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          State of the Union
        </h2>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}
        </span>
      </div>

      <p className="mt-2 break-words text-[15px] font-semibold leading-snug">{payload.headline}</p>

      {payload.changes.length > 0 && (
        <div className="mt-3 rounded-md bg-muted/40 p-2.5">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Since last briefing
          </h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {payload.changes.map((change) => (
              <li key={change} className="text-xs leading-relaxed text-muted-foreground">
                {change}
              </li>
            ))}
          </ul>
        </div>
      )}

      {payload.position.length > 0 && (
        <ul className="mt-3 space-y-2.5">
          {payload.position.map((entry) => (
            <li key={entry.claim}>
              <p className="text-sm leading-snug">{entry.claim}</p>
              {entry.basis && (
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {entry.basis}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <CoverageBoard coverage={payload.coverage} />

      <DirectiveCard
        directive={payload.directive}
        skillTitle={skillTitle}
        onOpenRoom={(room) => {
          // A directive is a delegation, not a door: stash the brief so the
          // room opens a fresh thread, auto-sends it, and the agent
          // acknowledges the task from Atlas (owner direction 2026-07-06).
          try {
            sessionStorage.setItem("atlas:handoff", JSON.stringify({
              room,
              action: payload.directive.action,
              why: payload.directive.why,
              skillKey: payload.directive.skill_key,
              skillTitle,
              headline: payload.headline,
            }));
          } catch {
            // Storage unavailable: the room still opens, just without the brief.
          }
          navigate(`/workspace/${room}?from=atlas`);
        }}
      />

      {payload.watchouts.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {payload.watchouts.map((watchout) => (
            <li
              key={watchout}
              className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-600 dark:text-amber-400"
            >
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              {watchout}
            </li>
          ))}
        </ul>
      )}

      {refreshing && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Atlas is preparing a fresh briefing. Usually under a minute.
        </p>
      )}
      {refreshError && (
        <p className="mt-3 text-xs leading-relaxed text-destructive" role="alert">
          {refreshError}
        </p>
      )}
    </section>
  );
}

function CoverageBoard({ coverage }: { coverage: AtlasBriefingPayload["coverage"] }) {
  const bySection = new Map(coverage.map((entry) => [entry.section_key, entry]));
  return (
    <div className="mt-4">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Canvas coverage
      </h3>
      {/* 9 cells in canonical canvas order; sections the handler didn't
          report render as empty rather than vanishing. */}
      <div className="mt-1.5 grid grid-cols-3 gap-1.5 min-[420px]:grid-cols-9 min-[420px]:gap-1">
        {CANVAS_SECTION_KEYS.map((key) => {
          const entry = bySection.get(key);
          const state = entry?.state ?? "empty";
          const items = entry?.items ?? 0;
          return (
            <div
              key={key}
              title={`${CANVAS_SECTION_LABELS[key]}: ${state}, ${items} items`}
              className={cn(
                "h-7 w-full rounded min-[420px]:h-auto min-[420px]:aspect-square",
                state === "verified" && "bg-primary/80",
                state === "assumed" && "bg-amber-500/70",
                state === "empty" && "border border-border bg-muted/30",
              )}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-primary/80" />
          Verified
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-amber-500/70" />
          Assumed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm border border-border bg-muted/30" />
          Empty
        </span>
      </div>
    </div>
  );
}

function DirectiveCard({
  directive,
  skillTitle,
  onOpenRoom,
}: {
  directive: AtlasBriefingPayload["directive"];
  skillTitle: string | null;
  onOpenRoom: (room: string) => void;
}) {
  if (!directive.action) return null;
  const room = directive.room;
  const rosterEntry = room ? AGENT_ROSTER[room] : null;
  const buttonLabel = rosterEntry
    ? directive.skill_key && skillTitle
      ? `Run ${skillTitle} with ${rosterEntry.callsign}`
      : `Open ${rosterEntry.callsign}’s room`
    : null;

  return (
    <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-primary">
        Your next move
      </h3>
      <p className="mt-1.5 text-sm font-semibold leading-snug">{directive.action}</p>
      {directive.why && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{directive.why}</p>
      )}
      {room && buttonLabel && (
        <Button size="sm" className="mt-3 h-8 w-full gap-1.5" onClick={() => onOpenRoom(room)}>
          <span className="min-w-0 truncate">{buttonLabel}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
