import { useState } from "react";
import { AlertTriangle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ATLAS } from "@/lib/agent-roster";
import { AgentSettingsSheet } from "@/components/workspace/AgentSettingsSheet";
import type { AgentRunSnapshot } from "@/components/workspace/AgentIdentityCard";

/**
 * The name on the War Room door — Atlas's counterpart to the section rooms'
 * AgentIdentityCard (spec 02 zone 1a, spec 12 identity). Same live status
 * from the latest run, same quiet settings button into the shared
 * prompt/behavior sheet, Atlas's own scope line instead of a canvas section.
 */
export function AtlasIdentityCard({
  accountId,
  agentProfileId,
  description,
  latestRun,
}: {
  accountId: string;
  agentProfileId: string;
  description: string | null;
  latestRun: AgentRunSnapshot | null;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const Icon = ATLAS.icon;

  const running = latestRun?.status === "pending" || latestRun?.status === "running";
  const attention = latestRun?.status === "failed" || latestRun?.status === "timeout";

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-2 ${ATLAS.avatarClass}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-tight">{ATLAS.callsign}</h1>
            <p className="text-xs text-muted-foreground">{ATLAS.role}</p>
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px]">
              {running ? (
                <>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  <span className="text-primary">active — in a run</span>
                </>
              ) : attention ? (
                <>
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  <span className="text-destructive" title={latestRun?.error ?? undefined}>
                    needs attention — last run failed
                  </span>
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  <span className="text-muted-foreground">standing by</span>
                </>
              )}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          onClick={() => setSettingsOpen(true)}
          aria-label="Atlas settings"
          title="Atlas settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {description ??
          "Sees all nine sections, the competitor set, and the Gap Register — and turns them into one ordered path. Atlas directs; the section specialists execute in their rooms."}
      </p>

      <AgentSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        accountId={accountId}
        agentProfileId={agentProfileId}
        callsign={ATLAS.callsign}
      />
    </section>
  );
}
