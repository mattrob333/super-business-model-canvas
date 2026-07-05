import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
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
  const [loading, setLoading] = useState(true);
  const [runningKey, setRunningKey] = useState<string | null>(null);

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

  const runSkill = useCallback(async (skill: CatalogSkill) => {
    if (!skill.implemented || runningKey) return;
    setRunningKey(skill.skill_key);
    try {
      const contextVersionId = await ensureBusinessContext();
      await getAgentRuntime(accountId).startRun({
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
      toast({
        title: `${skill.title} queued`,
        description: "The artifact appears on the shelf when the run completes.",
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
  }, [accountId, agentProfileId, ensureBusinessContext, runningKey, toast, user]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Wrench className="h-4 w-4 text-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Actions
        </h2>
      </div>

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
                disabled={!skill.implemented || runningKey !== null}
                onClick={() => void runSkill(skill)}
              >
                {runningKey === skill.skill_key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {skill.implemented ? "Run" : "Coming"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
