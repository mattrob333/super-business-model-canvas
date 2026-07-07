import type { CompanyScope } from "../../db/company-scope.js";
import { asRecord } from "../../db/json.js";
import type { AgentJob } from "../../queue/types.js";
import type { CanvasItemSource, SkillRun, SkillToolkit } from "./toolkit.js";

/**
 * vault.single_point_scan — the Key Resources room's single-point-of-failure
 * scan: key-person, single-supplier, platform-dependency, and concentration
 * risks across our own Key Resources and Key Partners (Key Activities ride
 * along as context for what depends on what). The register is grounded
 * strictly in the OWN canvas — every risk row must name a Key Resources or
 * Key Partners item VERBATIM (parser-enforced; one invented row rejects the
 * whole parse). Every severity-4+ risk also lands on the Gap Register with
 * the "Resilience risk:" title prefix, superseding this skill's prior open
 * rows so re-runs never duplicate. There is no external excerpt to
 * spot-check here, so payload.verification names the parser gate instead of
 * faking a verifier pass.
 */

export type SinglePointRiskClass =
  | "key_person"
  | "single_supplier"
  | "platform_dependency"
  | "concentration";

const RISK_CLASSES = new Set<string>([
  "key_person",
  "single_supplier",
  "platform_dependency",
  "concentration",
]);

export interface SinglePointRiskRow {
  /** Verbatim one of our Key Resources or Key Partners item texts — parser-enforced. */
  item: string;
  risk_class: SinglePointRiskClass;
  /** 1–5: how hard the business stops if this single point fails. */
  severity: number;
  /** Plain-language: what breaks and who feels it. */
  exposure: string;
  /** One concrete first action the owner can take now. */
  mitigation_first_step: string;
}

export interface SinglePointScanArtifact {
  bodyMd: string;
  risks: SinglePointRiskRow[];
}

