import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FocusDrawer } from "@/components/overlay/FocusDrawer";
import { ArtifactDocument } from "@/components/skills/ArtifactDocument";
import type { Json } from "@/integrations/supabase/types";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { loadCompanyScope } from "@/lib/company-scope";
import { ARTIFACT_CREATED_EVENT } from "@/hooks/useRoomSkills";

interface SkillArtifact {
  id: string;
  skill_key: string;
  title: string;
  body_md: string;
  payload: Json;
  evidence_ids: string[];
  created_at: string;
}

/** New artifacts land while the user is in the room — keep the shelf live. */
const ARTIFACT_REFRESH_MS = 30_000;

/**
 * The Shelf: every document this room's agent has produced, newest first,
 * opening in the spec 11 paper document. Skill RUNNING moved into the room
 * hero (owner design round 2026-07-08) — this rail is outputs only, so the
 * work product stays in the room instead of hiding on the Dashboard.
 */
export function WorkspaceActionsPanel({
  accountId,
  agentKey,
}: {
  accountId: string;
  agentKey: string;
}) {
  const [skillKeys, setSkillKeys] = useState<string[]>([]);
  const [artifacts, setArtifacts] = useState<SkillArtifact[]>([]);
  const [openArtifact, setOpenArtifact] = useState<SkillArtifact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabaseUntyped
        .from<{ skill_key: string }>("skill_catalog")
        .select("skill_key")
        .eq("agent_key", agentKey);
      if (cancelled) return;
      setSkillKeys(error ? [] : (data ?? []).map((row) => row.skill_key));
    })();
    return () => {
      cancelled = true;
    };
  }, [agentKey]);

  const loadArtifacts = useCallback(async () => {
    if (skillKeys.length === 0) {
      setArtifacts([]);
      setLoading(false);
      return;
    }
    // The shelf shows the ACTIVE company's artifacts only — a company switch
    // must not leave the previous company's documents on display.
    const scope = await loadCompanyScope(accountId).catch(() => null);
    let query = supabaseUntyped
      .from<SkillArtifact>("skill_artifacts")
      .select("id, skill_key, title, body_md, payload, evidence_ids, created_at")
      .eq("account_id", accountId)
      .in("skill_key", skillKeys);
    if (scope) query = query.in("business_context_version_id", scope.contextIds);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(12);
    setArtifacts(error ? [] : data ?? []);
    setLoading(false);
  }, [accountId, skillKeys]);

  useEffect(() => {
    void loadArtifacts();
    const timer = setInterval(() => void loadArtifacts(), ARTIFACT_REFRESH_MS);
    // The hero announces a finished run this way — refresh immediately
    // instead of waiting out the poll interval.
    const onCreated = () => void loadArtifacts();
    window.addEventListener(ARTIFACT_CREATED_EVENT, onCreated);
    return () => {
      clearInterval(timer);
      window.removeEventListener(ARTIFACT_CREATED_EVENT, onCreated);
    };
  }, [loadArtifacts]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Shelf
        </h2>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Documents this room has produced, newest first. Run an action above the chat to add one.
      </p>

      {loading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading…</p>
      ) : artifacts.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Nothing here yet — run one of the actions above the chat and the finished document lands here.
        </p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {artifacts.map((artifact) => (
            <div
              key={artifact.id}
              className="flex items-center gap-1 rounded-md border border-border/60 transition-colors hover:border-primary/35 hover:bg-muted/40"
            >
              <button
                type="button"
                onClick={() => setOpenArtifact(artifact)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2.5 py-2 text-left"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate text-xs font-medium">{artifact.title}</span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {new Date(artifact.created_at).toLocaleDateString()}
                </span>
              </button>
              <Button asChild size="icon" variant="ghost" className="mr-1 h-7 w-7 shrink-0" title="Open full page">
                <Link to={`/artifacts/${artifact.id}`}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          ))}
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
        {openArtifact && (
          <div className="space-y-3">
            <div className="artifact-print-actions flex justify-end">
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link to={`/artifacts/${openArtifact.id}`}>
                  <ExternalLink className="h-4 w-4" />
                  Open full page
                </Link>
              </Button>
            </div>
            <ArtifactDocument artifact={openArtifact} />
          </div>
        )}
      </FocusDrawer>
    </section>
  );
}
