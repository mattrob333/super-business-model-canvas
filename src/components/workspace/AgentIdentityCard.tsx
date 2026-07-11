import { useState } from "react";
import { AlertTriangle, Bot, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CanvasSectionKey } from "@/components/canvas/section-types";
import { AGENT_ROSTER } from "@/lib/agent-roster";
import { AgentSettingsSheet } from "@/components/workspace/AgentSettingsSheet";

export interface AgentRunSnapshot {
  status: string;
  error: string | null;
}

/**
 * Spec 02 zone 1a — the name on the office door. Live status derives from the
 * agent's latest run; the quiet settings button opens the prompt/behavior sheet.
 */
export function AgentIdentityCard({
  accountId,
  agentProfileId,
  sectionKey,
  latestRun,
}: {
  accountId: string;
  agentProfileId: string;
  sectionKey: CanvasSectionKey;
  latestRun: AgentRunSnapshot | null;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const entry = AGENT_ROSTER[sectionKey];

  const running = latestRun?.status === "pending" || latestRun?.status === "running";
  const attention = latestRun?.status === "failed" || latestRun?.status === "timeout";

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {/* Robot head, not the section icon — the hero already carries the
              section identity; this card is about the AGENT (owner call
              2026-07-11). */}
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-2 ${entry.avatarClass}`}>
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            {/* Function-first (owner call 2026-07-08): "Envoy" told a new
                user nothing; the hero card carries the room identity, this
                card is the status + settings surface. */}
            <h2 className="text-sm font-semibold leading-tight">{entry.displayName}</h2>
            <p className="text-xs text-muted-foreground">{entry.role}</p>
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px]">
              {running ? (
                <>
                  <span className={`h-1.5 w-1.5 animate-pulse rounded-full bg-current ${entry.accentTextClass}`} />
                  <span className={entry.accentTextClass}>active — in a run</span>
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
                  <span className="h-1.5 w-1.5 rounded-full border border-muted-foreground/60" />
                  <span className="text-muted-foreground">idle</span>
                </>
              )}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setSettingsOpen(true)}
          aria-label={`${entry.displayName} settings`}
          title={`${entry.displayName} settings`}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
      <AgentSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        accountId={accountId}
        agentProfileId={agentProfileId}
        callsign={entry.displayName}
      />
    </section>
  );
}
