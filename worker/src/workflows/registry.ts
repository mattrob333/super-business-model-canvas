import { Ajv, type ValidateFunction } from "ajv";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const jsonSchemaObject = z
  .record(z.string(), z.unknown())
  .refine((schema) => schema.type === "object", {
    message: "variables_schema must be a JSON Schema object with type: object",
  });

/**
 * Per-step presentation hints: the card (data, not code) declares which
 * catalog component renders each VARIABLES key. The enum IS the catalog
 * whitelist — an off-catalog name fails card load, so nothing outside the
 * 10 components can ever be requested (spec §3 rule).
 */
const presentationSchema = z.strictObject({
  component: z.enum([
    "VariableCard",
    "GapPrompt",
    "ChoiceChips",
    "ScoreTable",
    "ComparisonStrip",
    "ValueThemeCard",
    "ConfidenceBadge",
    "CoverageMap",
    "WorkflowRunCard",
    "ContradictionAlert",
  ]),
  /** The step's VARIABLES key this component renders. */
  bind: z.string().min(1),
  props: z.record(z.string(), z.unknown()).optional(),
});

const workflowStepSchema = z.strictObject({
  id: z.string().min(1),
  prompt: z.string().min(1),
  reads: z.array(z.string()),
  variables_schema: jsonSchemaObject,
  presentation: z.array(presentationSchema).optional(),
});

export const workflowCardSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  framework_source: z.string().min(1),
  version: z.union([z.string().min(1), z.number().finite()]),
  status: z.enum(["runnable", "draft"]),
  inputs_required: z.array(z.string()),
  inputs_optional: z.array(z.string()),
  missing_input_behavior: z.string().min(1),
  tools_allowed: z.array(z.string()),
  tools_required_steps: z.array(z.union([z.string(), z.number().int()])),
  system_preamble: z.string().min(1),
  steps: z.array(workflowStepSchema).min(1),
  produces_variables: z.array(z.string()),
  consumed_by: z.array(z.string()),
  output_artifact: z.string().min(1),
  output_page_hint: z.string().min(1),
  est_context_per_step: z.string().min(1),
});

export type WorkflowCard = z.infer<typeof workflowCardSchema>;
export type WorkflowStep = WorkflowCard["steps"][number];

export interface LoadedWorkflowCard extends WorkflowCard {
  source_path: string;
  validators: ReadonlyMap<string, ValidateFunction>;
}

export type WorkflowRegistry = ReadonlyMap<string, LoadedWorkflowCard>;

const defaultWorkflowsDirectory = fileURLToPath(new URL("../../workflows", import.meta.url));

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "card"}: ${issue.message}`)
    .join("; ");
}

function compileVariableSchemas(card: WorkflowCard, sourcePath: string): ReadonlyMap<string, ValidateFunction> {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validators = new Map<string, ValidateFunction>();

  for (const step of card.steps) {
    try {
      validators.set(step.id, ajv.compile(step.variables_schema));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid variables_schema in ${sourcePath} step ${step.id}: ${detail}`);
    }
  }

  return validators;
}

export async function loadWorkflowCard(sourcePath: string): Promise<LoadedWorkflowCard> {
  let parsed: unknown;
  try {
    parsed = parse(await readFile(sourcePath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse workflow card ${sourcePath}: ${detail}`);
  }

  const result = workflowCardSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid workflow card ${sourcePath}: ${formatZodError(result.error)}`);
  }

  return {
    ...result.data,
    source_path: sourcePath,
    validators: compileVariableSchemas(result.data, sourcePath),
  };
}

export async function loadWorkflowRegistry(workflowsDirectory = defaultWorkflowsDirectory): Promise<WorkflowRegistry> {
  const files = readdirSync(workflowsDirectory)
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .sort();
  const cards = await Promise.all(files.map((file) => loadWorkflowCard(path.join(workflowsDirectory, file))));
  const registry = new Map<string, LoadedWorkflowCard>();

  for (const card of cards) {
    if (registry.has(card.id)) {
      const prior = registry.get(card.id);
      throw new Error(`Duplicate workflow id ${card.id} in ${prior?.source_path} and ${card.source_path}`);
    }
    registry.set(card.id, card);
  }

  return registry;
}

export const loadWorkflowCards = loadWorkflowRegistry;

export { defaultWorkflowsDirectory };
