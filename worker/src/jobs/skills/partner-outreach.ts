import { asRecord } from "../../db/json.js";
import type { CanvasItemSource, SkillRun } from "./toolkit.js";

/**
 * envoy.partner_outreach — personalized outreach DRAFTS for the Key Partners
 * room. The skill consumes the latest envoy.supply_chain_map artifact (hard
 * requirement — without a map there are no vetted candidates to write to),
 * takes its top candidates by fit score (at most 5), drops any candidate that
 * is already one of our Key Partners (code-enforced, not prompt-enforced —
 * see excludeExistingPartners), and drafts one outreach message per remaining
 * candidate. Our own Key Partners and Value Propositions items ride along as
 * context so the drafts speak in the canvas's language.
 *
 * Grounding is parser-enforced against the PRIOR artifact: every draft must
 * name a candidate the map actually proposed and echo that candidate's
 * evidence_quote verbatim; the candidate's rationale and quote are carried
 * into the payload verbatim from the map, never re-worded by this model
 * pass. One invented or altered draft rejects the whole parse.
 *
 * Drafts are DRAFTS. Nothing here is sent and nothing claims to have been
 * sent: payload.status is "drafts_awaiting_owner_approval" and the body
 * carries a fixed notice that sending is always the owner's action. There is
 * no external excerpt to spot-check (the inputs are our own canvas and our
 * own prior artifact), so payload.verification names the parser gate instead
 * of faking a verifier pass.
 */

/** Most candidates worth drafting for in one pass. */
export const MAX_OUTREACH_CANDIDATES = 5;

/** Fixed body notice — the artifact is the approval surface, never a send log. */
export const OUTREACH_DRAFT_NOTICE =
  "These outreach messages are DRAFTS awaiting owner approval. Nothing has been sent and nothing will be sent autonomously — sending is always the owner's action.";

export interface OutreachCandidate {
  name: string;
  role: string;
  fit_score: number;
  /** Carried verbatim from the supply-chain map's candidate row. */
  rationale: string;
  /** Carried verbatim from the supply-chain map's candidate row. */
  evidence_quote: string;
}

export interface OutreachDraft {
  partner_name: string;
  subject: string;
  body: string;
  /** Verbatim from the map candidate — why this partner, in the map's words. */
  rationale: string;
  /** Verbatim from the map candidate — the evidence the map grounded it in. */
  evidence_quote: string;
}

export interface PartnerOutreachArtifact {
  bodyMd: string;
  drafts: OutreachDraft[];
}

