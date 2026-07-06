import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccountId } from "@/hooks/useAccountId";
import { useActiveAnalysis } from "@/hooks/useActiveAnalysis";
import { useCanvasEvidence } from "@/hooks/useCanvasEvidence";
import type { CanvasItemEvidence } from "@/components/canvas/CanvasSectionCard";
import {
  CANVAS_SECTION_KEYS,
  LEGACY_SECTION_KEYS,
  type CanvasSectionKey,
} from "@/components/canvas/section-types";
import { AGENT_ROSTER } from "@/lib/agent-roster";
import { AgentIdentityCard, type AgentRunSnapshot } from "@/components/workspace/AgentIdentityCard";
import { SectionCanvasPanel } from "@/components/workspace/SectionCanvasPanel";
import { WorkspaceActionsPanel } from "@/components/workspace/WorkspaceActionsPanel";
import { WorkspaceRunQueue } from "@/components/workspace/WorkspaceRunQueue";
import { WorkspaceThread } from "@/components/workspace/WorkspaceThread";
import { WorkspaceTopBar } from "@/components/workspace/WorkspaceTopBar";

/**
 * Spec 02 — the section agent's full-screen room (5B slice 1: the chassis).
 * Renders outside the AppShell content column: slim top bar, identity +
 * section canvas in the left rail, the persistent chat thread in the center,
 * and the run queue on the right. Instrument strip, actions-panel tabs,
 * proposals with approve/decline, and the settings sheet arrive in the
 * following 5B slices.
 */
export default function Workspace() {
  const { sectionKey: rawSectionKey } = useParams();
  const sectionKey = (CANVAS_SECTION_KEYS as readonly string[]).includes(rawSectionKey ?? "")
    ? (rawSectionKey as CanvasSectionKey)
    : null;

  if (!sectionKey) return <Navigate to="/canvas" replace />;
  return <WorkspaceRoom sectionKey={sectionKey} />;
}

function WorkspaceRoom({ sectionKey }: { sectionKey: CanvasSectionKey }) {
  const { accountId, loading: accountLoading } = useAccountId();
  const entry = AGENT_ROSTER[sectionKey];
  const [profile, setProfile] = useState<{ id: string; description: string | null } | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<AgentRunSnapshot | null>(null);
  const { itemsBySection, loading: canvasLoading } = useCanvasEvidence();

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    setProfile(null);
    setProfileError(null);
    (async () => {
      // Account-scoped profile wins over the global template (RF-4-13 pattern).
      const { data, error } = await supabase
        .from("agent_profiles")
        .select("id, description, account_id")
        .eq("agent_key", entry.agentKey)
        .or(`account_id.eq.${accountId},account_id.is.null`)
        .order("account_id", { ascending: false, nullsFirst: false })
        .limit(1);
      if (cancelled) return;
      if (error || !data?.[0]) {
        setProfileError(error?.message ?? `No agent profile found for ${entry.callsign}. Run the seed migration.`);
        return;
      }
      setProfile({ id: data[0].id, description: data[0].description });
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, entry]);

  // Same fallback order as the canvas page: versioned items with evidence
  // first, else the legacy analysis strings — the room must never claim the
  // section is empty while the canvas shows items.
  const { activeAnalysis } = useActiveAnalysis();
  const items = useMemo<CanvasItemEvidence[]>(() => {
    const versioned = itemsBySection[sectionKey];
    if (versioned && versioned.length > 0) return versioned;
    const legacy = activeAnalysis?.data?.[LEGACY_SECTION_KEYS[sectionKey]];
    return Array.isArray(legacy)
      ? legacy
          .filter((text): text is string => typeof text === "string" && text.length > 0)
          .map((text) => ({ text }))
      : [];
  }, [itemsBySection, sectionKey, activeAnalysis]);
  const handleLatestRun = useCallback((run: AgentRunSnapshot | null) => setLatestRun(run), []);

  if (accountLoading || (!profile && !profileError)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-grid-subtle">
      <WorkspaceTopBar sectionKey={sectionKey} />

      {profileError || !accountId || !profile ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-md text-center text-sm text-muted-foreground" role="alert">
            {profileError ?? "Account not resolved yet — reload to try again."}
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-12 lg:overflow-hidden">
          {/* Left rail — identity + the section's live canvas */}
          <aside className="space-y-4 lg:col-span-3 lg:overflow-y-auto lg:pr-1">
            <AgentIdentityCard
              accountId={accountId}
              agentProfileId={profile.id}
              sectionKey={sectionKey}
              description={profile.description}
              latestRun={latestRun}
            />
            <SectionCanvasPanel sectionKey={sectionKey} items={items} loading={canvasLoading} />
          </aside>

          {/* Center — the collaboration thread */}
          <main className="flex min-h-[60vh] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:col-span-6 lg:min-h-0">
            <WorkspaceThread
              accountId={accountId}
              agentProfileId={profile.id}
              sectionKey={sectionKey}
            />
          </main>

          {/* Right rail — room actions + run queue */}
          <aside className="space-y-4 lg:col-span-3 lg:overflow-y-auto lg:pl-1">
            <WorkspaceActionsPanel
              accountId={accountId}
              agentProfileId={profile.id}
              agentKey={entry.agentKey}
            />
            <WorkspaceRunQueue
              accountId={accountId}
              agentProfileId={profile.id}
              onLatestRun={handleLatestRun}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
