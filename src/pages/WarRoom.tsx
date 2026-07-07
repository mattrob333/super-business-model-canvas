import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ATLAS } from "@/lib/atlas";
import { AtlasChat } from "@/components/atlas/AtlasChat";
import { BriefingCard } from "@/components/atlas/BriefingCard";
import { useAtlasBriefing } from "@/components/atlas/useAtlasBriefing";
import { getActiveWorkspaceName } from "@/lib/active-workspace";

/**
 * Spec 12 §6 — the full-page War Room. Same Atlas, same thread, same briefing
 * as the dock (useAtlasBriefing + the shared "War Room" workspace thread),
 * with room to breathe: on desktop the State of the Union sits in a sticky
 * left rail beside a full-height chat; below lg the briefing rides at the top
 * of the chat scroll exactly like the dock's full-screen mobile mode.
 * Renders outside the AppShell with its own top bar, like the agent rooms.
 */
export default function WarRoom() {
  const {
    accountId,
    profileId,
    profileError,
    briefing,
    briefingLoading,
    briefingError,
    refreshing,
    refreshError,
    skillTitle,
    markSeen,
    requestBriefing,
  } = useAtlasBriefing();

  // Entering the War Room reads the briefing — clear the dock's pulse.
  useEffect(() => {
    if (briefing) markSeen();
  }, [briefing, markSeen]);

  const AtlasIcon = ATLAS.icon;
  const companyName = getActiveWorkspaceName();

  const briefingCard = (
    <BriefingCard
      loading={briefingLoading}
      error={briefingError}
      refreshing={refreshing}
      refreshError={refreshError}
      briefing={briefing}
      skillTitle={skillTitle}
      canRequest={Boolean(profileId)}
      onRequest={() => void requestBriefing()}
    />
  );

  return (
    <div className="flex h-dvh flex-col bg-grid-subtle">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Back to the canvas">
          <Link to="/canvas">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/40">
          <AtlasIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">War Room</p>
          <p className="truncate text-xs text-muted-foreground">
            {ATLAS.name}, {ATLAS.role}
            {companyName ? ` · ${companyName}` : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => void requestBriefing()}
          disabled={refreshing || !profileId}
          aria-label="Refresh briefing"
          title="Refresh briefing"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </Button>
      </header>

      {profileError || !accountId ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-md text-center text-sm text-muted-foreground" role="alert">
            {profileError ?? "Account not resolved yet — reload to try again."}
          </p>
        </div>
      ) : (
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 gap-4 p-0 lg:p-4">
          {/* Desktop: the State of the Union stays in view while you work the
              thread — that is the point of the full page. */}
          <aside className="hidden w-[380px] shrink-0 overflow-y-auto lg:block">
            {briefingCard}
          </aside>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card lg:rounded-lg lg:border lg:border-border lg:shadow-sm">
            {profileId ? (
              <AtlasChat
                accountId={accountId}
                agentProfileId={profileId}
                briefingSlot={<div className="lg:hidden">{briefingCard}</div>}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <p className="text-sm text-muted-foreground">Resolving Atlas…</p>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
