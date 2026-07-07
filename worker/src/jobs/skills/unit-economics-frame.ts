import type { CompanyScope } from "../../db/company-scope.js";
import { asRecord } from "../../db/json.js";
import type { AgentJob } from "../../queue/types.js";
import type { CanvasItemSource, SkillRun, SkillToolkit } from "./toolkit.js";

/**
 * ledger.unit_economics_frame — the Cost Structure room's unit economics
 * skeleton. One model pass fills a FIXED six-variable frame (CAC, ACV/ARPA,
 * gross margin, retention/churn, payback, LTV) strictly from our own Revenue
 * Streams + Cost Structure canvas (Customer Segments ride along as optional
 * context). The never-invent gate lives in the parser: a row may only claim
 * "known" or "estimated_from_canvas" when it quotes the canvas verbatim —
 * anything else is DOWNGRADED to "unknown" rather than shipped as a number
 * the owner never wrote down. Every unknown becomes an explicit owner input
 * on the Gap Register, superseding this skill's prior open rows so re-runs
 * never duplicate. Canvas-only inputs mean there is no external excerpt for
 * a verifier to check against — payload.verification names the parser gate
 * instead of faking one.
 */

export const UNIT_ECONOMICS_VARIABLES = [
  "cac",
  "acv_or_arpa",
  "gross_margin",
  "retention_or_churn",
  "payback_months",
  "ltv",
] as const;

export type UnitEconomicsVariable = (typeof UNIT_ECONOMICS_VARIABLES)[number];

const VARIABLE_LABELS: Record<UnitEconomicsVariable, string> = {
  cac: "CAC (customer acquisition cost)",
  acv_or_arpa: "ACV or ARPA (average contract value / revenue per account)",
  gross_margin: "Gross margin",
  retention_or_churn: "Retention or churn rate",
  payback_months: "CAC payback in months",
  ltv: "LTV (customer lifetime value)",
};

// The default owner ask when an unknown row (including a downgraded one)
// comes back without its own owner_input_needed — a register row must always
// tell the owner exactly what to supply.
const DEFAULT_OWNER_ASKS: Record<UnitEconomicsVariable, string> = {
  cac: "Provide our actual blended customer acquisition cost (recent quarter if possible).",
  acv_or_arpa: "Provide our actual average contract value or average revenue per account.",
  gross_margin: "Provide our actual gross margin percentage from the books.",
  retention_or_churn: "Provide our actual retention or churn rate (monthly or annual, say which).",
  payback_months: "Provide how many months of gross profit it takes to recover CAC.",
  ltv: "Provide our actual customer lifetime value or the churn and margin inputs to derive it.",
};

export type UnitEconomicsStatus = "known" | "estimated_from_canvas" | "unknown";

export interface UnitEconomicsRow {
  variable: UnitEconomicsVariable;
  status: UnitEconomicsStatus;
  value_or_range: string | null;
  /** Verbatim substring of our own canvas item texts — parser-enforced. */
  canvas_quote: string | null;
  basis: string;
  owner_input_needed: string | null;
}

export interface UnitEconomicsFrameArtifact {
  bodyMd: string;
  variables: UnitEconomicsRow[];
}

