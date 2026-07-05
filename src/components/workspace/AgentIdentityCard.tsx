import { AlertTriangle } from "lucide-react";
import type { CanvasSectionKey } from "@/components/canvas/section-types";
import { CANVAS_SECTION_LABELS } from "@/components/canvas/section-types";
import { AGENT_ROSTER } from "@/lib/agent-roster";

export interface AgentRunSnapshot {
  status: string;
  error: string | null;
}

/**
 * Spec 02 zone 1a — the name on the office door. Live status derives from the
 * agent's latest run: pending/running → active, failed/timeout → needs
 * attention, otherwise idle. The ⚙ behavior & prompt sheet arrives in a later
 * 5B slice; no dead affordance is rendered until then.
 */
export function AgentIdentityCard({
  sectionKey,
  description,
  latestRun,
}: {
  sectionKey: CanvasSectionKey;
  description: string | null;
  latestRun: AgentRunSnapshot | null;
}) {
  const entry = AGENT_ROSTER[sectionKey];
  const Icon = entry.icon;

  const running = latestRun?.status === "pending" || latestRun?.status === "running";
  const attention = latestRun?.status === "failed" || latestRun?.status === "timeout";

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-2 ${entry.avatarClass}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight">{entry.callsign}</h1>
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
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {description ??
          `Owns ${CANVAS_SECTION_LABELS[sectionKey]} on the canvas — evidence-cited items, proposals over silent edits.`}
      </p>
    </section>
  );
}
