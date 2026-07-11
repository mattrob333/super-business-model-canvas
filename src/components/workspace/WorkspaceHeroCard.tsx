import { Link } from "react-router-dom";
import { ExternalLink, Loader2, Lock, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CanvasSectionKey } from "@/components/canvas/section-types";
import { CANVAS_SECTION_LABELS } from "@/components/canvas/section-types";
import { AGENT_ROSTER } from "@/lib/agent-roster";
import { WORKSPACE_HERO } from "@/lib/workspace-hero";
import { useRoomSkills, type CatalogSkill } from "@/hooks/useRoomSkills";

/**
 * The room's headpiece (owner design round 2026-07-08): its own card above
 * the chat, tinted with the room's accent so every room is unmistakably
 * itself. Carries the ONLY room title on the page (the top bar went
 * nav-only) and the room's three skills as the actual Run actions — the
 * right rail is just the shelf now.
 *
 * Adaptive: full headpiece while the thread is empty; once a conversation
 * exists it collapses to a slim strip so the working chat gets the space
 * back — the Run buttons stay reachable in both states.
 */
export function WorkspaceHeroCard({
  accountId,
  agentProfileId,
  sectionKey,
  collapsed,
}: {
  accountId: string;
  agentProfileId: string;
  sectionKey: CanvasSectionKey;
  collapsed: boolean;
}) {
  const entry = AGENT_ROSTER[sectionKey];
  const hero = WORKSPACE_HERO[sectionKey];
  const Icon = entry.icon;
  const { skills, runningRun, startingKey, skillErrors, runSkill, needsCompetitorResearch } =
    useRoomSkills(accountId, agentProfileId, entry.agentKey);
  const skillByKey = new Map(skills.map((skill) => [skill.skill_key, skill]));

  const runLabel = (skill: CatalogSkill | undefined) => {
    if (!skill) return "Run";
    if (startingKey === skill.skill_key) return "Starting…";
    if (runningRun?.skillKey === skill.skill_key) return "Running";
    if (needsCompetitorResearch(skill)) return "Needs research";
    return skill.implemented ? "Run" : "Coming";
  };
  const runIcon = (skill: CatalogSkill | undefined) => {
    if (skill && (startingKey === skill.skill_key || runningRun?.skillKey === skill.skill_key)) {
      return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    }
    if (skill && needsCompetitorResearch(skill)) return <Lock className="h-3.5 w-3.5" />;
    return <Play className="h-3.5 w-3.5" />;
  };
  const runDisabled = (skill: CatalogSkill | undefined) =>
    !skill || !skill.implemented || runningRun !== null || startingKey !== null || needsCompetitorResearch(skill);

  if (collapsed) {
    return (
      <section className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-2.5 shadow-sm ${entry.heroCardClass}`}>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ${entry.avatarClass}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold leading-tight tracking-tight">{CANVAS_SECTION_LABELS[sectionKey]}</h1>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">{hero.promise}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {hero.actions.map((action) => {
            const skill = skillByKey.get(action.skillKey);
            return (
              <Button
                key={action.skillKey}
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 bg-card px-2.5 text-xs"
                disabled={runDisabled(skill)}
                onClick={() => skill && void runSkill(skill)}
                title={action.outcome}
              >
                {runIcon(skill)}
                {action.skillTitle}
              </Button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className={`rounded-lg border p-5 shadow-sm ${entry.heroCardClass}`}>
      <div className="flex items-start gap-4">
        {/* Mascot slot: agent icon today, the room's character art when it lands. */}
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ring-1 ${entry.avatarClass}`}>
          <Icon className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${entry.accentTextClass}`}>
            Your {entry.displayName}
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {CANVAS_SECTION_LABELS[sectionKey]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{hero.promise}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {hero.actions.map((action) => {
          const skill = skillByKey.get(action.skillKey);
          const gated = skill ? needsCompetitorResearch(skill) : false;
          return (
            <div
              key={action.skillKey}
              className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-card p-3"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {action.skillTitle}
              </span>
              <span className="text-xs leading-relaxed">{action.outcome}</span>
              <div className="mt-auto pt-1.5">
                <Button
                  size="sm"
                  className="h-7 w-full gap-1.5 text-xs"
                  variant={skill?.implemented && !gated ? "default" : "outline"}
                  disabled={runDisabled(skill)}
                  onClick={() => skill && void runSkill(skill)}
                >
                  {runIcon(skill)}
                  {runLabel(skill)}
                </Button>
                {gated && (
                  <Button asChild size="sm" variant="link" className="mt-0.5 h-auto w-full justify-start gap-1 px-0 text-[11px]">
                    <Link to="/canvas">
                      Research competitors first
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </Button>
                )}
                {skill && skillErrors[skill.skill_key] && (
                  <p className="mt-1 text-[11px] leading-relaxed text-destructive">
                    {skillErrors[skill.skill_key]}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
