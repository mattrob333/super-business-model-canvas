import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { loadCompanyScope } from "@/lib/company-scope";
import { AGENT_ROSTER } from "@/lib/agent-roster";
import { CANVAS_SECTION_KEYS, CANVAS_SECTION_LABELS } from "@/components/canvas/section-types";

/**
 * The War Room's document shelf — Atlas sees everything the team produces.
 * Recent skill artifacts from EVERY room (company-scoped like all reads),
 * each opening its full document page. Skill keys are "<callsign>.<skill>",
 * so the room attribution comes straight from the key prefix.
 */

interface ShelfArtifact {
  id: string;
  skill_key: string;
  title: string;
  created_at: string;
  /** Workflow artifacts only: an upstream input changed since this was written. */
  stale?: boolean;
  kind: "skill" | "workflow";
}

const REFRESH_MS = 30_000;

const CALLSIGN_BY_PREFIX = new Map(
  CANVAS_SECTION_KEYS.map((key) => {
    const entry = AGENT_ROSTER[key];
    return [entry.callsign.toLowerCase(), entry] as const;
  }),
);

export function WarRoomShelf({ accountId }: { accountId: string }) {
  const [artifacts, setArtifacts] = useState<ShelfArtifact[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const scope = await loadCompanyScope(accountId).catch(() => null);
    let query = supabaseUntyped
      .from<{ id: string; skill_key: string; title: string; created_at: string }>("skill_artifacts")
      .select("id, skill_key, title, created_at")
      .eq("account_id", accountId);
    if (scope) query = query.in("business_context_version_id", scope.contextIds);
    const [{ data: skillRows, error: skillError }, { data: workflowRows, error: workflowError }] = await Promise.all([
      query.order("created_at", { ascending: false }).limit(10),
      // Workflow reports (Atlas runs) share the shelf. Account-scoped like
      // the brain they read from; the run card's "saved to the shelf" copy
      // depends on this list.
      supabaseUntyped
        .from<{ id: string; workflow_id: string; title: string; stale: boolean; created_at: string }>("workflow_artifacts")
        .select("id, workflow_id, title, stale, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    // Briefings auto-generate — only the NEWEST one earns shelf space, or a
    // week of briefings would bury the documents the team actually made.
    let briefingKept = false;
    const dedupedSkillRows = (skillRows ?? []).filter((row) => {
      if (row.skill_key !== "atlas.state_of_the_union") return true;
      if (briefingKept) return false;
      briefingKept = true;
      return true;
    });
    const merged: ShelfArtifact[] = [
      ...(skillError ? [] : dedupedSkillRows.map((row) => ({ ...row, kind: "skill" as const }))),
      ...(workflowError ? [] : (workflowRows ?? []).map((row) => ({
        id: row.id,
        skill_key: `workflow.${row.workflow_id}`,
        title: row.title,
        created_at: row.created_at,
        stale: row.stale,
        kind: "workflow" as const,
      }))),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10);
    setArtifacts(merged);
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Document shelf — all rooms
      </h2>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : artifacts.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          No documents yet. When any agent runs a skill, the finished document
          lands here — the War Room sees the whole board.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {artifacts.map((artifact) => {
            const prefix = artifact.skill_key.split(".")[0] ?? "";
            const entry = CALLSIGN_BY_PREFIX.get(prefix);
            return (
              <li key={artifact.id}>
                <Link
                  to={`/artifacts/${artifact.id}`}
                  className="block rounded-md border border-border/60 p-2 transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{artifact.title}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
                        {artifact.kind === "workflow" ? (
                          <Badge variant="outline" className="px-1 py-0 text-[9px]">
                            Workflow
                          </Badge>
                        ) : artifact.skill_key === "atlas.state_of_the_union" ? (
                          <Badge variant="outline" className="px-1 py-0 text-[9px] text-primary">
                            Atlas
                          </Badge>
                        ) : entry ? (
                          <Badge variant="outline" className={`px-1 py-0 text-[9px] ${entry.avatarClass}`}>
                            {CANVAS_SECTION_LABELS[entry.sectionKey]}
                          </Badge>
                        ) : null}
                        {artifact.stale && (
                          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1 py-0 text-[9px] font-medium text-amber-600 dark:text-amber-400">
                            stale
                          </span>
                        )}
                        {new Date(artifact.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
