import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { useAccountId } from "@/hooks/useAccountId";
import { useAuth } from "@/hooks/useAuth";
import { getAgentRuntime } from "@/lib/agent-runtime";
import type { AgentRunStatus } from "@/lib/agent-runtime";

/**
 * RF-4-1: the user-reachable entry point for competitor research.
 *
 * For each analysis-suggested competitor this hook knows whether a persisted
 * `companies` entity already exists (matched by website host, else exact name),
 * exposes its latest Threat Index, and can kick off the full chain:
 * create entity -> enqueue `competitor_research` (the worker chains `gap_engine`
 * on completion).
 *
 * Run state is derived from the durable agent_runs record — not just local
 * session state — so an in-flight run survives page reloads and a worker-side
 * failure surfaces on the card instead of spinning forever (live bug
 * 2026-07-05: a failed competitor crawl showed "Researching…" indefinitely).
 * While any run is active the hook polls until it reaches a terminal status.
 */

export interface CompetitorEntity {
  id: string;
  name: string;
  website_url: string | null;
  logo_url: string | null;
}

export interface CompetitorResearchState {
  /** companies.id when the competitor is persisted for this account */
  entityId?: string;
  /** captured or manually set logo, when available */
  logoUrl?: string | null;
  /** true when research has produced canvas versions for this competitor */
  researched: boolean;
  /** latest competitor.threat_index snapshot value, if the gap engine has run */
  threatIndex?: number;
  status: "idle" | "starting" | "queued" | "error";
  error?: string;
}

interface CompetitorRunSnapshot {
  id: string;
  status: AgentRunStatus;
  error: string | null;
  createdAt: string;
}

type PendingState = {
  status: CompetitorResearchState["status"];
  error?: string;
  entityId?: string;
  /** agent_runs.id returned by startRun — lets DB state take over precisely */
  runId?: string;
};

const RUN_POLL_INTERVAL_MS = 5_000;

