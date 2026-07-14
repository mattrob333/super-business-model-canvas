import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { getAgentRuntime } from "@/lib/agent-runtime";
import { useAccountId } from "@/hooks/useAccountId";
import { useAuth } from "@/hooks/useAuth";
import { loadCompanyScope } from "@/lib/company-scope";
import { parseAtlasBriefing, type AtlasBriefingPayload } from "@/lib/atlas";

/**
 * Atlas's briefing state, shared by the dock and the full-page War Room
 * (spec 12 §6: one Atlas, one thread, one briefing — two surfaces). Resolves
 * the orchestrator profile, loads the latest briefing FOR THE ACTIVE COMPANY
 * (input.company_key, stamped by the worker), requests fresh ones, and
 * tracks per-account seen state for the dock's pulse.
 */

interface BriefingRunRow {
  id: string;
  output: Record<string, unknown> | null;
  input: Record<string, unknown> | null;
  created_at: string;
  status: string;
  error: string | null;
}

export interface LoadedBriefing {
  runId: string;
  payload: AtlasBriefingPayload;
  createdAt: string;
}

const seenBriefingKey = (accountId: string) => `atlas:seen-briefing:${accountId}`;
const autoBriefKey = (accountId: string) => `atlas:auto-brief:${accountId}`;
const RUN_POLL_INTERVAL_MS = 3_000;
const RUN_POLL_MAX_ATTEMPTS = 100; // ~5 minutes
/**
 * Staleness policy (owner finding 2026-07-14: a 6-day-old briefing sat in the
 * War Room through two workflow runs and a research pass). A briefing is
 * stale when it is older than a day OR when any completed agent run — a
 * workflow, skill, research pass, sweep — postdates it. Stale briefings
 * auto-refresh on open; the old one stays visible, honestly aged, while the
 * new one is written.
 */
const BRIEFING_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
/** Failed/slow engines must not burn a briefing run on every page open. */
const AUTO_BRIEF_THROTTLE_MS = 30 * 60 * 1_000;

/** localStorage read that survives private mode / blocked storage — null on failure. */
export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** localStorage write that survives private mode / quota errors — no-op on failure. */
export function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Persistence is best-effort; a blocked storage write must not break Atlas.
  }
}

