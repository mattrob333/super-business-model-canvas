import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { useAccountId } from "@/hooks/useAccountId";
import { useAuth } from "@/hooks/useAuth";
import { getAgentRuntime } from "@/lib/agent-runtime";

/**
 * RF-4-1: the user-reachable entry point for competitor research.
 *
 * For each analysis-suggested competitor this hook knows whether a persisted
 * `companies` entity already exists (matched by website host, else exact name),
 * exposes its latest Threat Index, and can kick off the full chain:
 * create entity -> enqueue `competitor_research` (the worker chains `gap_engine`
 * on completion).
 */

export interface CompetitorEntity {
  id: string;
  name: string;
  website_url: string | null;
}

export interface CompetitorResearchState {
  /** companies.id when the competitor is persisted for this account */
  entityId?: string;
  /** true when research has produced canvas versions for this competitor */
  researched: boolean;
  /** latest competitor.threat_index snapshot value, if the gap engine has run */
  threatIndex?: number;
  status: "idle" | "starting" | "queued" | "error";
  error?: string;
}

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
  type PendingState = { status: CompetitorResearchState["status"]; error?: string; entityId?: string };
  const [pending, setPending] = useState<Record<string, PendingState>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      const [companiesRes, versionsRes, metricsRes] = await Promise.all([
        supabase
          .from("companies")
          .select("id, name, website_url")
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
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, refreshTick]);

  const stateFor = useCallback(
    (candidate: { name: string; website: string }): CompetitorResearchState => {
      const key = candidate.website || candidate.name;
      const host = hostOf(candidate.website);
      const entity = entities.find((row) =>
        host ? hostOf(row.website_url) === host : row.name.toLowerCase() === candidate.name.toLowerCase(),
      );
      const local = pending[key];
      const researched = Boolean(entity && researchedIds.has(entity.id));
      return {
        entityId: entity?.id,
        researched,
        threatIndex: entity ? threatByCompetitor[entity.id] : undefined,
        status: local?.status ?? "idle",
        error: local?.error,
      };
    },
    [entities, researchedIds, threatByCompetitor, pending],
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
            .select("id, name, website_url")
            .single();
          if (insertError) {
            // Unique-violation race: another tab created it — re-read.
            const { data: existing } = await supabase
              .from("companies")
              .select("id, name, website_url")
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
        await runtime.startRun({
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

        setPending((prev) => ({ ...prev, [key]: { status: "queued", entityId: entity?.id } }));
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
