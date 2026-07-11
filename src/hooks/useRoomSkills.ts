import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { loadCompanyScope } from "@/lib/company-scope";
import { getAgentRuntime } from "@/lib/agent-runtime";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

/**
 * Room skill running, extracted from WorkspaceActionsPanel when the Run
 * buttons moved into the room hero (owner design round 2026-07-08). The
 * hero owns actions; the right rail owns the shelf. A completed run
 * dispatches ARTIFACT_CREATED_EVENT so the shelf refreshes without the
 * two components knowing each other.
 */

export const ARTIFACT_CREATED_EVENT = "sbmc:artifact-created";

export interface CatalogSkill {
  skill_key: string;
  title: string;
  description: string;
  implemented: boolean;
  sort_order: number;
}

const RUN_POLL_INTERVAL_MS = 3_000;
const RUN_POLL_MAX_ATTEMPTS = 100;
/** Competitor research may land while the user sits here — re-check until it does. */
const COMPETITOR_GATE_RECHECK_MS = 30_000;

/**
 * Skills whose worker implementation throws immediately without researched
 * competitor data (owner screenshot 2026-07-08: failed runs, wasted tokens).
 * Derived from the honest-throw preconditions in worker/src/jobs/skill-run.ts
 * and worker/src/jobs/skills/* — every "requires ... competitor ... research
 * first" guard, keyed exactly as the catalog/registry keys them.
 * Keep in sync when a worker skill adds or drops a competitor precondition.
 */
const REQUIRES_COMPETITOR_RESEARCH = new Set<string>([
  "yield.pricing_teardown",
  "compass.segment_expansion",
  "relay.channel_gap_scan",
  "relay.channel_economics",
  "forge.differentiator_audit",
  "vault.talent_radar",
  "envoy.ecosystem_watch",
  "anchor.lifecycle_map",
  "anchor.advocacy_engine_scan",
  "tempo.operational_benchmark",
  "tempo.velocity_watch",
  "yield.monetization_gaps",
]);

