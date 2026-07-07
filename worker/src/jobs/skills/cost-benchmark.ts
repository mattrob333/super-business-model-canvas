import type { CompanyScope } from "../../db/company-scope.js";
import { asRecord } from "../../db/json.js";
import type { AgentJob } from "../../queue/types.js";
import type { CanvasItemSource, SkillRun, SkillToolkit } from "./toolkit.js";

/**
 * ledger.cost_benchmark — the Cost Structure room's archetype benchmark. One
 * model pass names the business archetype the analyzed company belongs to and
 * compares our canvas cost items against the archetype's typical cost mix,
 * category by category, over a FIXED five-category frame (COGS/delivery,
 * S&M, R&D, G&A, infrastructure/ops).
 *
 * The honesty split is asymmetric by design: archetype norms are the model's
 * general knowledge and every payload/prompt labels them exactly that —
 * `archetype_norm_source: "model_knowledge"` — never evidence about this
 * company. Claims about OUR costs, in contrast, must quote a Cost Structure
 * canvas item VERBATIM; the parser rejects the ENTIRE output when any
 * "canvas" row's quote is not a substring of one of our items, because a
 * silently-dropped row would still leave the invented number in body_md.
 *
 * Every category the canvas cannot ground becomes ONE "Cost input:" row on
 * the Gap Register (supersede-then-insert, mirroring unit_economics_frame)
 * so re-runs never duplicate and a since-filled category closes its row.
 * Canvas-only inputs mean there is no external excerpt for a verifier to
 * check — payload.verification names the parser gate instead of faking one.
 */

export const COST_CATEGORIES = [
  "cogs_or_delivery",
  "sales_and_marketing",
  "research_and_development",
  "general_and_administrative",
  "infrastructure_and_operations",
] as const;

export type CostCategory = (typeof COST_CATEGORIES)[number];

const CATEGORY_LABELS: Record<CostCategory, string> = {
  cogs_or_delivery: "COGS / delivery (direct cost of the product or service)",
  sales_and_marketing: "Sales & marketing (people plus programs)",
  research_and_development: "R&D / product development",
  general_and_administrative: "G&A (admin, finance, legal, office)",
  infrastructure_and_operations: "Infrastructure & operations (hosting, logistics, internal tooling)",
};

// The default owner ask when a gap row comes back without its own
// owner_input_needed — a register row must always tell the owner exactly
// what number to supply.
const DEFAULT_OWNER_ASKS: Record<CostCategory, string> = {
  cogs_or_delivery: "Provide what it costs to deliver one unit or serve one customer (COGS or direct delivery cost).",
  sales_and_marketing: "Provide our total monthly sales and marketing spend, people plus programs.",
  research_and_development: "Provide our monthly R&D / product development spend (engineering payroll plus tooling).",
  general_and_administrative: "Provide our monthly G&A spend (admin, finance, legal, office).",
  infrastructure_and_operations: "Provide our monthly infrastructure and operations spend (hosting, logistics, internal tooling).",
};

export type CostBenchmarkStatus = "canvas" | "gap";

export interface CostBenchmarkRow {
  category: CostCategory;
  /** Typical mix for the archetype — MODEL KNOWLEDGE, never company evidence. */
  archetype_norm: string;
  status: CostBenchmarkStatus;
  /** Verbatim substring of one of our Cost Structure item texts — parser-enforced. */
  canvas_quote: string | null;
  /** What OUR canvas says in this category — only present when status is "canvas". */
  own_read: string | null;
  /** One-sentence comparison versus the norm (or why the silence matters). */
  comparison: string;
  owner_input_needed: string | null;
}

export interface CostBenchmarkArtifact {
  bodyMd: string;
  archetype: string;
  rows: CostBenchmarkRow[];
}

