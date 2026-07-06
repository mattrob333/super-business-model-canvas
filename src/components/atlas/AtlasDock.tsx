import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight, ChevronRight, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { getAgentRuntime } from "@/lib/agent-runtime";
import { useAccountId } from "@/hooks/useAccountId";
import { useAuth } from "@/hooks/useAuth";
import {
  CANVAS_SECTION_KEYS,
  CANVAS_SECTION_LABELS,
} from "@/components/canvas/section-types";
import { AGENT_ROSTER } from "@/lib/agent-roster";
import { ATLAS, parseAtlasBriefing, type AtlasBriefingPayload } from "@/lib/atlas";
import { AtlasChat } from "@/components/atlas/AtlasChat";

/**
 * Spec 12 §6 — Atlas's collapsible right dock. Collapsed it is a slim tab on
 * the right edge; expanded it holds the State of the Union briefing and the
 * War Room thread, beside the canvas it is helping to fill (Atlas is not a
 * tenth room). Self-contained: resolves its own account, orchestrator
 * profile, and latest briefing; parents only decide whether a company exists.
 */

interface BriefingRunRow {
  id: string;
  output: Record<string, unknown> | null;
  created_at: string;
  status: string;
  error: string | null;
}

interface LoadedBriefing {
  runId: string;
  payload: AtlasBriefingPayload;
  createdAt: string;
}

const DOCK_OPEN_KEY = "atlas:dock-open";
const seenBriefingKey = (accountId: string) => `atlas:seen-briefing:${accountId}`;
const RUN_POLL_INTERVAL_MS = 3_000;
const RUN_POLL_MAX_ATTEMPTS = 100; // ~5 minutes

/** localStorage read that survives private mode / blocked storage — null on failure. */
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** localStorage write that survives private mode / quota errors — no-op on failure. */
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Persistence is best-effort; a blocked storage write must not break the dock.
  }
}

