import { asRecord } from "../../db/json.js";
import type { CanvasItemSource, SkillRun } from "./toolkit.js";

/**
 * forge.positioning_brief — a one-page positioning brief for the Value
 * Propositions room: the classic six-part positioning statement plus the
 * message pillars behind it. Everything is grounded in the OWN canvas —
 * every pillar must quote one of our Value Propositions claims verbatim
 * (parser-enforced), and prior forge/compass artifacts feed the prompt as
 * synthesis context when they exist. There is no external excerpt to
 * spot-check here, so the payload names the actual guarantee
 * ("parser_grounded_pillars") instead of faking a verifier pass.
 */

interface PositioningStatement {
  for_segment: string;
  who_need: string;
  category: string;
  key_differentiator: string;
  unlike_alternative: string;
  because_proof: string;
}

interface PositioningPillar {
  pillar: string;
  /** Verbatim one of our Value Propositions claims — parser-enforced. */
  grounded_in: string;
  /** How the target segment would say it in their own words. */
  segment_language: string;
}

interface PositioningBriefArtifact {
  bodyMd: string;
  statement: PositioningStatement;
  pillars: PositioningPillar[];
  toneNotes: string;
}

interface PriorArtifact {
  title: string;
  body_md: string;
  payload: Record<string, unknown>;
}

export const runPositioningBrief: SkillRun = async (toolkit, job, scope) => {
  const ownClaims = await toolkit.loadOwnSectionItems(job.account_id, "value_propositions", scope);
  if (ownClaims.length === 0) throw new Error("positioning_brief requires our Value Propositions canvas items first");
  const segments = await toolkit.loadOwnSectionItems(job.account_id, "customer_segments", scope);
  if (segments.length === 0) throw new Error("positioning_brief requires Customer Segments canvas items first");

  // Finished work compounds: the differentiator audit says which claims are
  // actually defensible and the avatar refinement supplies segment language.
  // Both are optional context — the brief still grounds in the canvas itself.
  const differentiatorAudit = await toolkit.loadLatestArtifact(job.account_id, scope, "forge.differentiator_audit");
  const avatarRefinement = await toolkit.loadLatestArtifact(job.account_id, scope, "compass.avatar_refinement");
  const companyName = scope.companyName ?? "the company";

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const modelResult = await toolkit.runModel(
    `positioning_brief artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: positioningBriefPrompt(companyName, ownClaims, segments, differentiatorAudit, avatarRefinement),
      systemPrompt:
        "You write positioning briefs grounded strictly in the provided canvas items. Every pillar's grounded_in must repeat one of our Value Propositions claims verbatim. Never invent proof — an unproven differentiator stays labeled as unproven. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parsePositioningBriefArtifact(modelResult.resultText, ownClaims.map((item) => item.text));
  if (!artifact) throw new Error("positioning_brief produced unparseable output; refusing to write an artifact");

  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "forge.positioning_brief",
    agentKey: "agent_value_propositions",
    title: `Positioning brief — ${companyName}`,
    bodyMd: artifact.bodyMd,
    payload: {
      statement: artifact.statement,
      pillars: artifact.pillars,
      tone_notes: artifact.toneNotes,
      verification: "parser_grounded_pillars",
    },
    evidenceIds: toolkit.unique(ownClaims.flatMap((item) => item.evidenceIds)),
    inputs: {
      sections: ["value_propositions", "customer_segments"],
      prior_artifacts: [
        ...(differentiatorAudit ? ["forge.differentiator_audit"] : []),
        ...(avatarRefinement ? ["compass.avatar_refinement"] : []),
      ],
    },
  });
  await toolkit.markRunCompleted(job, "Positioning brief completed", {
    skill_key: "forge.positioning_brief",
    pillars: artifact.pillars.length,
  });
};

export function positioningBriefPrompt(
  companyName: string,
  ownClaims: CanvasItemSource[],
  segments: CanvasItemSource[],
  differentiatorAudit: PriorArtifact | null,
  avatarRefinement: PriorArtifact | null,
): string {
  const priorBlocks: string[] = [];
  if (differentiatorAudit) {
    priorBlocks.push(`Prior analysis — differentiator audit (${differentiatorAudit.title}):\n${truncate(JSON.stringify(differentiatorAudit.payload), 2500)}`);
  }
  if (avatarRefinement) {
    priorBlocks.push(`Prior analysis — avatar refinement (${avatarRefinement.title}):\n${truncate(JSON.stringify(avatarRefinement.payload), 2500)}`);
  }
  return `Write a one-page positioning brief for ${companyName} from the canvas items below. Return JSON only:
{"statement":{"for_segment":"target segment","who_need":"the need they have","category":"market category","key_differentiator":"our key benefit","unlike_alternative":"the primary alternative","because_proof":"the reason to believe — quote canvas basis or say it is unproven"},"pillars":[{"pillar":"message pillar headline","grounded_in":"<verbatim one of our Value Propositions claims>","segment_language":"how the segment would say it"}],"tone_notes":"voice and tone guidance","body_md":"## Positioning brief\\n...the full one-pager..."}

Rules:
- "grounded_in" must repeat one of our Value Propositions claims EXACTLY, character for character.
- Do not invent facts, numbers, or proof. If no canvas item proves the differentiator, say so in because_proof.
- Use the prior analyses only as grounding context, never as new facts.

Our Value Propositions claims:
${formatOwnItems(ownClaims)}

Our Customer Segments:
${formatOwnItems(segments)}

${priorBlocks.length > 0 ? priorBlocks.join("\n\n") : "No prior analyses available yet."}`;
}

export function parsePositioningBriefArtifact(text: string, allowedClaims: string[]): PositioningBriefArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;

  // All six statement slots must come back filled — a positioning statement
  // with a blank slot is not a deliverable.
  const statementRecord = asRecord(parsed.statement);
  const forSegment = readString(statementRecord.for_segment);
  const whoNeed = readString(statementRecord.who_need);
  const category = readString(statementRecord.category);
  const keyDifferentiator = readString(statementRecord.key_differentiator);
  const unlikeAlternative = readString(statementRecord.unlike_alternative);
  const becauseProof = readString(statementRecord.because_proof);
  if (!forSegment || !whoNeed || !category || !keyDifferentiator || !unlikeAlternative || !becauseProof) return null;

  // Pillars must be grounded in OUR claims verbatim — the model may not
  // paraphrase the canvas into something it never said. One ungrounded
  // pillar rejects the whole parse: silently dropping it from the payload
  // would still leave its narrative in body_md, shipping the invented claim
  // to the owner under a label that implies grounding.
  const allowed = new Set(allowedClaims);
  if (!Array.isArray(parsed.pillars)) return null;
  const pillars: PositioningPillar[] = [];
  for (const entry of parsed.pillars) {
    const row = asRecord(entry);
    const pillar = readString(row.pillar);
    const groundedIn = readString(row.grounded_in);
    const segmentLanguage = readString(row.segment_language);
    if (!pillar || !groundedIn || !segmentLanguage || !allowed.has(groundedIn)) return null;
    pillars.push({ pillar, grounded_in: groundedIn, segment_language: segmentLanguage });
  }
  const bodyMd = readString(parsed.body_md);
  if (pillars.length === 0 || !bodyMd) return null;
  return {
    bodyMd,
    statement: {
      for_segment: forSegment,
      who_need: whoNeed,
      category,
      key_differentiator: keyDifferentiator,
      unlike_alternative: unlikeAlternative,
      because_proof: becauseProof,
    },
    pillars,
    toneNotes: readString(parsed.tone_notes) ?? "",
  };
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

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
