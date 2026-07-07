import { asRecord } from "../../db/json.js";
import type { CanvasItemSource, SkillRun } from "./toolkit.js";

/**
 * anchor.lifecycle_map — a lifecycle map for the Customer Relationships room:
 * our relationship motions versus every researched competitor's, laid out
 * across the six fixed lifecycle stages (discover → renew). The map is
 * grounded strictly in canvas text — a stage where our items say nothing is
 * an honest "none recorded", never an invented motion, and every competitor
 * motion must name a researched competitor (parser-enforced) so the verifier
 * can spot-check it against that competitor's own canvas excerpt. Our
 * Channels items ride along as optional context so recommendations lean on
 * motions we could actually run.
 */

export const LIFECYCLE_STAGES = ["discover", "evaluate", "onboard", "adopt", "expand", "renew"] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

const LIFECYCLE_STAGE_SET = new Set<string>(LIFECYCLE_STAGES);

export interface LifecycleCompetitorMotion {
  /** One of the researched competitors' names verbatim — parser-enforced. */
  competitor: string;
  motion: string;
}

export interface LifecycleStageRow {
  stage: LifecycleStage;
  /** What our canvas says we do at this stage; exactly "none recorded" when it says nothing. */
  your_motion: string;
  competitor_motions: LifecycleCompetitorMotion[];
  gap: boolean;
  recommendation: string;
}

export interface LifecycleMapArtifact {
  bodyMd: string;
  stages: LifecycleStageRow[];
}

