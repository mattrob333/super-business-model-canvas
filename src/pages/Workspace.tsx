import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccountId } from "@/hooks/useAccountId";
import { useActiveAnalysis } from "@/hooks/useActiveAnalysis";
import { useAuth } from "@/hooks/useAuth";
import { useCanvasEvidence } from "@/hooks/useCanvasEvidence";
import { getActiveAnalysisCanvas, setActiveAnalysis } from "@/lib/active-analysis";
import type { CanvasItemEvidence } from "@/components/canvas/CanvasSectionCard";
import {
  CANVAS_SECTION_KEYS,
  LEGACY_SECTION_KEYS,
  type CanvasSectionKey,
} from "@/components/canvas/section-types";
import { AGENT_ROSTER } from "@/lib/agent-roster";
import { AgentIdentityCard, type AgentRunSnapshot } from "@/components/workspace/AgentIdentityCard";
import { ContextSourcesPanel } from "@/components/workspace/ContextSourcesPanel";
import { MobileCollapse } from "@/components/workspace/MobileCollapse";
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
  const [composerPrefill, setComposerPrefill] = useState<string | null>(null);
  const { itemsBySection, loading: canvasLoading } = useCanvasEvidence();

  // Arriving from the Gap Register ("Fix with <agent>"): load the gap and
  // hand the thread an opening brief so the agent starts working the problem
  // instead of greeting an empty room.
  const [searchParams] = useSearchParams();
  const gapId = searchParams.get("gap");
  const [gapPrompt, setGapPrompt] = useState<string | null>(null);
  useEffect(() => {
    if (!gapId || !accountId) return;
    // One-shot per gap per tab: rooms now open on a FRESH thread, so the old
    // "only send into an empty thread" guard would re-fire this brief on
    // every refresh of a ?gap= URL.
    try {
      const key = `sbmc:gap-sent:${gapId}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Blocked storage: fall through — worst case is a duplicate brief.
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("gaps")
        .select("title, description, recommended_action")
        .eq("id", gapId)
        .eq("account_id", accountId)
        .maybeSingle();
      if (cancelled || !data) return;
      const parts = [
        `I came here from the Gap Register to work on this gap: "${data.title}".`,
        data.description ? `Details: ${data.description}` : null,
        data.recommended_action ? `The register recommends: ${data.recommended_action}` : null,
        "Walk me through how to close this gap — what exactly do we need, how do I get it, and what should we do first?",
      ].filter(Boolean);
      setGapPrompt(parts.join("\n\n"));
    })();
    return () => {
      cancelled = true;
    };
  }, [gapId, accountId]);

  // Arriving from an Atlas directive ("Open {agent}'s room" on the dock):
  // consume the stashed brief (one-shot — a refresh finds nothing and sends
  // nothing) and hand the thread a delegation the agent must acknowledge.
  const fromAtlas = searchParams.get("from") === "atlas";
  const [atlasPrompt, setAtlasPrompt] = useState<string | null>(null);
  useEffect(() => {
    if (!fromAtlas) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem("atlas:handoff");
      sessionStorage.removeItem("atlas:handoff");
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const handoff = JSON.parse(raw) as { room?: string; action?: string; why?: string; skillTitle?: string | null; headline?: string };
      if (handoff.room !== sectionKey || !handoff.action) return;
      const parts = [
        `Atlas, the chief strategist, has delegated a task to you.`,
        `Directive: ${handoff.action}`,
        handoff.why ? `Why it matters: ${handoff.why}` : null,
        handoff.skillTitle ? `Atlas suggests your "${handoff.skillTitle}" skill for this.` : null,
        handoff.headline ? `Atlas's current read on the business: ${handoff.headline}` : null,
        `Acknowledge the task, then get to work: lay out exactly how you'll close it, start whatever you can from here, and tell me precisely what you need from me for the rest.`,
      ].filter(Boolean);
      setAtlasPrompt(parts.join("\n\n"));
    } catch {
      // Malformed handoff: open the room normally.
    }
  }, [fromAtlas, sectionKey]);

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
  const { user } = useAuth();

  // The legacy strings live behind a session pointer that only the canvas
  // surfaces set. Landing in a room without it (fresh tab, mobile, direct
  // link) left this panel claiming "no items" while the canvas had bullets —
  // restore the pointer from the latest saved analysis so every surface
  // agrees on the company.
  useEffect(() => {
    if (activeAnalysis || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("saved_analyses")
        .select("id, analysis_data")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data?.analysis_data || typeof data.analysis_data !== "object") return;
      setActiveAnalysis({ id: data.id, data: data.analysis_data as Record<string, unknown> });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeAnalysis, user]);
  const items = useMemo<CanvasItemEvidence[]>(() => {
    const versioned = itemsBySection[sectionKey];
    if (versioned && versioned.length > 0) return versioned;
    // Analysis payloads nest the nine sections under `canvas`; a top-level
    // read returned undefined for every section and the room claimed the
    // canvas was empty while it had bullets (owner finding 2026-07-06).
    const legacy = getActiveAnalysisCanvas(activeAnalysis?.data)?.[LEGACY_SECTION_KEYS[sectionKey]];
    return Array.isArray(legacy)
      ? legacy
          .filter((text): text is string => typeof text === "string" && text.length > 0)
          .map((text) => ({ text }))
      : [];
  }, [itemsBySection, sectionKey, activeAnalysis]);
  const handleLatestRun = useCallback((run: AgentRunSnapshot | null) => setLatestRun(run), []);
  // One-shot briefs: clear them the moment the thread consumes them. The
  // sessionStorage guards above only stop the prompt being REBUILT — this
  // state survives the thread unmounting, and handing a remounted thread the
  // same prompt re-sent it and fired a duplicate agent run (owner repro
  // 2026-07-08: switching browser tabs and back).
  const handleInitialPromptConsumed = useCallback(() => {
    setGapPrompt(null);
    setAtlasPrompt(null);
  }, []);
  const handleVerifyAssumption = useCallback((text: string) => {
    setComposerPrefill(
      `Let's verify this assumption: «${text}». Research it with your tools and propose an evidence-backed replacement through the proposal loop — or tell me what information you need from me.`,
    );
  }, []);

  if (accountLoading || (!profile && !profileError)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-grid-subtle">
      <WorkspaceTopBar room={sectionKey} />

      {profileError || !accountId || !profile ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-md text-center text-sm text-muted-foreground" role="alert">
            {profileError ?? "Account not resolved yet — reload to try again."}
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-12 lg:overflow-hidden">
          {/* Left rail — identity + the section's live canvas. On mobile the
              chat leads and these panels collapse (owner pass 2026-07-06). */}
          <aside className="order-2 space-y-3 lg:order-1 lg:col-span-3 lg:space-y-4 lg:overflow-y-auto lg:pr-1">
            <MobileCollapse title={`About ${entry.callsign}`}>
              <AgentIdentityCard
                accountId={accountId}
                agentProfileId={profile.id}
                sectionKey={sectionKey}
                description={profile.description}
                latestRun={latestRun}
              />
            </MobileCollapse>
            <MobileCollapse title="Section canvas" defaultOpen>
              <SectionCanvasPanel
                sectionKey={sectionKey}
                items={items}
                loading={canvasLoading}
                onVerifyAssumption={handleVerifyAssumption}
              />
            </MobileCollapse>
            <MobileCollapse title="Context sources">
              <ContextSourcesPanel accountId={accountId} agentProfileId={profile.id} />
            </MobileCollapse>
            {/* Activity lives with context on the left — the right rail is the
                Studio: outputs only (owner direction 2026-07-06). */}
            <MobileCollapse title="Recent activity">
              <WorkspaceRunQueue
                accountId={accountId}
                agentProfileId={profile.id}
                onLatestRun={handleLatestRun}
              />
            </MobileCollapse>
          </aside>

          {/* Center — the collaboration thread. On mobile it fills the first
              screenful exactly (viewport minus top bar and page padding) so
              the room reads as a full-screen chat; the supporting panels sit
              below the fold (owner directive 2026-07-06). */}
          <main className="order-1 flex min-h-[calc(100dvh-6.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:order-2 lg:col-span-6 lg:min-h-0">
            <WorkspaceThread
              accountId={accountId}
              agentProfileId={profile.id}
              sectionKey={sectionKey}
              initialPrompt={gapPrompt ?? atlasPrompt}
              initialThreadTitle={atlasPrompt ? "Directive from Atlas" : null}
              composerPrefill={composerPrefill}
              onComposerPrefillConsumed={() => setComposerPrefill(null)}
            />
          </main>

          {/* Right rail — room actions + run queue */}
          <aside className="order-3 space-y-3 lg:col-span-3 lg:space-y-4 lg:overflow-y-auto lg:pl-1">
            <MobileCollapse title="Studio and shelf">
              <WorkspaceActionsPanel
                accountId={accountId}
                agentProfileId={profile.id}
                agentKey={entry.agentKey}
              />
            </MobileCollapse>
          </aside>
        </div>
      )}
    </div>
  );
}
