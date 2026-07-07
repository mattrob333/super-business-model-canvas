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
const RUN_POLL_INTERVAL_MS = 3_000;
const RUN_POLL_MAX_ATTEMPTS = 100; // ~5 minutes

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
  const [profileError, setProfileError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<LoadedBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [seenId, setSeenId] = useState<string | null>(null);
  const [skillTitle, setSkillTitle] = useState<string | null>(null);
  const disposedRef = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout>>();

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

  return {
    accountId,
    profileId,
    profileError,
    briefing,
    briefingLoading,
    briefingError,
    refreshing,
    refreshError,
    skillTitle,
    hasUnseen: Boolean(briefing && briefing.runId !== seenId),
    markSeen,
    requestBriefing,
  };
}
