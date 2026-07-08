import { useCallback, useEffect, useState } from "react";
import { AtlasChat } from "@/components/atlas/AtlasChat";
import { AtlasIdentityCard } from "@/components/atlas/AtlasIdentityCard";
import { BriefingCard } from "@/components/atlas/BriefingCard";
import { useAtlasBriefing } from "@/components/atlas/useAtlasBriefing";
import { WarRoomShelf } from "@/components/atlas/WarRoomShelf";
import type { AgentRunSnapshot } from "@/components/workspace/AgentIdentityCard";
import { ContextSourcesPanel } from "@/components/workspace/ContextSourcesPanel";
import { MobileCollapse } from "@/components/workspace/MobileCollapse";
import { WorkspaceRunQueue } from "@/components/workspace/WorkspaceRunQueue";
import { WorkspaceTopBar } from "@/components/workspace/WorkspaceTopBar";

/**
 * Spec 12 §6 — the full-page War Room on the SAME chassis as the section
 * rooms (owner directive 2026-07-07: "at least as good as the other agents'
 * workspaces"): top bar with the room switcher, identity + context sources +
 * activity in the left rail, the shared Atlas thread in the center, and the
 * Studio rail on the right. Atlas's Studio is the State of the Union briefing
 * plus the cross-room document shelf — the chief strategist sees everything
 * the team produces. Same Atlas, same thread, same briefing as the dock.
 */
export default function WarRoom() {
  const {
    accountId,
    profileId,
    profileDescription,
    profileError,
    briefing,
    briefingLoading,
    briefingError,
    refreshing,
    refreshError,
    refreshStalled,
    skillTitle,
    markSeen,
    requestBriefing,
  } = useAtlasBriefing();
  const [latestRun, setLatestRun] = useState<AgentRunSnapshot | null>(null);
  const handleLatestRun = useCallback((run: AgentRunSnapshot | null) => setLatestRun(run), []);

  // Entering the War Room reads the briefing — clear the dock's pulse.
  useEffect(() => {
    if (briefing) markSeen();
  }, [briefing, markSeen]);

  const briefingCard = (
    <BriefingCard
      loading={briefingLoading}
      error={briefingError}
      refreshing={refreshing}
      refreshError={refreshError}
      refreshStalled={refreshStalled}
      briefing={briefing}
      skillTitle={skillTitle}
      canRequest={Boolean(profileId)}
      onRequest={() => void requestBriefing()}
      hideWarRoomCta
    />
  );

  return (
    // dvh, not vh: mobile browser chrome must never eat the pinned composer.
    // Desktop is unchanged (100dvh === 100vh without dynamic chrome).
    <div className="flex h-dvh flex-col bg-grid-subtle">
      <WorkspaceTopBar room="atlas" />

      {profileError || !accountId || !profileId ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-md text-center text-sm text-muted-foreground" role="alert">
            {profileError ?? "Resolving Atlas — reload if this persists."}
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto overflow-x-hidden p-4 lg:grid-cols-12 lg:overflow-hidden">
          {/* Left rail — who Atlas is and what it works from. Mirrors the
              section rooms: identity, context sources, recent activity. */}
          <aside className="order-2 space-y-3 lg:order-1 lg:col-span-3 lg:space-y-4 lg:overflow-y-auto lg:pr-1">
            <MobileCollapse title="About Atlas">
              <AtlasIdentityCard
                accountId={accountId}
                agentProfileId={profileId}
                description={profileDescription}
                latestRun={latestRun}
              />
            </MobileCollapse>
            <MobileCollapse title="Context sources">
              <ContextSourcesPanel accountId={accountId} agentProfileId={profileId} />
            </MobileCollapse>
            <MobileCollapse title="Recent activity">
              <WorkspaceRunQueue
                accountId={accountId}
                agentProfileId={profileId}
                onLatestRun={handleLatestRun}
              />
            </MobileCollapse>
          </aside>

          {/* Center — the shared Atlas thread, full height like every room.
              On mobile the briefing rides at the top of the chat scroll.
              FIXED height (h-, not min-h-) below lg: min-h let the column
              grow with the thread, so the page scrolled and the composer
              scrolled away — a fixed-height card scrolls the messages inside
              and keeps the composer pinned at its bottom. */}
          <main className="order-1 flex h-[calc(100dvh-6.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:order-2 lg:col-span-6 lg:h-auto lg:min-h-0">
            <AtlasChat
              accountId={accountId}
              agentProfileId={profileId}
              briefingSlot={<div className="lg:hidden">{briefingCard}</div>}
            />
          </main>

          {/* Right rail — Atlas's Studio: the State of the Union and the
              cross-room document shelf. */}
          <aside className="order-3 space-y-3 lg:col-span-3 lg:space-y-4 lg:overflow-y-auto lg:pl-1">
            <div className="hidden lg:block">{briefingCard}</div>
            <MobileCollapse title="Document shelf">
              <WarRoomShelf accountId={accountId} />
            </MobileCollapse>
          </aside>
        </div>
      )}
    </div>
  );
}
