import { asRecord } from "../../db/json.js";
import type { CanvasItemSource, SkillRun } from "./toolkit.js";

/**
 * compass.message_market_fit — a message-market fit check for the Customer
 * Segments room: does our language match the segment's language? One model
 * pass turns EVERY Value Propositions line into a before/after row —
 * "your_line" (verbatim our canvas text, parser-enforced), "their_words"
 * (the same promise in the segment's own vocabulary), and why the rewrite
 * lands. When the canvas and prior research carry no segment language for a
 * line, the row is honestly marked "unknown" instead of shipping an invented
 * customer voice. The latest compass.avatar_refinement artifact rides along
 * as optional prior context — its pain quotes ARE segment language.
 *
 * Everything is canvas-grounded; there is no external excerpt for a verifier
 * to check a rewrite against, so no spot-check runs — payload.verification
 * names the parser gate instead of faking one.
 */

export type MessageFitStatus = "rewritten" | "unknown";

export interface MessageFitRow {
  /** Verbatim one of our Value Propositions item texts — parser-enforced. */
  your_line: string;
  /** The segment's way of saying it; null when status is "unknown". */
  their_words: string | null;
  /** Why the rewrite lands — or, for unknown rows, what segment language is missing. */
  why_it_lands: string;
  status: MessageFitStatus;
}

export interface MessageMarketFitArtifact {
  bodyMd: string;
  rows: MessageFitRow[];
}

interface PriorArtifact {
  title: string;
  body_md: string;
  payload: Record<string, unknown>;
}

export const runMessageMarketFit: SkillRun = async (toolkit, job, scope) => {
  const valueProps = await toolkit.loadOwnSectionItems(job.account_id, "value_propositions", scope);
  if (valueProps.length === 0) throw new Error("message_market_fit requires our Value Propositions canvas items first");
  const segments = await toolkit.loadOwnSectionItems(job.account_id, "customer_segments", scope);
  if (segments.length === 0) throw new Error("message_market_fit requires Customer Segments canvas items first");

  // Optional prior context: the avatar refinement's pain quotes are the
  // segment's actual vocabulary — the best rewrite source we have. Its
  // absence must not block the check; rows without segment language simply
  // come back "unknown".
  const avatarRefinement = await toolkit.loadLatestArtifact(job.account_id, scope, "compass.avatar_refinement");
  const companyName = scope.companyName ?? "the company";

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const modelResult = await toolkit.runModel(
    `message_market_fit artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: messageMarketFitPrompt(companyName, valueProps, segments, avatarRefinement),
      systemPrompt:
        "You compare a company's language to its customer segment's language, strictly from the provided canvas items and prior research. Every row's your_line must repeat one of our Value Propositions lines verbatim. Never invent customer vocabulary — when the segment's language for a line is not in the material, mark the row unknown. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseMessageMarketFitArtifact(modelResult.resultText, valueProps.map((item) => item.text));
  if (!artifact) throw new Error("message_market_fit produced unparseable output; refusing to write an artifact");

  const rewritten = artifact.rows.filter((row) => row.status === "rewritten").length;
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "compass.message_market_fit",
    agentKey: "agent_customer_segments",
    title: `Message-market fit — ${rewritten} of ${artifact.rows.length} line${artifact.rows.length === 1 ? "" : "s"} rewritten in segment language`,
    bodyMd: artifact.bodyMd,
    payload: { rows: artifact.rows, verification: "parser_grounded_rows" },
    // The model saw our VP lines and our segments — the artifact's evidence
    // must cover both.
    evidenceIds: toolkit.unique([...valueProps, ...segments].flatMap((item) => item.evidenceIds)),
    inputs: {
      sections: ["value_propositions", "customer_segments"],
      prior_artifacts: avatarRefinement ? ["compass.avatar_refinement"] : [],
    },
  });
  await toolkit.markRunCompleted(job, "Message-market fit completed", {
    skill_key: "compass.message_market_fit",
    lines: artifact.rows.length,
    rewritten,
  });
};

export function messageMarketFitPrompt(
  companyName: string,
  valueProps: CanvasItemSource[],
  segments: CanvasItemSource[],
  avatarRefinement: PriorArtifact | null,
): string {
  const priorBlock = avatarRefinement
    ? `Prior analysis — avatar refinement (${avatarRefinement.title}); its pain quotes are the segment's own language, your best rewrite source:\n${truncate(JSON.stringify(avatarRefinement.payload), 2500)}`
    : "No prior avatar research available — rely only on the Customer Segments items for segment language.";
  return `Check message-market fit for ${companyName}: compare OUR language below to the customer segment's language and rewrite each line in the segment's own words. Build one row per Value Propositions line. Return JSON only:
{"rows":[{"your_line":"<verbatim one of our Value Propositions lines>","their_words":"the same promise in the segment's own vocabulary (null when status is unknown)","why_it_lands":"one sentence on why the rewrite matches how they talk — or, for unknown rows, what segment language is missing","status":"rewritten|unknown"}],"body_md":"## Message-market fit\\n...the before/after table with commentary..."}

Rules:
- "your_line" must repeat one of our Value Propositions lines EXACTLY, character for character. Cover every line exactly once.
- "their_words" must come from how the segment actually talks — the segment items and the prior research's pain quotes. Never invent customer vocabulary.
- When the material gives you no segment language for a line, set status "unknown" and their_words null, and say honestly in why_it_lands what is missing. An honest unknown beats an invented voice.

Our Value Propositions lines (one row for each, verbatim):
${formatOwnItems(valueProps)}

Our Customer Segments:
${formatOwnItems(segments)}

${priorBlock}`;
}

export function parseMessageMarketFitArtifact(text: string, allowedLines: string[]): MessageMarketFitArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  if (!Array.isArray(parsed.rows)) return null;

  // Every row must quote one of OUR Value Propositions lines verbatim — a
  // single invented or duplicated line rejects the WHOLE parse: dropping the
  // bad row would still leave its narrative in body_md, shipping language the
  // canvas never used under a label that implies grounding.
  const allowed = new Set(allowedLines);
  const byLine = new Map<string, MessageFitRow>();
  for (const entry of parsed.rows) {
    const row = asRecord(entry);
    const yourLine = readString(row.your_line);
    const whyItLands = readString(row.why_it_lands);
    const status = readString(row.status);
    if (!yourLine || !whyItLands || !allowed.has(yourLine) || byLine.has(yourLine)) return null;
    if (status !== "rewritten" && status !== "unknown") return null;
    const theirWords = readString(row.their_words);
    // A rewritten row without the rewrite is not a deliverable; an unknown
    // row carrying a rewrite is an invented customer voice. Both reject.
    if (status === "rewritten" && !theirWords) return null;
    if (status === "unknown" && theirWords) return null;
    byLine.set(yourLine, {
      your_line: yourLine,
      their_words: status === "rewritten" ? (theirWords as string) : null,
      why_it_lands: whyItLands,
      status,
    });
  }

  const bodyMd = readString(parsed.body_md);
  // Every VP line must come back — a partial table would silently hide the
  // lines most likely to be off-key.
  if (byLine.size !== allowed.size || !bodyMd) return null;
  const rows = allowedLines
    .filter((line, index) => allowedLines.indexOf(line) === index)
    .map((line) => byLine.get(line) as MessageFitRow);
  return { bodyMd, rows };
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
