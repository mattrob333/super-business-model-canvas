import { z } from "zod";

export const legacySectionAnalysisSchema = z.object({
  items: z.array(z.string().min(1)).default([]),
  notes: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.7),
  summary: z.string().default(""),
});

export type LegacySectionAnalysisOutput = z.infer<typeof legacySectionAnalysisSchema>;

export function parseLegacySectionAnalysis(text: string): LegacySectionAnalysisOutput {
  const clean = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const parsed: unknown = JSON.parse(clean);
  return legacySectionAnalysisSchema.parse(parsed);
}

export function buildSystemPrompt(agentKey: string, sectionLabel: string, instructions: string | null): string {
  const outputFormat = `
You MUST respond with valid JSON only (no markdown, no code blocks) in this exact structure:
{
  "items": ["specific, actionable item 1", "specific, actionable item 2"],
  "notes": "2-3 sentence analysis noting strengths, risks, and recommendations",
  "confidence": 0.0,
  "summary": "1 sentence summary of findings"
}`;

  if (instructions && instructions.trim().length > 0) {
    return `${instructions.trim()}\n${outputFormat}`;
  }

  return `You are an expert business strategy analyst AI agent specializing in Business Model Canvas analysis.

Your task: Analyze the "${sectionLabel}" section of a Business Model Canvas and produce actionable, evidence-backed insights.
${outputFormat}

Guidelines:
- Provide 3-5 specific, actionable items.
- Confidence reflects evidence quality: 0.9+ = well-sourced, 0.7-0.9 = inferred, 0.5-0.7 = speculative.
- Notes should highlight both strengths and gaps.
- Be concise and specific.
- If the input contains existing canvas data, build on it rather than repeating.

Agent key: ${agentKey}
Section: ${sectionLabel}`;
}

export interface PromptInput {
  sectionLabel: string;
  existingItems: string[];
  companyName?: string;
  industry?: string;
}

export function buildUserPrompt(input: PromptInput): string {
  let prompt = `Analyze the "${input.sectionLabel}" section of the Business Model Canvas.\n\nContext:\n`;
  if (input.companyName) prompt += `- Company: ${input.companyName}\n`;
  if (input.industry) prompt += `- Industry: ${input.industry}\n`;

  if (input.existingItems.length > 0) {
    prompt += "- Existing items in this section:\n";
    for (const item of input.existingItems) {
      prompt += `  - ${item}\n`;
    }
    prompt += "\nBuild on these existing items - refine, expand, or identify gaps.\n";
  } else {
    prompt += "\nNo existing items - generate fresh analysis from scratch.\n";
  }

  prompt += "\nReturn valid JSON only.";
  return prompt;
}