export function useRoomSkills(accountId: string, agentProfileId: string, agentKey: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [skills, setSkills] = useState<CatalogSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningRun, setRunningRun] = useState<{ skillKey: string; runId: string } | null>(null);
  /**
   * Set synchronously on click, before the enqueue round-trip: the gap
   * between click and setRunningRun is 1-2 network calls with ZERO visual
   * change, which read as "the button didn't work" and invited double
   * clicks (owner finding 2026-07-08 — startingRef already guarded the
   * double enqueue, but silently).
   */
  const [startingKey, setStartingKey] = useState<string | null>(null);
  const [skillErrors, setSkillErrors] = useState<Record<string, string>>({});
  const pollTimer = useRef<ReturnType<typeof setTimeout>>();
  const startingRef = useRef(false);
  /**
   * Does the active company have ANY researched competitor canvas rows
   * (competitor-linked canvas_section_versions within scope.contextIds —
   * the exact read the worker's loadCompetitorSectionItems performs)?
   * null = not checked yet (skills stay runnable until we know).
   */
  const [hasCompetitorResearch, setHasCompetitorResearch] = useState<boolean | null>(null);

  useEffect(() => () => clearTimeout(pollTimer.current), []);

  useEffect(() => {
    let cancelled = false;
    let recheckTimer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      // Company-scoped: a company switch must not let a previous company's
      // competitor research unlock this company's skills.
      const scope = await loadCompanyScope(accountId).catch(() => null);
      let query = supabase
        .from("canvas_section_versions")
        .select("id")
        .eq("account_id", accountId)
        .not("competitor_id", "is", null);
      if (scope) query = query.in("business_context_version_id", scope.contextIds);
      const { data, error } = await query.limit(1);
      if (cancelled) return;
      if (error) {
        // Fail open: the worker's own precondition throw stays the honest
        // backstop; a read error must not lock every competitor skill.
        setHasCompetitorResearch(true);
        return;
      }
      const found = (data ?? []).length > 0;
      setHasCompetitorResearch(found);
      // Research runs take minutes — keep re-checking until the data lands
      // so the gate lifts without a page reload.
      if (!found) {
        recheckTimer = setTimeout(() => void check(), COMPETITOR_GATE_RECHECK_MS);
      }
    };
    void check();
    return () => {
      cancelled = true;
      if (recheckTimer) clearTimeout(recheckTimer);
    };
  }, [accountId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabaseUntyped
        .from<CatalogSkill>("skill_catalog")
        .select("skill_key, title, description, implemented, sort_order")
        .eq("agent_key", agentKey)
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      setSkills(error ? [] : data ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentKey]);

  const ensureBusinessContext = useCallback(async (): Promise<string> => {
    // The active company's newest context — never a stale prior-company row.
    const scope = await loadCompanyScope(accountId).catch(() => null);
    if (scope?.activeContextId) return scope.activeContextId;

    const { data: created, error } = await supabase
      .from("business_context_versions")
      .insert({
        account_id: accountId,
        version_number: 1,
        summary: "Initial business context",
        data: {},
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Failed to create business context");
    return created.id;
  }, [accountId, user]);

  const pollSkillRun = useCallback((skill: CatalogSkill, runId: string, attempt: number) => {
    if (attempt >= RUN_POLL_MAX_ATTEMPTS) {
      setRunningRun(null);
      setSkillErrors((prev) => ({
        ...prev,
        [skill.skill_key]: "Run is taking longer than expected. Check Activity or try again shortly.",
      }));
      return;
    }

    getAgentRuntime(accountId)
      .getRunStatus(runId)
      .then((status) => {
        if (!status || status.status === "pending" || status.status === "running") {
          setRunningRun({ skillKey: skill.skill_key, runId });
          pollTimer.current = setTimeout(
            () => pollSkillRun(skill, runId, attempt + 1),
            RUN_POLL_INTERVAL_MS,
          );
          return;
        }

        setRunningRun(null);
        if (status.status === "completed") {
          toast({
            title: `${skill.title} complete`,
            description: "The finished document is on the shelf.",
          });
          window.dispatchEvent(new CustomEvent(ARTIFACT_CREATED_EVENT));
        } else {
          setSkillErrors((prev) => ({
            ...prev,
            [skill.skill_key]: status.error ?? `Run ${status.status}.`,
          }));
        }
      })
      .catch(() => {
        pollTimer.current = setTimeout(
          () => pollSkillRun(skill, runId, attempt + 1),
          RUN_POLL_INTERVAL_MS,
        );
      });
  }, [accountId, toast]);

  const runSkill = useCallback(async (skill: CatalogSkill) => {
    // startingRef is the synchronous half of the guard: runningRun is React
    // state, so a fast double-click passes the null check twice before the
    // re-render lands — that enqueued two identical runs in production.
    if (!skill.implemented || runningRun || startingRef.current) return;
    // Frontend mirror of the worker's precondition throw: enqueueing this run
    // without researched competitors would only burn tokens and fail.
    if (REQUIRES_COMPETITOR_RESEARCH.has(skill.skill_key) && hasCompetitorResearch === false) return;
    startingRef.current = true;
    setStartingKey(skill.skill_key);
    setSkillErrors((prev) => ({ ...prev, [skill.skill_key]: "" }));
    try {
      const contextVersionId = await ensureBusinessContext();
      const { runId } = await getAgentRuntime(accountId).startRun({
        agentProfileId,
        accountId,
        runType: "skill_run",
        triggerType: "manual",
        triggeredBy: user?.id ?? null,
        input: {
          skill_key: skill.skill_key,
          business_context_version_id: contextVersionId,
        },
      });
      setRunningRun({ skillKey: skill.skill_key, runId });
      toast({
        title: `${skill.title} queued`,
        description: "Takes a few minutes. The finished document appears on the shelf.",
      });
      pollSkillRun(skill, runId, 0);
    } catch (error) {
      setRunningRun(null);
      setSkillErrors((prev) => ({
        ...prev,
        [skill.skill_key]: error instanceof Error ? error.message : "Try again.",
      }));
      toast({
        title: "Skill did not start",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      startingRef.current = false;
      setStartingKey(null);
    }
  }, [accountId, agentProfileId, ensureBusinessContext, hasCompetitorResearch, pollSkillRun, runningRun, toast, user]);

  const needsCompetitorResearch = useCallback(
    (skill: CatalogSkill) =>
      skill.implemented &&
      REQUIRES_COMPETITOR_RESEARCH.has(skill.skill_key) &&
      hasCompetitorResearch === false,
    [hasCompetitorResearch],
  );

  return { skills, loading, runningRun, startingKey, skillErrors, runSkill, needsCompetitorResearch };
}
