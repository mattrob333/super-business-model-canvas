import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Play, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FocusDrawer } from "@/components/overlay/FocusDrawer";
import { ArtifactDocument } from "@/components/skills/ArtifactDocument";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
// Both tables sit beyond the generated Database type's TS2589 depth horizon —
// documented escape hatch (src/lib/supabase-untyped.ts), explicit row types.
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { useAccountId } from "@/hooks/useAccountId";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getAgentRuntime } from "@/lib/agent-runtime";

interface CatalogSkill {
  skill_key: string;
  agent_key: string;
  title: string;
  description: string;
  implemented: boolean;
  sort_order: number;
}

interface SkillArtifact {
  id: string;
  skill_key: string;
  title: string;
  body_md: string;
  payload: Json;
  evidence_ids: string[];
  created_at: string;
}

/**
 * First 5B increment of the spec 10 ActionsPanel: the catalog (implemented
 * flags gate runnability — the rest reads as "coming"), plus the artifact
 * shelf. Full per-room actions arrive with the workspace rooms.
 */
export function SkillCatalogPanel() {
  const { accountId } = useAccountId();
  const { user } = useAuth();
  const { toast } = useToast();
  const [skills, setSkills] = useState<CatalogSkill[]>([]);
  const [artifacts, setArtifacts] = useState<SkillArtifact[]>([]);
  const [openArtifact, setOpenArtifact] = useState<SkillArtifact | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accountId) return;
    const [catalogRes, artifactsRes] = await Promise.all([
      supabaseUntyped
        .from<CatalogSkill>("skill_catalog")
        .select("skill_key, agent_key, title, description, implemented, sort_order")
        .order("sort_order", { ascending: true }),
      supabaseUntyped
        .from<SkillArtifact>("skill_artifacts")
        .select("id, skill_key, title, body_md, payload, evidence_ids, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    setSkills(catalogRes.error ? [] : catalogRes.data ?? []);
    setArtifacts(artifactsRes.error ? [] : artifactsRes.data ?? []);
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runSkill = useCallback(async (skill: CatalogSkill) => {
    if (!accountId || runningKey) return;
    setRunningKey(skill.skill_key);
    try {
      // Standing invariant: ensure a business context version before enqueueing.
      const { data: existingContext } = await supabase
        .from("business_context_versions")
        .select("id")
        .eq("account_id", accountId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      let contextVersionId = existingContext?.id;
      if (!contextVersionId) {
        const { data: created, error } = await supabase
          .from("business_context_versions")
          .insert({ account_id: accountId, version_number: 1, summary: "Initial business context", data: {}, created_by: user?.id ?? null })
          .select("id")
          .single();
        if (error || !created) throw new Error(error?.message ?? "Failed to create business context");
        contextVersionId = created.id;
      }
      const { data: profiles, error: profileError } = await supabase
        .from("agent_profiles")
        .select("id")
        .eq("agent_key", "orchestrator")
        .or(`account_id.eq.${accountId},account_id.is.null`)
        .order("account_id", { ascending: false, nullsFirst: false })
        .limit(1);
      const profile = profiles?.[0];
      if (profileError || !profile) throw new Error("No orchestrator profile found for this account.");

      await getAgentRuntime(accountId).startRun({
        agentProfileId: profile.id,
        accountId,
        runType: "skill_run",
        triggerType: "manual",
        triggeredBy: user?.id ?? null,
        input: { skill_key: skill.skill_key, business_context_version_id: contextVersionId },
      });
      toast({
        title: `${skill.title} queued`,
        description: "Takes a few minutes. The artifact appears below when it completes.",
      });
    } catch (error) {
      toast({
        title: "Skill did not start",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setRunningKey(null);
    }
  }, [accountId, runningKey, user, toast]);

  if (loading || skills.length === 0) return null;

  const implemented = skills.filter((skill) => skill.implemented);
  const upcoming = skills.filter((skill) => !skill.implemented);

  return (
    <section className="rounded-lg border border-border/60 bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Wrench className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold tracking-tight">Agent skills</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Signature workflows your agents can run. Each produces an evidence-cited artifact.
      </p>

      <div className="mt-4 space-y-2">
        {implemented.map((skill) => (
          <div key={skill.skill_key} className="flex items-start justify-between gap-3 rounded-md border border-border/60 p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{skill.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{skill.description}</p>
            </div>
            <Button
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={runningKey !== null}
              onClick={() => void runSkill(skill)}
            >
              {runningKey === skill.skill_key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run
            </Button>
          </div>
        ))}
        {upcoming.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {upcoming.length} more skills in the catalog roll out with the agent workspaces.
          </p>
        )}
      </div>

      {artifacts.length > 0 && (
        <div className="mt-5 border-t border-border/60 pt-4">
          <h3 className="text-sm font-semibold">Artifacts</h3>
          <div className="mt-2 space-y-2">
            {artifacts.map((artifact) => (
              <button
                key={artifact.id}
                type="button"
                onClick={() => setOpenArtifact(artifact)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-border/60 p-3 text-left transition-colors hover:border-primary/35"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate text-sm font-medium">{artifact.title}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(artifact.created_at).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <FocusDrawer
        open={Boolean(openArtifact)}
        onOpenChange={(open) => {
          if (!open) setOpenArtifact(null);
        }}
        size="reading"
        eyebrow="Skill artifact"
        title={openArtifact?.title ?? "Artifact"}
        subtitle={openArtifact ? `${openArtifact.skill_key} · ${openArtifact.evidence_ids.length} evidence sources` : undefined}
        bodyClassName="p-4 sm:p-6"
      >
        {openArtifact && <ArtifactDocument artifact={openArtifact} />}
      </FocusDrawer>
    </section>
  );
}