export const runUnitEconomicsFrame: SkillRun = async (toolkit, job, scope) => {
  const revenue = await toolkit.loadOwnSectionItems(job.account_id, "revenue_streams", scope);
  if (revenue.length === 0) throw new Error("unit_economics_frame requires our Revenue Streams canvas items first");
  const costs = await toolkit.loadOwnSectionItems(job.account_id, "cost_structure", scope);
  if (costs.length === 0) throw new Error("unit_economics_frame requires our Cost Structure canvas items first");

  // Optional context: segments anchor which customer the "unit" is — their
  // absence must not block the frame.
  const segments = await toolkit.loadOwnSectionItems(job.account_id, "customer_segments", scope);

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const modelResult = await toolkit.runModel(
    `unit_economics_frame artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: unitEconomicsFramePrompt(revenue, costs, segments),
      systemPrompt:
        "You fill a unit economics frame strictly from the provided canvas items. Never invent numbers — a value without a verbatim canvas quote is 'unknown' with a concrete owner ask. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const canvasTexts = [...revenue, ...costs, ...segments].map((item) => item.text);
  const artifact = parseUnitEconomicsFrameArtifact(modelResult.resultText, canvasTexts);
  if (!artifact) throw new Error("unit_economics_frame produced unparseable output; refusing to write an artifact");

  // Every unknown is an explicit owner input on the Gap Register. This runs
  // BEFORE the artifact write so a register failure never leaves an artifact
  // claiming gaps that were never opened.
  const unknownRows = artifact.variables.filter((row) => row.status === "unknown");
  const gapsOpened = await writeUnitEconomicsGaps(toolkit, job, scope, unknownRows);

  const known = artifact.variables.length - unknownRows.length;
  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "ledger.unit_economics_frame",
    agentKey: "agent_cost_structure",
    title: `Unit economics frame — ${known} known, ${unknownRows.length} owner inputs needed`,
    bodyMd: artifact.bodyMd,
    payload: { variables: artifact.variables, gaps_opened: gapsOpened, verification: "parser_quote_gated" },
    evidenceIds: toolkit.unique([...revenue, ...costs].flatMap((item) => item.evidenceIds)),
    inputs: { sections: ["revenue_streams", "cost_structure", "customer_segments"] },
  });
  await toolkit.markRunCompleted(job, "Unit economics frame completed", {
    skill_key: "ledger.unit_economics_frame",
    known,
    unknown: unknownRows.length,
  });
};

/**
 * Re-runs supersede this skill's prior open register rows, then write one
 * fresh row per unknown variable. The supersede runs even when nothing is
 * unknown anymore — a variable the owner has since filled in must not keep
 * an open register row.
 */
async function writeUnitEconomicsGaps(
  toolkit: SkillToolkit,
  job: AgentJob,
  scope: CompanyScope,
  unknownRows: UnitEconomicsRow[],
): Promise<number> {
  const { error: supersedeError } = await toolkit.client
    .from("gaps")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("account_id", job.account_id)
    .eq("gap_type", "missing_data")
    .like("title", "Unit economics input:%")
    .in("business_context_version_id", scope.contextIds)
    .in("status", ["open", "acknowledged"]);
  if (supersedeError) throw new Error(`Failed to supersede prior unit economics gaps: ${supersedeError.message}`);
  if (unknownRows.length === 0) return 0;

  const rows = unknownRows.map((row) => ({
    account_id: job.account_id,
    business_context_version_id: scope.activeContextId,
    title: `Unit economics input: ${row.variable}`,
    description: row.owner_input_needed ?? DEFAULT_OWNER_ASKS[row.variable],
    gap_type: "missing_data",
    severity: "medium",
    affected_sections: ["cost_structure"],
    recommended_action: `Reply to the Cost Structure agent with the figure or add it to the canvas — the next frame run upgrades ${VARIABLE_LABELS[row.variable]} from unknown.`,
    created_by_agent_run_id: job.agent_run_id,
  }));
  const { error } = await toolkit.client.from("gaps").insert(rows);
  if (error) throw new Error(`Failed to write unit economics gaps to the register: ${error.message}`);
  return rows.length;
}

export function unitEconomicsFramePrompt(
  revenue: CanvasItemSource[],
  costs: CanvasItemSource[],
  segments: CanvasItemSource[],
): string {
  const variableLines = UNIT_ECONOMICS_VARIABLES
    .map((variable) => `- "${variable}": ${VARIABLE_LABELS[variable]}`)
    .join("\n");
  return `Fill the unit economics frame below strictly from our canvas items. Cover ALL six variables, exactly once each:
${variableLines}

Rules for each row:
- status "known": the canvas states the value — copy the supporting phrase into "canvas_quote" EXACTLY, character for character, and put the value in "value_or_range".
- status "estimated_from_canvas": the value is derivable from canvas numbers — quote the phrase you derived it from verbatim in "canvas_quote" and show the arithmetic in "basis".
- status "unknown": the canvas neither states nor implies it — "value_or_range" and "canvas_quote" are null and "owner_input_needed" is one concrete imperative sentence naming exactly what the owner must supply.
- Never invent or guess numbers. A plausible industry figure without a canvas quote is "unknown".
Return JSON only:
{"variables":[{"variable":"cac","status":"known|estimated_from_canvas|unknown","value_or_range":"string or null","canvas_quote":"verbatim canvas phrase or null","basis":"one-sentence reasoning","owner_input_needed":"string or null"}],"body_md":"## Unit economics frame\\n..."}

Our Revenue Streams:
${formatOwnItems(revenue)}

Our Cost Structure:
${formatOwnItems(costs)}

Our Customer Segments (context for what one "unit" is):
${formatOwnItems(segments)}`;
}

/**
 * The never-invent gate. A row claiming "known" or "estimated_from_canvas"
 * must carry a canvas_quote that appears VERBATIM in the joined own canvas
 * texts — otherwise the row is downgraded to "unknown" (kept, not dropped:
 * a silently vanished variable would hide the exact input the owner owes).
 * All six variables must come back or the parse is null.
 */
export function parseUnitEconomicsFrameArtifact(text: string, canvasTexts: string[]): UnitEconomicsFrameArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const corpus = canvasTexts.join("\n");
  const byVariable = new Map<UnitEconomicsVariable, UnitEconomicsRow>();
  if (Array.isArray(parsed.variables)) {
    for (const entry of parsed.variables) {
      const row = asRecord(entry);
      const variable = readString(row.variable) as UnitEconomicsVariable | undefined;
      const status = readString(row.status);
      const basis = readString(row.basis);
      // Unrecognized variables and statuses are inventions — drop the row;
      // the all-six completeness check below turns a drop into a null parse.
      if (!variable || !basis || !UNIT_ECONOMICS_VARIABLES.includes(variable)) continue;
      if (status !== "known" && status !== "estimated_from_canvas" && status !== "unknown") continue;
      if (byVariable.has(variable)) continue;

      const valueOrRange = readString(row.value_or_range) ?? null;
      const canvasQuote = readString(row.canvas_quote) ?? null;
      const ownerInputNeeded = readString(row.owner_input_needed) ?? null;
      // The gate: known/estimated needs a value AND a verbatim canvas quote.
      // Anything less is an invented number — downgrade to unknown so the
      // variable becomes an owner input instead of a fabrication.
      const grounded = Boolean(valueOrRange) && Boolean(canvasQuote) && corpus.includes(canvasQuote as string);
      if (status !== "unknown" && grounded) {
        byVariable.set(variable, {
          variable,
          status,
          value_or_range: valueOrRange,
          canvas_quote: canvasQuote,
          basis,
          owner_input_needed: null,
        });
        continue;
      }
      byVariable.set(variable, {
        variable,
        status: "unknown",
        value_or_range: null,
        canvas_quote: null,
        basis,
        owner_input_needed: ownerInputNeeded ?? DEFAULT_OWNER_ASKS[variable],
      });
    }
  }
  const bodyMd = readString(parsed.body_md);
  // Every variable in the fixed frame must come back — a partial frame would
  // silently hide the very inputs the owner most needs to supply.
  if (byVariable.size !== UNIT_ECONOMICS_VARIABLES.length || !bodyMd) return null;
  const variables = UNIT_ECONOMICS_VARIABLES.map((variable) => byVariable.get(variable) as UnitEconomicsRow);
  return { bodyMd, variables };
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