export const runLifecycleMap: SkillRun = async (toolkit, job, scope) => {
  const ownRelationships = await toolkit.loadOwnSectionItems(job.account_id, "customer_relationships", scope);
  if (ownRelationships.length === 0) throw new Error("lifecycle_map requires our Customer Relationships canvas items first");
  const competitorRelationships = await toolkit.loadCompetitorSectionItems(job.account_id, "customer_relationships", scope);
  if (competitorRelationships.length === 0) throw new Error("lifecycle_map requires competitor Customer Relationships research first");

  // Optional context: our Channels items show which motions we could run
  // without new infrastructure — they shape recommendations, not the map.
  const ownChannels = await toolkit.loadOwnSectionItems(job.account_id, "channels", scope);

  const competitorNames = toolkit.unique(competitorRelationships.map((item) => item.competitorName ?? ""));

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const verifyRoute = toolkit.requiredRoute(routes, job.account_id, "research_verify", "research_verify");
  const modelResult = await toolkit.runModel(
    `lifecycle_map artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: lifecycleMapPrompt(ownRelationships, competitorRelationships, ownChannels, competitorNames),
      systemPrompt:
        "You map customer-relationship motions across fixed lifecycle stages strictly from the provided canvas items. When our items say nothing for a stage, your_motion is exactly 'none recorded' — never invent a motion. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseLifecycleMapArtifact(modelResult.resultText, competitorNames);
  if (!artifact) throw new Error("lifecycle_map produced unparseable output; refusing to write an artifact");

  // Verifier spot-check: only competitor motions assert something checkable
  // against external text — up to 4 of them against the named competitor's
  // own canvas excerpt. A map whose stages all ended with zero motions has
  // nothing external to check.
  const checks = artifact.stages
    .flatMap((row) => row.competitor_motions)
    .map((motion) => ({
      claim: `${motion.competitor} runs this relationship motion: ${motion.motion}`,
      excerpt: toolkit.competitorExcerpt(competitorRelationships, motion.competitor),
    }));
  const checked = checks.length > 0
    ? await toolkit.verifyArtifactClaims(job, verifyRoute, checks.slice(0, 4), "lifecycle_map")
    : { checked: 0, confirmed: 0 };

  const stageGaps = artifact.stages.filter((row) => row.gap).length;
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "anchor.lifecycle_map",
    agentKey: "agent_customer_relationships",
    title: `Lifecycle map — ${stageGaps} stage gaps`,
    bodyMd: artifact.bodyMd,
    payload: { stages: artifact.stages, spot_check: checked },
    evidenceIds: toolkit.unique(competitorRelationships.flatMap((item) => item.evidenceIds)),
    inputs: { sections: ["customer_relationships", "channels"], competitor_items: competitorRelationships.length },
  });
  await toolkit.markRunCompleted(job, "Lifecycle map completed", {
    skill_key: "anchor.lifecycle_map",
    stage_gaps: stageGaps,
    spot_check_confirmed: checked.confirmed,
  });
};

export function lifecycleMapPrompt(
  ownRelationships: CanvasItemSource[],
  competitorRelationships: CanvasItemSource[],
  ownChannels: CanvasItemSource[],
  competitorNames: string[],
): string {
  return `Map customer-relationship motions across the fixed lifecycle stages: ${LIFECYCLE_STAGES.join(", ")}.
- Return EVERY stage, in exactly that order.
- "your_motion": what our Customer Relationships items say we do at that stage; exactly "none recorded" when they say nothing — never invent one.
- "competitor_motions": motions the competitor items describe at that stage. "competitor" must be exactly one of: ${competitorNames.join(", ")}. Skip any motion the provided text does not support — a stage may have none.
- "gap": true only when competitors run a motion at that stage and our recorded motion is absent or clearly weaker.
Return JSON only:
{"stages":[{"stage":"discover","your_motion":"... or none recorded","competitor_motions":[{"competitor":"...","motion":"short evidence-backed phrase"}],"gap":false,"recommendation":"one imperative sentence"}],"body_md":"## Lifecycle map\\n..."}

Our Customer Relationships items:
${formatOwnItems(ownRelationships)}

Our Channels (context for which motions are feasible):
${formatOwnItems(ownChannels)}

Competitor Customer Relationships items:
${formatItems(competitorRelationships)}`;
}

export function parseLifecycleMapArtifact(text: string, competitorNames: string[]): LifecycleMapArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const knownCompetitors = new Set(competitorNames);
  const stages: LifecycleStageRow[] = Array.isArray(parsed.stages)
    ? parsed.stages.flatMap((entry) => {
        const row = asRecord(entry);
        const stage = readString(row.stage);
        const yourMotion = readString(row.your_motion);
        const recommendation = readString(row.recommendation);
        // "none recorded" is a legitimate your_motion — a blank one is not,
        // and an invented stage name drops the row (which fails the map).
        if (!stage || !LIFECYCLE_STAGE_SET.has(stage)) return [];
        if (!yourMotion || !recommendation) return [];
        // gap must be an explicit boolean — a stage the model refuses to
        // judge is not a judgment.
        if (typeof row.gap !== "boolean") return [];
        const motions: LifecycleCompetitorMotion[] = Array.isArray(row.competitor_motions)
          ? row.competitor_motions.flatMap((motionEntry) => {
              const motionRow = asRecord(motionEntry);
              const competitor = readString(motionRow.competitor);
              const motion = readString(motionRow.motion);
              // Motions must name a researched competitor — a motion pinned
              // on a company we never researched is dropped, not shipped.
              if (!competitor || !motion || !knownCompetitors.has(competitor)) return [];
              return [{ competitor, motion }];
            })
          : [];
        return [{ stage: stage as LifecycleStage, your_motion: yourMotion, competitor_motions: motions, gap: row.gap, recommendation }];
      })
    : [];
  const bodyMd = readString(parsed.body_md);
  // All six fixed stages must come back, in order — a missing or shuffled
  // stage hides exactly the stage most likely to be weak.
  if (!bodyMd || stages.length !== LIFECYCLE_STAGES.length) return null;
  if (stages.some((row, index) => row.stage !== LIFECYCLE_STAGES[index])) return null;
  return { bodyMd, stages };
}

function formatItems(items: CanvasItemSource[]): string {
  return items.length > 0
    ? items.map((item) => `- ${item.competitorName ? `${item.competitorName}: ` : ""}${item.text}`).join("\n")
    : "- (none recorded)";
}

function formatOwnItems(items: CanvasItemSource[]): string {
  return items.length > 0 ? items.map((item) => `- ${item.text}`).join("\n") : "- (none recorded)";
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const unfenced = text.replace(/```(?:json)?/gi, "```").replace(/```/g, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return asRecord(JSON.parse(unfenced.slice(start, end + 1)));
  } catch {
    return null;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
