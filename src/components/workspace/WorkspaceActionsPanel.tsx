import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Play, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FocusDrawer } from "@/components/overlay/FocusDrawer";
import { ArtifactDocument } from "@/components/skills/ArtifactDocument";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { getAgentRuntime } from "@/lib/agent-runtime";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface CatalogSkill {
  skill_key: string;
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

interface SkillRunState {
  skillKey: string;
  runId: string;
}

/** New artifacts land while the user is in the room — keep the shelf live. */
const ARTIFACT_REFRESH_MS = 30_000;
const RUN_POLL_INTERVAL_MS = 3_000;
const RUN_POLL_MAX_ATTEMPTS = 100;

/**
 * Spec 10 ActionsPanel, studio edition: the top half runs this agent's
 * signature skills; the bottom half is the output shelf — every artifact the
 * agent has produced, opening in the spec 11 paper document. The work
 * product stays in the room instead of hiding on the Dashboard.
 */
export function WorkspaceActionsPanel({
  accountId,
  agentProfileId,
  agentKey,
}: {
  accountId: string;
  agentProfileId: string;
  agentKey: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [skills, setSkills] = useState<CatalogSkill[]>([]);
  const [artifacts, setArtifacts] = useState<SkillArtifact[]>([]);
  const [openArtifact, setOpenArtifact] = useState<SkillArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningRun, setRunningRun] = useState<SkillRunState | null>(null);
  const [tileErrors, setTileErrors] = useState<Record<string, string>>({});
  const pollTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(pollTimer.current), []);

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

  const loadArtifacts = useCallback(async (skillKeys: string[]) => {
    if (skillKeys.length === 0) {
      setArtifacts([]);
      return;
    }
    const { data, error } = await supabaseUntyped
      .from<SkillArtifact>("skill_artifacts")
      .select("id, skill_key, title, body_md, payload, evidence_ids, created_at")
      .eq("account_id", accountId)
      .in("skill_key", skillKeys)
      .order("created_at", { ascending: false })
      .limit(8);
    setArtifacts(error ? [] : data ?? []);
  }, [accountId]);

  useEffect(() => {
    const skillKeys = skills.map((skill) => skill.skill_key);
    void loadArtifacts(skillKeys);
    const timer = setInterval(() => void loadArtifacts(skillKeys), ARTIFACT_REFRESH_MS);
    return () => clearInterval(timer);
  }, [skills, loadArtifacts]);

  const ensureBusinessContext = useCallback(async (): Promise<string> => {
    const { data: existingContext } = await supabase
      .from("business_context_versions")
      .select("id")
      .eq("account_id", accountId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingContext?.id) return existingContext.id;

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
      setTileErrors((prev) => ({
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
          void loadArtifacts(skills.map((entry) => entry.skill_key));
        } else {
          setTileErrors((prev) => ({
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
  }, [accountId, loadArtifacts, skills, toast]);

  const runSkill = useCallback(async (skill: CatalogSkill) => {
    if (!skill.implemented || runningRun) return;
    setTileErrors((prev) => ({ ...prev, [skill.skill_key]: "" }));
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
        description: "Takes a few minutes. The finished document appears on the shelf below.",
      });
      pollSkillRun(skill, runId, 0);
    } catch (error) {
      setRunningRun(null);
      setTileErrors((prev) => ({
        ...prev,
        [skill.skill_key]: error instanceof Error ? error.message : "Try again.",
      }));
      toast({
        title: "Skill did not start",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    }
  }, [accountId, agentProfileId, ensureBusinessContext, pollSkillRun, runningRun, toast, user]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Wrench className="h-4 w-4 text-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Studio
        </h2>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Run a signature workflow — the finished document lands on the shelf below.
      </p>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : skills.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          No room-specific skills are assigned yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {skills.map((skill) => (
            <li key={skill.skill_key} className="rounded-md border border-border/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug">{skill.title}</p>
                  <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {skill.description}
                  </p>
                </div>
                {!skill.implemented && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    Coming
                  </Badge>
                )}
              </div>
              <Button
                size="sm"
                className="mt-3 h-8 w-full gap-1.5"
                variant={skill.implemented ? "default" : "outline"}
                disabled={!skill.implemented || runningRun !== null}
                onClick={() => void runSkill(skill)}
              >
                {runningRun?.skillKey === skill.skill_key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {runningRun?.skillKey === skill.skill_key ? "Running" : skill.implemented ? "Run" : "Coming"}
              </Button>
              {tileErrors[skill.skill_key] && (
                <p className="mt-2 text-xs leading-relaxed text-destructive">
                  {tileErrors[skill.skill_key]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {artifacts.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Shelf
          </h3>
          <div className="mt-2 space-y-1.5">
            {artifacts.map((artifact) => (
              <button
                key={artifact.id}
                type="button"
                onClick={() => setOpenArtifact(artifact)}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-2 text-left transition-colors hover:border-primary/35 hover:bg-muted/40"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate text-xs font-medium">{artifact.title}</span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
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
        size="focus"
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
