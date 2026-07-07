import { asRecord } from "../../db/json.js";
import type { CanvasItemSource, SkillRun } from "./toolkit.js";

/**
 * vault.moat_audit — classify EVERY Key Resources item by the kind of moat it
 * actually is (network effects, switching costs, proprietary data/tech, brand,
 * scale/cost, distribution lock — or honestly "none") with a 1–5 durability
 * score. Competitor Key Resources and our Value Propositions ride along as
 * optional context so "everyone has this" resources don't get flattered.
 *
 * There is no external excerpt to check a claim against — the only ground
 * truth is our own canvas text, which the parser already enforces verbatim —
 * so no verifier spot-check runs; payload.verification names the parser gate
 * instead of faking one.
 */

export type MoatClass =
  | "network_effects"
  | "switching_costs"
  | "proprietary_data_or_tech"
  | "brand"
  | "scale_or_cost"
  | "distribution_lock"
  | "none";

const MOAT_CLASSES = new Set<string>([
  "network_effects",
  "switching_costs",
  "proprietary_data_or_tech",
  "brand",
  "scale_or_cost",
  "distribution_lock",
  "none",
]);

export interface MoatAuditRow {
  resource: string;
  moat_class: MoatClass;
  durability: number;
  basis: string;
}

export interface MoatAuditArtifact {
  bodyMd: string;
  rows: MoatAuditRow[];
}

export const runMoatAudit: SkillRun = async (toolkit, job, scope) => {
  const resources = await toolkit.loadOwnSectionItems(job.account_id, "key_resources", scope);
  if (resources.length === 0) throw new Error("moat_audit requires our Key Resources canvas items first");

  // Optional context: competitor resources keep commodity assets from being
  // scored as moats, and our value props anchor which resources carry weight.
  const competitorResources = await toolkit.loadCompetitorSectionItems(job.account_id, "key_resources", scope);
  const valueProps = await toolkit.loadOwnSectionItems(job.account_id, "value_propositions", scope);

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const modelResult = await toolkit.runModel(
    `moat_audit artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: moatAuditPrompt(resources, competitorResources, valueProps),
      systemPrompt:
        "You classify defensibility strictly from the provided canvas items. A resource without structural lock-in is class 'none' — never flatter. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseMoatAuditArtifact(modelResult.resultText, resources.map((item) => item.text));
  if (!artifact) throw new Error("moat_audit produced unparseable output; refusing to write an artifact");

  const durable = artifact.rows.filter((row) => row.durability >= 4).length;
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "vault.moat_audit",
    agentKey: "agent_key_resources",
    title: `Moat audit — ${artifact.rows.length} resources, ${durable} durable (4+)`,
    bodyMd: artifact.bodyMd,
    payload: { rows: artifact.rows, verification: "parser_strict_all_rows" },
    evidenceIds: toolkit.unique(resources.flatMap((item) => item.evidenceIds)),
    inputs: { sections: ["key_resources"] },
  });
  await toolkit.markRunCompleted(job, "Moat audit completed", {
    skill_key: "vault.moat_audit",
    resources: artifact.rows.length,
    durable,
  });
};

function moatAuditPrompt(
  resources: CanvasItemSource[],
  competitorResources: CanvasItemSource[],
  valueProps: CanvasItemSource[],
): string {
  return `Classify EVERY one of our Key Resources below by moat class and durability:
- moat_class is exactly one of: network_effects, switching_costs, proprietary_data_or_tech, brand, scale_or_cost, distribution_lock, none.
- "none" is the honest default for resources any funded competitor could replicate — do not flatter.
- durability is 1 to 5: how long the advantage survives a determined, well-funded copycat (5 = years of structural lock-in, 1 = gone in months).
Return JSON only:
{"rows":[{"resource":"<verbatim one of our resources>","moat_class":"none","durability":2,"basis":"one-sentence reasoning"}],"body_md":"## Moat read\\n..."}

Our Key Resources (classify each, verbatim):
${formatItems(resources)}

Competitor Key Resources (context only — do not classify these):
${formatItems(competitorResources)}

Our Value Propositions (context for which resources carry the business):
${formatItems(valueProps)}`;
}

export function parseMoatAuditArtifact(text: string, allowedResources: string[]): MoatAuditArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const allowed = new Set(allowedResources);
  const byResource = new Map<string, MoatAuditRow>();
  if (Array.isArray(parsed.rows)) {
    for (const entry of parsed.rows) {
      const row = asRecord(entry);
      const resource = readString(row.resource);
      const moatClass = readString(row.moat_class);
      const basis = readString(row.basis);
      // Resources must be OUR items verbatim — the model may not invent
      // assets — and an unrecognized moat_class drops the row.
      if (!resource || !basis || !allowed.has(resource)) continue;
      if (!moatClass || !MOAT_CLASSES.has(moatClass)) continue;
      if (byResource.has(resource)) continue;
      byResource.set(resource, {
        resource,
        moat_class: moatClass as MoatClass,
        durability: boundedScore(row.durability),
        basis,
      });
    }
  }
  const bodyMd = readString(parsed.body_md);
  // Every own resource must come back classified — a partial audit would
  // silently hide the very resources most likely to be weak.
  if (byResource.size !== allowed.size || !bodyMd) return null;
  const rows = allowedResources
    .filter((resource, index) => allowedResources.indexOf(resource) === index)
    .map((resource) => byResource.get(resource) as MoatAuditRow);
  return { bodyMd, rows };
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

function formatItems(items: CanvasItemSource[]): string {
  return items.length > 0
    ? items.map((item) => `- ${item.competitorName ? `${item.competitorName}: ` : ""}${item.text}`).join("\n")
    : "- (none recorded)";
}

function boundedScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 1;
  return Math.min(5, Math.max(1, Math.round(score)));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