export const runCostBenchmark: SkillRun = async (toolkit, job, scope) => {
  const costs = await toolkit.loadOwnSectionItems(job.account_id, "cost_structure", scope);
  if (costs.length === 0) throw new Error("cost_benchmark requires our Cost Structure canvas items first");
  // The archetype hangs off the analyzed company's brief; when the account
  // has no named company yet the benchmark still runs off the canvas alone.
  const companyName = scope.companyName ?? "the company";

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const modelResult = await toolkit.runModel(
    `cost_benchmark artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: costBenchmarkPrompt(companyName, costs),
      systemPrompt:
        "You benchmark a company's cost structure against its business archetype. Archetype norms are your general knowledge — always label them as typical for the archetype, never as facts about this company. Every claim about THIS company's costs must quote a provided canvas item verbatim; a category the canvas does not cover is an honest gap, never a guess. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseCostBenchmarkArtifact(modelResult.resultText, costs.map((item) => item.text));
  if (!artifact) throw new Error("cost_benchmark produced unparseable output; refusing to write an artifact");

  // Every ungrounded category is an explicit owner input on the Gap Register.
  // This runs BEFORE the artifact write so a register failure never leaves an
  // artifact claiming gaps that were never opened.
  const gapRows = artifact.rows.filter((row) => row.status === "gap");
  const gapsOpened = await writeCostBenchmarkGaps(toolkit, job, scope, gapRows);

  const grounded = artifact.rows.length - gapRows.length;
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "ledger.cost_benchmark",
    agentKey: "agent_cost_structure",
    title: `Cost benchmark — ${grounded} of ${artifact.rows.length} categories grounded, ${gapRows.length} owner input${gapRows.length === 1 ? "" : "s"} needed`,
    bodyMd: artifact.bodyMd,
    payload: {
      archetype: artifact.archetype,
      rows: artifact.rows,
      gaps_opened: gapsOpened,
      // Norms are the model's general knowledge about the archetype — this
      // label travels with the payload so no downstream reader mistakes them
      // for evidence about the analyzed company.
      archetype_norm_source: "model_knowledge",
      verification: "parser_quote_gated_own_claims",
    },
    evidenceIds: toolkit.unique(costs.flatMap((item) => item.evidenceIds)),
    inputs: { sections: ["cost_structure"], company: companyName },
  });
  await toolkit.markRunCompleted(job, "Cost benchmark completed", {
    skill_key: "ledger.cost_benchmark",
    archetype: artifact.archetype,
    grounded,
    gaps: gapRows.length,
  });
};

/**
 * Re-runs supersede this skill's prior open register rows, then write one
 * fresh row per ungrounded category. The supersede runs even when nothing is
 * ungrounded anymore — a category the owner has since put on the canvas must
 * not keep an open register row.
 */
async function writeCostBenchmarkGaps(
  toolkit: SkillToolkit,
  job: AgentJob,
  scope: CompanyScope,
  gapRows: CostBenchmarkRow[],
): Promise<number> {
  const { error: supersedeError } = await toolkit.client
    .from("gaps")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("account_id", job.account_id)
    .eq("gap_type", "missing_data")
    .like("title", "Cost input:%")
    .in("business_context_version_id", scope.contextIds)
    .in("status", ["open", "acknowledged"]);
  if (supersedeError) throw new Error(`Failed to supersede prior cost benchmark gaps: ${supersedeError.message}`);
  if (gapRows.length === 0) return 0;

  const rows = gapRows.map((row) => ({
    account_id: job.account_id,
    business_context_version_id: scope.activeContextId,
    title: `Cost input: ${row.category}`,
    description: row.owner_input_needed ?? DEFAULT_OWNER_ASKS[row.category],
    gap_type: "missing_data",
    severity: "medium",
    affected_sections: ["cost_structure"],
    recommended_action: `Reply to the Cost Structure agent with the figure or add it to the canvas — the next benchmark run compares ${CATEGORY_LABELS[row.category]} against the archetype norm instead of leaving a gap.`,
    created_by_agent_run_id: job.agent_run_id,
  }));
  const { error } = await toolkit.client.from("gaps").insert(rows);
  if (error) throw new Error(`Failed to write cost benchmark gaps to the register: ${error.message}`);
  return rows.length;
}

export function costBenchmarkPrompt(companyName: string, costs: CanvasItemSource[]): string {
  const categoryLines = COST_CATEGORIES
    .map((category) => `- "${category}": ${CATEGORY_LABELS[category]}`)
    .join("\n");
  return `Benchmark the cost structure of ${companyName} against its business archetype. First name the archetype (e.g. "seed-stage B2B SaaS", "hardware robotics OEM") from the company and its cost items, then cover ALL five categories, exactly once each:
${categoryLines}

Rules for each row:
- "archetype_norm": the typical share or shape of this category for the archetype. This is YOUR general knowledge — phrase it as "typical for the archetype", never as a fact about ${companyName}.
- status "canvas": our canvas covers this category — copy the supporting phrase into "canvas_quote" EXACTLY, character for character, from ONE of our Cost Structure items, and summarize what our canvas says in "own_read".
- status "gap": our canvas is silent on this category — "canvas_quote" and "own_read" are null and "owner_input_needed" is one concrete imperative sentence naming exactly what number the owner must supply.
- "comparison": one sentence comparing our position to the norm (for gaps: what the silence hides).
- Never invent our numbers. A plausible figure for us without a verbatim canvas quote is a "gap".
Return JSON only:
{"archetype":"the archetype name","rows":[{"category":"cogs_or_delivery","archetype_norm":"typical mix for the archetype","status":"canvas|gap","canvas_quote":"verbatim canvas phrase or null","own_read":"what our canvas says or null","comparison":"one-sentence comparison","owner_input_needed":"string or null"}],"body_md":"## Cost benchmark\\n..."}

Our Cost Structure items:
${formatOwnItems(costs)}`;
}

/**
 * The never-invent gate for OUR side of the comparison. A row claiming
 * status "canvas" must carry a canvas_quote that appears VERBATIM inside one
 * of our Cost Structure item texts — one ungrounded row rejects the WHOLE
 * parse (null), because dropping or downgrading it would still ship the
 * invented number inside body_md under a label that implies grounding.
 * Unrecognized categories/statuses and partial frames also null the parse:
 * a missing category would silently hide the very gap the owner owes.
 */
export function parseCostBenchmarkArtifact(text: string, ownCostTexts: string[]): CostBenchmarkArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const archetype = readString(parsed.archetype);
  if (!archetype || !Array.isArray(parsed.rows)) return null;

  const byCategory = new Map<CostCategory, CostBenchmarkRow>();
  for (const entry of parsed.rows) {
    const row = asRecord(entry);
    const category = readString(row.category) as CostCategory | undefined;
    const archetypeNorm = readString(row.archetype_norm);
    const status = readString(row.status);
    const comparison = readString(row.comparison);
    // An unrecognized category or status is an invention — the whole output
    // is untrustworthy, not just this row.
    if (!category || !COST_CATEGORIES.includes(category)) return null;
    if (status !== "canvas" && status !== "gap") return null;
    if (!archetypeNorm || !comparison) return null;

    if (status === "canvas") {
      const canvasQuote = readString(row.canvas_quote);
      const ownRead = readString(row.own_read);
      // The gate: a claim about OUR costs must quote one of our items
      // verbatim. Anything less rejects the whole parse — even on a
      // duplicated category, because body_md is never cross-checked against
      // rows, so a silently-dropped duplicate would still ship its invented
      // number in the body.
      if (!canvasQuote || !ownRead || !ownCostTexts.some((item) => item.includes(canvasQuote))) return null;
      // Only a fully validated duplicate may be dropped in favor of the
      // first row for its category.
      if (byCategory.has(category)) continue;
      byCategory.set(category, {
        category,
        archetype_norm: archetypeNorm,
        status,
        canvas_quote: canvasQuote,
        own_read: ownRead,
        comparison,
        owner_input_needed: null,
      });
      continue;
    }
    // Gap rows carry no claim about our costs — a stray quote is discarded so
    // the register ask is the only thing the owner sees. A duplicated gap
    // category defers to the first row seen.
    if (byCategory.has(category)) continue;
    byCategory.set(category, {
      category,
      archetype_norm: archetypeNorm,
      status: "gap",
      canvas_quote: null,
      own_read: null,
      comparison,
      owner_input_needed: readString(row.owner_input_needed) ?? DEFAULT_OWNER_ASKS[category],
    });
  }
  const bodyMd = readString(parsed.body_md);
  // Every category in the fixed frame must come back — a partial benchmark
  // would silently hide the categories most likely to be gaps.
  if (byCategory.size !== COST_CATEGORIES.length || !bodyMd) return null;
  const rows = COST_CATEGORIES.map((category) => byCategory.get(category) as CostBenchmarkRow);
  return { bodyMd, archetype, rows };
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