export const runSinglePointScan: SkillRun = async (toolkit, job, scope) => {
  const resources = await toolkit.loadOwnSectionItems(job.account_id, "key_resources", scope);
  if (resources.length === 0) throw new Error("single_point_scan requires our Key Resources canvas items first");

  // Optional context: partners surface single-supplier and platform
  // dependencies, activities show what depends on what — their absence must
  // not block the scan.
  const partners = await toolkit.loadOwnSectionItems(job.account_id, "key_partners", scope);
  const activities = await toolkit.loadOwnSectionItems(job.account_id, "key_activities", scope);

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const modelResult = await toolkit.runModel(
    `single_point_scan artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: singlePointScanPrompt(resources, partners, activities),
      systemPrompt:
        "You audit concentration risk strictly from the provided canvas items. Every risk row's item must repeat one of our Key Resources or Key Partners items verbatim — never invent a resource, supplier, or dependency the canvas does not name. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  // Rows may name resources OR partners; activities are context only.
  const allowedItems = [...resources, ...partners].map((item) => item.text);
  const artifact = parseSinglePointScanArtifact(modelResult.resultText, allowedItems);
  if (!artifact) throw new Error("single_point_scan produced unparseable output; refusing to write an artifact");

  // Every severity-4+ risk is an explicit resilience gap on the register.
  // This runs BEFORE the artifact write so a register failure never leaves
  // an artifact claiming gaps that were never opened.
  const severe = artifact.risks.filter((risk) => risk.severity >= 4);
  // Gap rows must point the owner at the section the named item lives in —
  // a partner-grounded risk belongs to key_partners, not key_resources.
  const partnerItems = new Set(partners.map((item) => item.text));
  const gapsOpened = await writeResilienceGaps(toolkit, job, scope, severe, partnerItems);

  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "vault.single_point_scan",
    agentKey: "agent_key_resources",
    title: `Single-point-of-failure scan — ${artifact.risks.length} risk${artifact.risks.length === 1 ? "" : "s"}, ${severe.length} severe (4+)`,
    bodyMd: artifact.bodyMd,
    payload: { risks: artifact.risks, gaps_opened: gapsOpened, verification: "parser_grounded_rows" },
    evidenceIds: toolkit.unique([...resources, ...partners, ...activities].flatMap((item) => item.evidenceIds)),
    inputs: { sections: ["key_resources", "key_partners", "key_activities"] },
  });
  await toolkit.markRunCompleted(job, "Single-point-of-failure scan completed", {
    skill_key: "vault.single_point_scan",
    risks: artifact.risks.length,
    severe: severe.length,
    gaps_opened: gapsOpened,
  });
};

/**
 * Re-runs supersede this skill's prior open register rows, then write one
 * fresh row per severe risk. The supersede runs even when nothing is severe
 * anymore — a dependency the owner has since de-risked must not keep an open
 * register row.
 */
async function writeResilienceGaps(
  toolkit: SkillToolkit,
  job: AgentJob,
  scope: CompanyScope,
  severeRisks: SinglePointRiskRow[],
  partnerItems: ReadonlySet<string>,
): Promise<number> {
  const { error: supersedeError } = await toolkit.client
    .from("gaps")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("account_id", job.account_id)
    .eq("gap_type", "missing_data")
    .like("title", "Resilience risk:%")
    .in("business_context_version_id", scope.contextIds)
    .in("status", ["open", "acknowledged"]);
  if (supersedeError) throw new Error(`Failed to supersede prior resilience risks: ${supersedeError.message}`);
  if (severeRisks.length === 0) return 0;

  const rows = severeRisks.map((risk) => ({
    account_id: job.account_id,
    business_context_version_id: scope.activeContextId,
    title: `Resilience risk: ${toolkit.truncateText(risk.item, 90)}`,
    description: `${riskClassLabel(risk.risk_class)} (severity ${risk.severity}/5): ${risk.exposure}`,
    gap_type: "missing_data",
    severity: risk.severity >= 5 ? "critical" : "high",
    // The parser guarantees risk.item is verbatim from resources ∪ partners,
    // so anything not in partnerItems is a Key Resources item.
    affected_sections: [partnerItems.has(risk.item) ? "key_partners" : "key_resources"],
    recommended_action: risk.mitigation_first_step,
    created_by_agent_run_id: job.agent_run_id,
  }));
  const { error } = await toolkit.client.from("gaps").insert(rows);
  if (error) throw new Error(`Failed to write resilience risks to the register: ${error.message}`);
  return rows.length;
}

export function singlePointScanPrompt(
  resources: CanvasItemSource[],
  partners: CanvasItemSource[],
  activities: CanvasItemSource[],
): string {
  return `Scan our canvas below for single-point-of-failure and concentration risks:
- risk_class is exactly one of: key_person (one irreplaceable person), single_supplier (one supplier/vendor with no fallback), platform_dependency (one platform or channel that could change terms or cut us off), concentration (revenue, customer, or asset concentration in one place).
- Each row's "item" must repeat ONE of our Key Resources or Key Partners items below EXACTLY, character for character — never invent or paraphrase an item. An item may appear in more than one row only if it carries genuinely distinct risk classes.
- severity is 1 to 5: how hard the business stops if this single point fails tomorrow (5 = operations halt, 1 = an inconvenience).
- "exposure" is one plain-language sentence: what breaks and who feels it.
- "mitigation_first_step" is one concrete first action the owner can take now (a backup to line up, a document to write, a second vendor to qualify).
- Only flag genuine concentration — an item with obvious redundancy gets no row. Return an empty risks array if nothing concentrates.
Return JSON only:
{"risks":[{"item":"<verbatim one of our Key Resources or Key Partners items>","risk_class":"key_person|single_supplier|platform_dependency|concentration","severity":4,"exposure":"one plain-language sentence","mitigation_first_step":"one concrete first action"}],"body_md":"## Single-point-of-failure scan\\n..."}

Our Key Resources (primary scan targets):
${formatOwnItems(resources)}

Our Key Partners (scan for single-supplier and platform dependencies):
${formatOwnItems(partners)}

Our Key Activities (context only — what depends on what; do not use as row items):
${formatOwnItems(activities)}`;
}

/**
 * The never-invent gate. Every risk row must name one of OUR Key Resources
 * or Key Partners items VERBATIM, carry a recognized risk_class, and carry a
 * numeric severity. One ungrounded or malformed row rejects the WHOLE parse:
 * silently dropping it would still leave its narrative in body_md, shipping
 * an invented dependency to the owner under a label that implies grounding.
 */
export function parseSinglePointScanArtifact(text: string, allowedItems: string[]): SinglePointScanArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  if (!Array.isArray(parsed.risks)) return null;
  const allowed = new Set(allowedItems);
  const seen = new Set<string>();
  const risks: SinglePointRiskRow[] = [];
  for (const entry of parsed.risks) {
    const row = asRecord(entry);
    const item = readString(row.item);
    const riskClass = readString(row.risk_class);
    const exposure = readString(row.exposure);
    const mitigation = readString(row.mitigation_first_step);
    if (!item || !riskClass || !exposure || !mitigation) return null;
    if (!allowed.has(item)) return null;
    if (!RISK_CLASSES.has(riskClass)) return null;
    // A missing or non-numeric severity is as malformed as a missing field:
    // coercing it to 1 would demote a risk the model may have marked severe,
    // silently suppressing its severity-4+ gap row and the title's count.
    const severity = Number(row.severity);
    if (!Number.isFinite(severity)) return null;
    // The same item+class pair twice is repetition, not a second risk.
    const key = `${riskClass}\u0000${item}`;
    if (seen.has(key)) continue;
    seen.add(key);
    risks.push({
      item,
      risk_class: riskClass as SinglePointRiskClass,
      // Out-of-range but numeric severities clamp into 1..5 rather than
      // reject — the model asserted a magnitude, just on the wrong scale.
      severity: Math.min(5, Math.max(1, Math.round(severity))),
      exposure,
      mitigation_first_step: mitigation,
    });
  }
  const bodyMd = readString(parsed.body_md);
  // Zero risks is a legitimate finding for a well-diversified canvas — but a
  // register without its narrative is not a deliverable.
  if (!bodyMd) return null;
  return { bodyMd, risks };
}

function riskClassLabel(riskClass: SinglePointRiskClass): string {
  const labels: Record<SinglePointRiskClass, string> = {
    key_person: "Key-person dependency",
    single_supplier: "Single-supplier dependency",
    platform_dependency: "Platform dependency",
    concentration: "Concentration risk",
  };
  return labels[riskClass];
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