const ACTIVE_RUN_STATUSES: AgentRunStatus[] = ["pending", "running"];
const FAILED_RUN_STATUSES: AgentRunStatus[] = ["failed", "timeout", "cancelled"];

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function useCompetitorResearch(
  candidates: Array<{ name: string; website: string; description?: string }>,
) {
  const { accountId } = useAccountId();
  const { user } = useAuth();
  const [entities, setEntities] = useState<CompetitorEntity[]>([]);
  const [researchedIds, setResearchedIds] = useState<Set<string>>(new Set());
  const [threatByCompetitor, setThreatByCompetitor] = useState<Record<string, number>>({});
  /** latest competitor_research run per companies.id, newest first from agent_runs */
  const [latestRuns, setLatestRuns] = useState<Record<string, CompetitorRunSnapshot>>({});
  const [pending, setPending] = useState<Record<string, PendingState>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  const hasLocalInFlight = Object.values(pending).some(
    (state) => state.status === "starting" || state.status === "queued",
  );

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const [companiesRes, versionsRes, metricsRes, runsRes] = await Promise.all([
        supabase
          .from("companies")
          .select("id, name, website_url, logo_url")
          .eq("account_id", accountId)
          .eq("is_competitor", true),
        supabase
          .from("canvas_section_versions")
          .select("competitor_id")
          .eq("account_id", accountId)
          .not("competitor_id", "is", null)
          .limit(500),
        supabaseUntyped
          .from<{ value: number | null; inputs: Record<string, unknown> | null; computed_at: string }>(
            "metric_snapshots",
          )
          .select("value, inputs, computed_at")
          .eq("account_id", accountId)
          .eq("metric_key", "competitor.threat_index")
          .order("computed_at", { ascending: false })
          .limit(100),
        supabase
          .from("agent_runs")
          .select("id, status, error, input, created_at")
          .eq("account_id", accountId)
          .eq("run_type", "competitor_research")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (cancelled) return;
      if (!companiesRes.error && companiesRes.data) {
        setEntities(companiesRes.data as CompetitorEntity[]);
      }
      if (!versionsRes.error && versionsRes.data) {
        setResearchedIds(new Set(
          versionsRes.data
            .map((row) => row.competitor_id)
            .filter((id): id is string => typeof id === "string"),
        ));
      }
      if (!metricsRes.error && metricsRes.data) {
        const latest: Record<string, number> = {};
        for (const row of metricsRes.data) {
          const inputs = (row.inputs ?? {}) as Record<string, unknown>;
          const competitorId = typeof inputs.competitor_id === "string" ? inputs.competitor_id : null;
          if (competitorId && !(competitorId in latest) && typeof row.value === "number") {
            latest[competitorId] = row.value;
          }
        }
        setThreatByCompetitor(latest);
      }
      let anyRunActive = false;
      if (!runsRes.error && runsRes.data) {
        const latest: Record<string, CompetitorRunSnapshot> = {};
        const fetchedRunIds = new Set<string>();
        for (const row of runsRes.data) {
          fetchedRunIds.add(row.id);
          const input = (row.input ?? {}) as Record<string, unknown>;
          const competitorId = typeof input.competitor_id === "string" ? input.competitor_id : null;
          if (!competitorId || competitorId in latest) continue;
          latest[competitorId] = {
            id: row.id,
            status: row.status,
            error: row.error,
            createdAt: row.created_at,
          };
        }
        setLatestRuns(latest);
        // Once agent_runs reflects an enqueued run, the local bridge state is
        // redundant — drop it so polling stops when the run itself settles.
        setPending((prev) => {
          const entries = Object.entries(prev).filter(
            ([, state]) => !(state.status === "queued" && state.runId && fetchedRunIds.has(state.runId)),
          );
          return entries.length === Object.keys(prev).length ? prev : Object.fromEntries(entries);
        });
        anyRunActive = Object.values(latest).some((run) => ACTIVE_RUN_STATUSES.includes(run.status));
      }
      // Keep polling while anything is in flight — DB-side runs or a local
      // enqueue the runs query hasn't caught up with yet.
      if (anyRunActive || hasLocalInFlight) {
        pollTimer = setTimeout(() => setRefreshTick((tick) => tick + 1), RUN_POLL_INTERVAL_MS);
      }
    })();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [accountId, refreshTick, hasLocalInFlight]);

  const stateFor = useCallback(
    (candidate: { name: string; website: string }): CompetitorResearchState => {
      const key = candidate.website || candidate.name;
      const host = hostOf(candidate.website);
      const entity = entities.find((row) =>
        host ? hostOf(row.website_url) === host : row.name.toLowerCase() === candidate.name.toLowerCase(),
      );
      const local = pending[key];
      const dbRun = entity ? latestRuns[entity.id] : undefined;
      const researched = Boolean(entity && researchedIds.has(entity.id));

      // Resolve status: a mid-flight enqueue wins; then the durable run record;
      // a just-enqueued local state holds only until the runs query sees its run.
      let status: CompetitorResearchState["status"] = "idle";
      let error: string | undefined;
      if (local?.status === "starting") {
        status = "starting";
      } else if (local?.status === "error") {
        status = "error";
        error = local.error;
      } else if (dbRun && ACTIVE_RUN_STATUSES.includes(dbRun.status)) {
        status = "queued";
      } else if (local?.status === "queued" && dbRun?.id !== local.runId) {
        status = "queued";
      } else if (dbRun && FAILED_RUN_STATUSES.includes(dbRun.status)) {
        status = "error";
        error = dbRun.error ?? `Research ${dbRun.status}. Try again.`;
      }

      return {
        entityId: entity?.id,
        logoUrl: entity?.logo_url ?? null,
        researched,
        threatIndex: entity ? threatByCompetitor[entity.id] : undefined,
        status,
        error,
      };
    },
    [entities, researchedIds, threatByCompetitor, pending, latestRuns],
  );

  const startResearch = useCallback(
    async (candidate: { name: string; website: string; description?: string }) => {
      if (!accountId) return;
      const key = candidate.website || candidate.name;
      setPending((prev) => ({ ...prev, [key]: { status: "starting" } }));
      try {
        // 1. Find-or-create the competitor entity (unique on account + lower(website_url)).
        const host = hostOf(candidate.website);
        let entity = entities.find((row) =>
          host ? hostOf(row.website_url) === host : row.name.toLowerCase() === candidate.name.toLowerCase(),
        );
        if (!entity) {
          const { data: inserted, error: insertError } = await supabase
            .from("companies")
            .insert({
              account_id: accountId,
              name: candidate.name,
              website_url: candidate.website || null,
              description: candidate.description ?? null,
              is_competitor: true,
              created_by: user?.id ?? null,
            })
            .select("id, name, website_url, logo_url")
            .single();
          if (insertError) {
            // Unique-violation race: another tab created it — re-read.
            const { data: existing } = await supabase
              .from("companies")
              .select("id, name, website_url, logo_url")
              .eq("account_id", accountId)
              .eq("is_competitor", true);
            entity = (existing ?? []).find((row) => hostOf(row.website_url) === host) as
              | CompetitorEntity
              | undefined;
            if (!entity) throw new Error(insertError.message);
          } else {
            entity = inserted as CompetitorEntity;
          }
        }

        // 2. Ensure a business_context_version exists — the research job requires
        // one (live failure 2026-07-04: accounts predating versioned context have
        // none). Same ensure pattern as useCanvasSectionRun.
        let contextVersionId: string;
        const { data: existingContext } = await supabase
          .from("business_context_versions")
          .select("id")
          .eq("account_id", accountId)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingContext) {
          contextVersionId = existingContext.id;
        } else {
          const { data: newContext, error: ctxError } = await supabase
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
          if (ctxError || !newContext) {
            throw new Error(`Failed to create business context: ${ctxError?.message ?? "unknown"}`);
          }
          contextVersionId = newContext.id;
        }

        // 3. Resolve the orchestrator profile (owner of cross-section research).
        const { data: profiles, error: profileError } = await supabase
          .from("agent_profiles")
          .select("id, account_id")
          .eq("agent_key", "orchestrator")
          .or(`account_id.eq.${accountId},account_id.is.null`)
          .order("account_id", { ascending: false, nullsFirst: false })
          .limit(1);
        const profile = profiles?.[0];
        if (profileError || !profile) {
          throw new Error("No orchestrator agent profile found for this account.");
        }

        // 4. Enqueue competitor_research; the worker chains gap_engine on completion.
        const runtime = getAgentRuntime(accountId);
        const { runId } = await runtime.startRun({
          agentProfileId: profile.id,
          accountId,
          runType: "competitor_research",
          triggerType: "manual",
          triggeredBy: user?.id ?? null,
          input: {
            competitor_id: entity.id,
            competitor_url: entity.website_url ?? candidate.website,
            business_context_version_id: contextVersionId,
          },
        });

        setPending((prev) => ({ ...prev, [key]: { status: "queued", entityId: entity?.id, runId } }));
        setRefreshTick((tick) => tick + 1);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start competitor research";
        setPending((prev) => ({ ...prev, [key]: { status: "error", error: message } }));
      }
    },
    [accountId, user, entities],
  );

  return { stateFor, startResearch, ready: Boolean(accountId) };
}