export function AtlasDock({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const { accountId } = useAccountId();
  const { user } = useAuth();
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
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<LoadedBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [seenId, setSeenId] = useState<string | null>(null);
  const [skillTitle, setSkillTitle] = useState<string | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const disposedRef = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(
    () => () => {
      disposedRef.current = true;
      clearTimeout(pollTimer.current);
    },
    [],
  );

  // Mirror open state to the parent — including the persisted value on mount —
  // so the page can yield overlapping fixed UI to the dock.
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  // Seen-briefing is account-scoped; re-derive whenever the account changes.
  useEffect(() => {
    setSeenId(accountId ? safeGet(seenBriefingKey(accountId)) : null);
  }, [accountId]);

  const setOpenPersist = useCallback((next: boolean) => {
    setOpen(next);
    safeSet(DOCK_OPEN_KEY, String(next));
    if (next) setEverOpened(true);
  }, []);

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

  // Account-scoped orchestrator profile wins over the global template
  // (the RF-4-13 precedence pattern shared with the section rooms).
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    setProfileId(null);
    setProfileError(null);
    (async () => {
      const { data, error } = await supabase
        .from("agent_profiles")
        .select("id, account_id")
        .eq("agent_key", "orchestrator")
        .or(`account_id.eq.${accountId},account_id.is.null`)
        .order("account_id", { ascending: false, nullsFirst: false })
        .limit(1);
      if (cancelled) return;
      if (error || !data?.[0]) {
        setProfileError(error?.message ?? "No Atlas profile found. Run the seed migration.");
        return;
      }
      setProfileId(data[0].id);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  /** Returns the loaded run id so callers can mark it seen without a state race. */
  const loadBriefing = useCallback(async (): Promise<string | null> => {
    if (!accountId) return null;
    const { data, error } = await supabaseUntyped
      .from<BriefingRunRow>("agent_runs")
      .select("id, output, created_at, status, error")
      .eq("account_id", accountId)
      .eq("run_type", "atlas_briefing")
      .in("status", ["completed"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      setBriefing(null);
      setBriefingError(error.message);
      return null;
    }
    const row = data?.[0];
    if (!row) {
      setBriefing(null);
      setBriefingError(null);
      return null;
    }
    const payload = parseAtlasBriefing(row.output);
    if (!payload) {
      // A completed run with an unreadable payload is an error, not an empty
      // state — pretending Atlas never briefed would hide a real failure.
      setBriefing(null);
      setBriefingError("The latest briefing arrived in a format this page can't read. Request a fresh one.");
      return null;
    }
    setBriefing({ runId: row.id, payload, createdAt: row.created_at });
    setBriefingError(null);
    return row.id;
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    setBriefingLoading(true);
    void loadBriefing().finally(() => {
      if (!cancelled) setBriefingLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, loadBriefing]);

  // Reading the briefing clears the pulse — seen is per-briefing, not per-visit.
  useEffect(() => {
    if (!accountId || !open || !briefing || briefing.runId === seenId) return;
    safeSet(seenBriefingKey(accountId), briefing.runId);
    setSeenId(briefing.runId);
  }, [accountId, open, briefing, seenId]);

  // Resolve the directive's skill title for the CTA label (B2: the directive
  // names a real catalog skill; the label should use its human title).
  const directiveSkillKey = briefing?.payload.directive.skill_key ?? null;
  useEffect(() => {
    if (!directiveSkillKey) {
      setSkillTitle(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabaseUntyped
        .from<{ title: string }>("skill_catalog")
        .select("title")
        .eq("skill_key", directiveSkillKey)
        .limit(1);
      if (!cancelled) setSkillTitle(data?.[0]?.title ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [directiveSkillKey]);

  const pollBriefingRun = useCallback((runId: string, attempt: number) => {
    if (attempt >= RUN_POLL_MAX_ATTEMPTS) {
      setRefreshing(false);
      setRefreshError("Atlas is taking longer than expected. The run continues in the background. Check back shortly.");
      return;
    }
    getAgentRuntime(accountId ?? undefined)
      .getRunStatus(runId)
      .then((status) => {
        if (disposedRef.current) return;
        if (!status || status.status === "pending" || status.status === "running") {
          pollTimer.current = setTimeout(() => pollBriefingRun(runId, attempt + 1), RUN_POLL_INTERVAL_MS);
          return;
        }
        setRefreshing(false);
        if (status.status === "completed") {
          void loadBriefing().then((loadedId) => {
            if (disposedRef.current) return;
            // A requested briefing is a read briefing — no pulse for it.
            if (loadedId && accountId) {
              safeSet(seenBriefingKey(accountId), loadedId);
              setSeenId(loadedId);
            }
          });
        } else {
          setRefreshError(status.error ?? `Run ${status.status}. Try again.`);
        }
      })
      .catch(() => {
        if (disposedRef.current) return;
        pollTimer.current = setTimeout(() => pollBriefingRun(runId, attempt + 1), RUN_POLL_INTERVAL_MS);
      });
  }, [accountId, loadBriefing]);

  const requestBriefing = useCallback(async () => {
    if (!accountId || !profileId || refreshing) return;
    setRefreshError(null);
    setRefreshing(true);
    try {
      const { runId } = await getAgentRuntime(accountId).startRun({
        agentProfileId: profileId,
        accountId,
        runType: "atlas_briefing",
        triggerType: "manual",
        triggeredBy: user?.id ?? null,
        input: {},
      });
      pollBriefingRun(runId, 0);
    } catch (error) {
      setRefreshing(false);
      setRefreshError(error instanceof Error ? error.message : "Runtime unreachable");
    }
  }, [accountId, profileId, refreshing, user, pollBriefingRun]);

  if (!accountId) return null;

  const AtlasIcon = ATLAS.icon;
  const hasUnseen = Boolean(briefing && briefing.runId !== seenId);

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
          "fixed inset-y-0 right-0 z-40 flex w-[min(94vw,440px)] lg:w-[clamp(440px,26vw,600px)] flex-col border-l border-border bg-card shadow-2xl transition-[transform,visibility] duration-200 motion-reduce:transition-none",
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
            aria-label="Collapse Atlas dock"
            title="Collapse (Esc)"
          >
            <ChevronRight className="h-4 w-4" />
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

function BriefingCard({
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