export function useAtlasBriefing() {
  const { accountId } = useAccountId();
  const { user } = useAuth();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileDescription, setProfileDescription] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<LoadedBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  // True when the requested run has sat PENDING (never claimed) well past
  // normal pickup — the honest signal that the engine is busy or down, not
  // that the briefing is "almost ready".
  const [refreshStalled, setRefreshStalled] = useState(false);
  const [seenId, setSeenId] = useState<string | null>(null);
  const [skillTitle, setSkillTitle] = useState<string | null>(null);
  const disposedRef = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout>>();
  // Auto-refreshes never mark the result "seen" (the dock pulse must still
  // fire); manual requests do. One auto attempt per surface mount + account.
  const manualRequestRef = useRef(false);
  const autoAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      clearTimeout(pollTimer.current);
    };
  }, []);

  // Seen-briefing is account-scoped; re-derive whenever the account changes.
  useEffect(() => {
    setSeenId(accountId ? safeGet(seenBriefingKey(accountId)) : null);
  }, [accountId]);

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
        .select("id, account_id, description")
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
      setProfileDescription(data[0].description ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  /** Returns the loaded run id so callers can mark it seen without a state race. */
  const loadBriefing = useCallback(async (): Promise<string | null> => {
    if (!accountId) return null;
    const [{ data, error }, scope] = await Promise.all([
      supabaseUntyped
        .from<BriefingRunRow>("agent_runs")
        .select("id, output, input, created_at, status, error")
        .eq("account_id", accountId)
        .eq("run_type", "atlas_briefing")
        .in("status", ["completed"])
        .order("created_at", { ascending: false })
        .limit(5),
      loadCompanyScope(accountId).catch(() => null),
    ]);
    if (error) {
      setBriefing(null);
      setBriefingError(error.message);
      return null;
    }
    // A briefing belongs to the company it was generated for (input.company_key,
    // stamped by the worker). After a company switch the previous company's
    // briefing must not brief the new one — show "no briefing yet" instead
    // (owner bug 2026-07-06). Legacy briefings without a key are excluded once
    // the account has a keyed active company.
    const activeKey = scope?.companyKey ?? null;
    const row = (data ?? []).find((candidate) => {
      if (!activeKey) return true;
      return candidate.input?.company_key === activeKey;
    });
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

  const markSeen = useCallback(() => {
    if (!accountId || !briefing) return;
    safeSet(seenBriefingKey(accountId), briefing.runId);
    setSeenId(briefing.runId);
  }, [accountId, briefing]);

  const pollBriefingRun = useCallback((runId: string, attempt: number) => {
    if (attempt >= RUN_POLL_MAX_ATTEMPTS) {
      setRefreshing(false);
      setRefreshStalled(false);
      setRefreshError("Atlas is taking longer than expected. The run continues in the background. Check back shortly.");
      return;
    }
    getAgentRuntime(accountId ?? undefined)
      .getRunStatus(runId)
      .then((status) => {
        if (disposedRef.current) return;
        if (!status || status.status === "pending" || status.status === "running") {
          // Still pending (never claimed) after ~45s means the engine hasn't
          // picked it up — say so instead of spinning silently.
          setRefreshStalled(status?.status === "pending" && attempt >= 15);
          pollTimer.current = setTimeout(() => pollBriefingRun(runId, attempt + 1), RUN_POLL_INTERVAL_MS);
          return;
        }
        setRefreshing(false);
        setRefreshStalled(false);
        if (status.status === "completed") {
          void loadBriefing().then((loadedId) => {
            if (disposedRef.current) return;
            // A MANUALLY requested briefing is a read briefing — no pulse.
            // An auto-refreshed one keeps the pulse so the dock announces it.
            if (loadedId && accountId && manualRequestRef.current) {
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

  const startBriefingRun = useCallback(async (manual: boolean) => {
    if (!accountId || !profileId || refreshing) return;
    manualRequestRef.current = manual;
    setRefreshError(null);
    setRefreshStalled(false);
    setRefreshing(true);
    try {
      const { runId } = await getAgentRuntime(accountId).startRun({
        agentProfileId: profileId,
        accountId,
        runType: "atlas_briefing",
        triggerType: manual ? "manual" : "scheduled",
        triggeredBy: manual ? user?.id ?? null : null,
        input: {},
      });
      pollBriefingRun(runId, 0);
    } catch (error) {
      setRefreshing(false);
      // Auto-refresh failures stay quiet in the card (the old briefing is
      // still readable); manual failures surface, as before.
      if (manual) setRefreshError(error instanceof Error ? error.message : "Runtime unreachable");
    }
  }, [accountId, profileId, refreshing, user, pollBriefingRun]);

  const requestBriefing = useCallback(async () => startBriefingRun(true), [startBriefingRun]);

  // Staleness-aware auto-refresh: opening a briefing surface catches the user
  // up on the CURRENT state of the company instead of showing whatever was
  // last generated. Stale = older than a day, or superseded by any completed
  // run (workflow, skill, research, sweep) since it was written. Throttled so
  // a broken engine can't burn a run per page open.
  useEffect(() => {
    if (!accountId || !profileId || briefingLoading || refreshing) return;
    if (briefingError || profileError) return;
    const attemptKey = `${accountId}:${briefing?.runId ?? "none"}`;
    if (autoAttemptedRef.current === attemptKey) return;
    let cancelled = false;

    (async () => {
      let stale = false;
      if (!briefing) {
        // No briefing for this company yet — generate the first one.
        stale = true;
      } else if (Date.now() - Date.parse(briefing.createdAt) > BRIEFING_MAX_AGE_MS) {
        stale = true;
      } else {
        const { data } = await supabaseUntyped
          .from<{ id: string }>("agent_runs")
          .select("id")
          .eq("account_id", accountId)
          .eq("status", "completed")
          .neq("run_type", "atlas_briefing")
          .gt("completed_at", briefing.createdAt)
          .limit(1);
        stale = (data ?? []).length > 0;
      }
      if (cancelled || !stale) return;

      const lastAttempt = Number(safeGet(autoBriefKey(accountId)) ?? 0);
      if (Date.now() - lastAttempt < AUTO_BRIEF_THROTTLE_MS) return;
      autoAttemptedRef.current = attemptKey;
      safeSet(autoBriefKey(accountId), String(Date.now()));
      void startBriefingRun(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, profileId, briefing, briefingLoading, briefingError, profileError, refreshing, startBriefingRun]);

  return {
    accountId,
    profileId,
    profileDescription,
    profileError,
    briefing,
    briefingLoading,
    briefingError,
    refreshing,
    refreshError,
    refreshStalled,
    skillTitle,
    hasUnseen: Boolean(briefing && briefing.runId !== seenId),
    markSeen,
    requestBriefing,
  };
}