export const runPartnerOutreach: SkillRun = async (toolkit, job, scope) => {
  // The map is the required input: it holds the vetted, evidence-grounded
  // candidates. Fail honestly BEFORE any model call when it is missing.
  const map = await toolkit.loadLatestArtifact(job.account_id, scope, "envoy.supply_chain_map");
  if (!map) throw new Error("partner_outreach requires a supply-chain map first; run envoy.supply_chain_map");
  const mapCandidates = topOutreachCandidates(map.payload);
  if (mapCandidates.length === 0) {
    throw new Error("partner_outreach found no usable partnership candidates in the latest supply-chain map; re-run envoy.supply_chain_map");
  }

  // Existing partners serve two jobs: candidates matching one are EXCLUDED in
  // code before any prompt is built (the map does not exclude them upstream),
  // and the rest ride along as prompt context. Value props supply the
  // "what's in it for them" language.
  const ownPartners = await toolkit.loadOwnSectionItems(job.account_id, "key_partners", scope);
  const valueProps = await toolkit.loadOwnSectionItems(job.account_id, "value_propositions", scope);
  const candidates = excludeExistingPartners(mapCandidates, ownPartners);
  if (candidates.length === 0) {
    // Fail honestly BEFORE any model call: drafting outreach to partners we
    // already have would contradict this module's stated behavior.
    throw new Error("partner_outreach: every usable candidate in the latest supply-chain map is already a Key Partner; re-run envoy.supply_chain_map for fresh candidates");
  }
  const companyName = scope.companyName ?? "our company";

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const modelResult = await toolkit.runModel(
    `partner_outreach artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: partnerOutreachPrompt(companyName, candidates, ownPartners, valueProps),
      systemPrompt:
        "You draft partnership outreach messages strictly from the provided candidates and canvas items. Drafts are never sent — never write as if contact has already happened. Every draft's evidence_quote must repeat the candidate's evidence_quote verbatim. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parsePartnerOutreachArtifact(modelResult.resultText, candidates);
  if (!artifact) throw new Error("partner_outreach produced unparseable output; refusing to write an artifact");

  // The never-sent statement is appended deterministically — it must not
  // depend on the model remembering to include it.
  const bodyMd = `${artifact.bodyMd}\n\n---\n\n**${OUTREACH_DRAFT_NOTICE}**`;

  const count = artifact.drafts.length;
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "envoy.partner_outreach",
    agentKey: "agent_key_partnerships",
    title: `Partner outreach drafts — ${count} draft${count === 1 ? "" : "s"} awaiting owner approval`,
    bodyMd,
    payload: {
      status: "drafts_awaiting_owner_approval",
      drafts: artifact.drafts,
      verification: "parser_grounded_drafts",
    },
    evidenceIds: toolkit.unique([...ownPartners, ...valueProps].flatMap((item) => item.evidenceIds)),
    inputs: {
      sections: ["key_partners", "value_propositions"],
      prior_artifacts: ["envoy.supply_chain_map"],
      candidates: candidates.length,
    },
  });
  await toolkit.markRunCompleted(job, "Partner outreach drafts completed — awaiting owner approval", {
    skill_key: "envoy.partner_outreach",
    drafts: count,
    status: "drafts_awaiting_owner_approval",
  });
};

/**
 * The top candidates (<= MAX_OUTREACH_CANDIDATES) from a supply-chain map
 * payload, best fit first. Rows missing a name, rationale, or evidence_quote
 * are unusable for grounded outreach and are skipped; duplicate names keep
 * their best-scored row.
 */
export function topOutreachCandidates(payload: Record<string, unknown>): OutreachCandidate[] {
  const raw = Array.isArray(payload.candidates) ? payload.candidates : [];
  const parsed = raw.flatMap((entry): OutreachCandidate[] => {
    const row = asRecord(entry);
    const name = readString(row.name);
    const rationale = readString(row.rationale);
    const evidenceQuote = readString(row.evidence_quote);
    if (!name || !rationale || !evidenceQuote) return [];
    const score = Number(row.fit_score);
    return [{
      name,
      role: readString(row.role) ?? "complement",
      fit_score: Number.isFinite(score) ? score : 1,
      rationale,
      evidence_quote: evidenceQuote,
    }];
  });
  const byName = new Map<string, OutreachCandidate>();
  for (const candidate of [...parsed].sort((a, b) => b.fit_score - a.fit_score)) {
    if (!byName.has(candidate.name)) byName.set(candidate.name, candidate);
  }
  return [...byName.values()].slice(0, MAX_OUTREACH_CANDIDATES);
}

/**
 * Drops candidates we already partner with. The supply-chain map only asks
 * (prompt-only) for candidates beyond our current partners, so a top
 * candidate CAN be an existing Key Partner — this is the code-level gate
 * that keeps outreach drafts from courting a partner we already have.
 * Matching is case-insensitive containment: a key_partners item is free
 * text ("ServoWorks — actuator supply agreement"), so a candidate is
 * "existing" when any item's text contains the candidate's name.
 */
export function excludeExistingPartners(
  candidates: OutreachCandidate[],
  ownPartners: CanvasItemSource[],
): OutreachCandidate[] {
  const partnerTexts = ownPartners.map((item) => item.text.toLowerCase());
  return candidates.filter((candidate) => {
    const name = candidate.name.toLowerCase();
    return !partnerTexts.some((text) => text.includes(name));
  });
}

export function partnerOutreachPrompt(
  companyName: string,
  candidates: OutreachCandidate[],
  ownPartners: CanvasItemSource[],
  valueProps: CanvasItemSource[],
): string {
  const candidateLines = candidates
    .map((candidate) =>
      `- name: ${candidate.name}\n  role: ${candidate.role} (fit ${candidate.fit_score}/5)\n  rationale: ${candidate.rationale}\n  evidence_quote: ${candidate.evidence_quote}`)
    .join("\n");
  return `Draft one partnership outreach message from ${companyName} to EACH candidate below — exactly one draft per candidate, no extras.

Rules for each draft:
- "partner_name" must repeat the candidate's name EXACTLY, character for character.
- "evidence_quote" must repeat that candidate's evidence_quote EXACTLY, character for character — it is the ground truth the draft leans on.
- Personalize: the subject or body must name the partner, and the body must build on the candidate's rationale (why THIS partner, in concrete terms) — never a generic template.
- These are drafts for the owner to review. Never write as if we already reached out, met, or agreed to anything.
- Do not invent facts about the candidate beyond its rationale and evidence_quote.
Return JSON only:
{"drafts":[{"partner_name":"<exact candidate name>","subject":"outreach subject line","body":"the full outreach message body","evidence_quote":"<exact candidate evidence_quote>"}],"body_md":"## Partner outreach drafts\\n...one section per draft..."}

Partnership candidates (from our supply-chain map):
${candidateLines}

Our current Key Partners (context only — candidates matching these were already excluded, so the candidate list above is the complete set to draft for):
${formatOwnItems(ownPartners)}

Our Value Propositions (the value we can offer a partner):
${formatOwnItems(valueProps)}`;
}

/**
 * The grounding gate. Every draft must target a candidate the map actually
 * proposed (exact name match) and echo that candidate's evidence_quote
 * verbatim; the subject or body must name the partner. Exactly one draft per
 * candidate must come back. Any invented partner, altered quote, duplicate,
 * or missing candidate rejects the WHOLE parse: dropping the bad row would
 * still ship its narrative inside body_md under a label implying grounding.
 */
export function parsePartnerOutreachArtifact(
  text: string,
  candidates: OutreachCandidate[],
): PartnerOutreachArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  if (!Array.isArray(parsed.drafts)) return null;
  const byName = new Map(candidates.map((candidate) => [candidate.name, candidate]));
  const drafts = new Map<string, OutreachDraft>();
  for (const entry of parsed.drafts) {
    const row = asRecord(entry);
    const partnerName = readString(row.partner_name);
    const subject = readString(row.subject);
    const body = readString(row.body);
    const evidenceQuote = readString(row.evidence_quote);
    if (!partnerName || !subject || !body || !evidenceQuote) return null;
    const candidate = byName.get(partnerName);
    // A draft to a partner the map never proposed is an invention.
    if (!candidate) return null;
    // The quote must survive verbatim — a paraphrased quote breaks the chain
    // back to the excerpt the map's verifier checked.
    if (evidenceQuote !== candidate.evidence_quote) return null;
    // Personalization floor: a draft that never names its partner is a
    // generic template, not outreach.
    if (!subject.includes(partnerName) && !body.includes(partnerName)) return null;
    if (drafts.has(partnerName)) return null;
    drafts.set(partnerName, {
      partner_name: partnerName,
      subject,
      body,
      // Carried verbatim from the map — this model pass may not re-word them.
      rationale: candidate.rationale,
      evidence_quote: candidate.evidence_quote,
    });
  }
  const bodyMd = readString(parsed.body_md);
  // Every top candidate gets a draft — a partial batch would silently skip
  // the candidates the owner most expects to see covered.
  if (drafts.size !== candidates.length || !bodyMd) return null;
  return {
    bodyMd,
    drafts: candidates.map((candidate) => drafts.get(candidate.name) as OutreachDraft),
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

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
