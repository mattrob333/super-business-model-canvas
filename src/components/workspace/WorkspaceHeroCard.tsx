import { Link } from "react-router-dom";
import { ExternalLink, Loader2, Lock, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CanvasSectionKey } from "@/components/canvas/section-types";
import { CANVAS_SECTION_LABELS } from "@/components/canvas/section-types";
import { AGENT_ROSTER } from "@/lib/agent-roster";
import { WORKSPACE_HERO } from "@/lib/workspace-hero";
import type { CatalogSkill, RoomSkillsState } from "@/hooks/useRoomSkills";

/**
 * The room's headpiece (owner design rounds 2026-07-08 → 07-11): its own
 * card above the chat with a bold accent wash so every room pops as
 * itself. Carries the ONLY room title on the page and the room's three
 * skills as the Run actions — subtle text-buttons, not orange slabs
 * (owner call 2026-07-11). Skill-run state arrives from the parent so the
 * chat can narrate the same run (single useRoomSkills instance).
 *
 * Adaptive: full headpiece while the thread is empty; collapses to a slim
 * strip once a conversation exists — run actions stay reachable in both.
 */
export function WorkspaceHeroCard({
  sectionKey,
  collapsed,
  skillRuns,
}: {
  sectionKey: CanvasSectionKey;
  collapsed: boolean;
  skillRuns: RoomSkillsState;
}) {
  const entry = AGENT_ROSTER[sectionKey];
  const hero = WORKSPACE_HERO[sectionKey];
  const Icon = entry.icon;
  const { skills, runningRun, startingKey, skillErrors, runSkill, needsCompetitorResearch } = skillRuns;
  const skillByKey = new Map(skills.map((skill) => [skill.skill_key, skill]));

  const runLabel = (skill: CatalogSkill | undefined) => {
    if (!skill) return "Run";
    if (startingKey === skill.skill_key) return "Starting…";
    if (runningRun?.skillKey === skill.skill_key) return "Running";
    if (needsCompetitorResearch(skill)) return "Needs research";
    return skill.implemented ? "Run" : "Coming soon";
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
                variant="ghost"
                className={`h-7 gap-1.5 px-2.5 text-xs font-semibold ${entry.accentTextClass} hover:bg-card`}
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
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-card ring-1 ${entry.avatarClass}`}>
          <Icon className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${entry.accentTextClass}`}>
            Your {entry.displayName}
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {CANVAS_SECTION_LABELS[sectionKey]}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-foreground/80">{hero.promise}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {hero.actions.map((action) => {
          const skill = skillByKey.get(action.skillKey);
          const gated = skill ? needsCompetitorResearch(skill) : false;
          return (
            <div
              key={action.skillKey}
              className="flex flex-col gap-1 rounded-lg border border-border/70 bg-card p-3 shadow-sm"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {action.skillTitle}
              </span>
              <span className="text-xs leading-relaxed">{action.outcome}</span>
              <div className="mt-auto pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className={`-ml-2 h-7 gap-1.5 px-2 text-xs font-semibold ${entry.accentTextClass} hover:bg-muted/60`}
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
