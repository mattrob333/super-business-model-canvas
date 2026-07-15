import type { SupabaseClient } from "@supabase/supabase-js";
import { createAgentHooks } from "../agent/guardrails.js";
import { ClaudeAgentRunner, type AgentRunner } from "../agent/runner.js";
import { readVariables, writeVariables, type BrainVariable } from "../db/brain.js";
import { loadCompanyScope } from "../db/company-scope.js";
import { asRecord } from "../db/json.js";
import type { AgentJob } from "../queue/types.js";
import {
  createSurface,
  emitA2ui,
  updateComponents,
  updateDataModel,
  type A2uiComponent,
  type A2uiMessage,
} from "../workflows/a2ui.js";
import { chooseModelRoute } from "./canvas-section-analysis.js";
import { markJobRunCompleted } from "./run-status.js";

/**
 * Synthesis layer (Atlas plan AT-6, spec §4): after a write burst the brain
 * looks at itself. One compact LLM pass over the variable graph finds
 * (a) CONTRADICTIONS — variables asserting incompatible facts — and
 * (b) SYNERGIES — cross-domain pairs where one asset answers another's need.
 *
 * Rules (binding, spec §1/§4):
 * - Synthesis writes `contradiction.sweep.*` and `synergy.*` records but
 *   NEVER mutates source variables.
 * - Records key on the sorted path pair, so re-sweeps update in place
 *   instead of duplicating.
 * - Cascade invalidation is NOT here — it lives in the brain write RPCs
 *   (one SQL statement at write time beats a polling job).
 */

const SWEEP_SOURCE = "workflow:synthesis-sweep@v1.0#s1" as const;
const MIN_VARIABLES_TO_SWEEP = 4;
const MAX_VALUE_CHARS = 400;
const MAX_DUMP_CHARS = 9_000;
const MAX_FINDINGS_PER_KIND = 3;

interface SweepFinding {
  paths: string[];
  text: string;
}

interface SweepResult {
  contradictions: SweepFinding[];
  synergies: SweepFinding[];
}

export interface SynthesisSweepDependencies {
  client: SupabaseClient;
  runner?: AgentRunner;
}

interface ModelRoute {
  account_id?: string | null;
  route_key?: string | null;
  task_class?: string | null;
  provider: string;
  model_name: string;
  cost_per_1k_in: number | null;
  cost_per_1k_out: number | null;
}

export class SynthesisSweepHandler {
  private readonly runner: AgentRunner;

  constructor(private readonly deps: SynthesisSweepDependencies) {
    this.runner = deps.runner ?? new ClaudeAgentRunner();
  }

  async handle(job: AgentJob): Promise<void> {
    const payload = asRecord(job.payload);
    const threadId = readString(payload.thread_id ?? payload.threadId);
    // The sweep audits ONE company's brain — the one whose run triggered it
    // ('' is a real bucket: accounts with no named company). Jobs queued
    // before company scoping shipped carry no key and fall back to the
    // active company.
    const rawKey = payload.company_key ?? payload.companyKey;
    const companyKey = typeof rawKey === "string"
      ? rawKey
      : (await loadCompanyScope(this.deps.client, job.account_id)).companyKey ?? "";

    // Sweep the source graph only — never our own outputs, or every sweep
    // would re-synthesize the previous sweep's records.
    const all = await readVariables(this.deps.client, job.account_id, companyKey, {});
    const sources = all.filter(
      (variable) => !variable.path.startsWith("contradiction.") && !variable.path.startsWith("synergy."),
    );
    if (sources.length < MIN_VARIABLES_TO_SWEEP) {
      await markJobRunCompleted(this.deps.client, job, "Brain too thin to synthesize yet.", {
        kind: "synthesis_sweep_v1",
        swept: sources.length,
        contradictions: 0,
        synergies: 0,
      });
      return;
    }

    const route = await this.loadModelRoute(job.account_id);
    const result = await this.runner.run({
      model: route.model_name,
      maxTurns: 4,
      maxBudgetUsd: 0.5,
      systemPrompt: SWEEP_SYSTEM_PROMPT,
      prompt: buildSweepPrompt(sources),
      mcpServers: {},
      allowedTools: [],
      hooks: createAgentHooks({ accountId: job.account_id, agentRunId: job.agent_run_id, jobKind: job.kind }),
    });

    const parsed = parseSweepResult(result.resultText, new Set(sources.map((variable) => variable.path)));
    if (!parsed) throw new Error("synthesis_sweep produced no valid JSON verdict");

    const writes = [
      ...parsed.contradictions.map((finding) => ({
        path: `contradiction.sweep.${pairSlug(finding.paths)}`,
        value: { paths: finding.paths, summary: finding.text, detected_at: new Date().toISOString() },
        confidence: "medium" as const,
      })),
      ...parsed.synergies.map((finding) => ({
        path: `synergy.${pairSlug(finding.paths)}`,
        value: { paths: finding.paths, insight: finding.text, detected_at: new Date().toISOString() },
        confidence: "medium" as const,
      })),
    ];
    if (writes.length > 0) {
      await writeVariables(this.deps.client, job.account_id, companyKey, writes, { source: SWEEP_SOURCE });
    }

    if (threadId && writes.length > 0) {
      await this.emitFindings(job, threadId, sources, parsed);
    }

    await markJobRunCompleted(
      this.deps.client,
      job,
      summaryLine(parsed),
      {
        kind: "synthesis_sweep_v1",
        swept: sources.length,
        contradictions: parsed.contradictions.length,
        synergies: parsed.synergies.length,
        record_paths: writes.map((write) => write.path),
      },
    );
  }

  /** Findings render in the run's thread via the existing catalog — no new components. */
  private async emitFindings(job: AgentJob, threadId: string, sources: BrainVariable[], parsed: SweepResult): Promise<void> {
    const surfaceId = `synth-${job.id}`;
    const byPath = new Map(sources.map((variable) => [variable.path, variable]));
    const components: A2uiComponent[] = [];
    const messages: A2uiMessage[] = [createSurface(surfaceId)];

    parsed.contradictions.forEach((finding, index) => {
      const [a, b] = finding.paths;
      messages.push(updateDataModel(surfaceId, `/records/c${index}`, {
        value: {
          existing: { [a]: truncateValue(byPath.get(a)?.value) },
          incoming: { [b]: truncateValue(byPath.get(b)?.value) },
        },
      }));
      components.push({
        id: `contradiction-${index}`,
        component: { ContradictionAlert: { path: `/records/c${index}`, about: finding.text } },
      });
    });
    parsed.synergies.forEach((finding, index) => {
      messages.push(updateDataModel(surfaceId, `/records/s${index}`, {
        path: `synergy.${pairSlug(finding.paths)}`,
        value: finding.text,
        confidence: "medium",
      }));
      components.push({
        id: `synergy-${index}`,
        component: { VariableCard: { path: `/records/s${index}`, editable: false } },
      });
    });

    messages.push(updateComponents(surfaceId, components));
    await emitA2ui(this.deps.client, { threadId, agentRunId: job.agent_run_id, surfaceId, messages });
  }

  private async loadModelRoute(accountId: string): Promise<ModelRoute> {
    const { data, error } = await this.deps.client
      .from("model_routes")
      .select("account_id, route_key, task_class, provider, model_name, cost_per_1k_in, cost_per_1k_out")
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .or("task_class.eq.synthesis_sweep,task_class.eq.workflow_run,task_class.eq.skill_run,task_class.eq.workspace_chat");
    if (error) throw new Error(`Failed to load synthesis model route: ${error.message}`);
    const routes = (data ?? []) as ModelRoute[];
    const route = chooseModelRoute(routes, accountId, "synthesis_sweep", "synthesis_sweep")
      ?? chooseModelRoute(routes, accountId, "synthesis_sweep", "workflow_run")
      ?? chooseModelRoute(routes, accountId, "synthesis_sweep", "skill_run")
      ?? chooseModelRoute(routes, accountId, "synthesis_sweep", "workspace_chat");
    if (!route) throw new Error("No model route configured for synthesis_sweep (or its fallbacks)");
    return route;
  }
}

const SWEEP_SYSTEM_PROMPT = `You audit a business's typed variable store ("brain") after new writes.
Find only what the variables actually say — never invent facts, never restate a variable as its own contradiction.

CONTRADICTION: two variables assert incompatible facts (different numbers for the same thing, incompatible strategies, a claim its own evidence undercuts).
SYNERGY: two variables from DIFFERENT namespaces where one is an unused answer to the other (an asset that closes a named gap, proof that supports an unproven theme).

Reply with ONE JSON object and nothing else:
{"contradictions":[{"paths":["<path>","<path>"],"summary":"<one plain sentence naming both sides>"}],
 "synergies":[{"paths":["<path>","<path>"],"insight":"<one plain sentence: what to do with the pairing>"}]}
Rules: at most ${MAX_FINDINGS_PER_KIND} of each; exactly 2 paths per finding, copied verbatim from the dump; empty arrays when nothing qualifies — most sweeps find nothing, and that is the correct answer.`;

function buildSweepPrompt(variables: BrainVariable[]): string {
  const lines: string[] = [];
  let used = 0;
  for (const variable of variables) {
    const line = `${variable.path} [${variable.source}, ${variable.confidence}]: ${truncateValue(variable.value)}`;
    if (used + line.length > MAX_DUMP_CHARS) break;
    lines.push(line);
    used += line.length;
  }
  return `Variable dump (${lines.length} of ${variables.length} variables):\n${lines.join("\n")}`;
}

function truncateValue(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "";
  return text.length <= MAX_VALUE_CHARS ? text : `${text.slice(0, MAX_VALUE_CHARS - 1)}…`;
}

/** Stable record key: the sorted pair, so re-sweeps overwrite instead of piling up. */
function pairSlug(paths: string[]): string {
  return [...paths].sort().join("+");
}

export function parseSweepResult(text: string, knownPaths: Set<string>): SweepResult | null {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const clean = (value: unknown, textKey: string): SweepFinding[] =>
    (Array.isArray(value) ? value : [])
      .flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) return [];
        const finding = entry as Record<string, unknown>;
        const paths = Array.isArray(finding.paths)
          ? finding.paths.filter((path): path is string => typeof path === "string" && knownPaths.has(path))
          : [];
        const summary = finding[textKey];
        // Hallucinated paths invalidate the finding — the model must cite
        // variables that exist, or the record is noise.
        if (paths.length !== 2 || paths[0] === paths[1] || typeof summary !== "string" || !summary.trim()) return [];
        return [{ paths, text: summary.trim() }];
      })
      .slice(0, MAX_FINDINGS_PER_KIND);

  return {
    contradictions: clean(record.contradictions, "summary"),
    synergies: clean(record.synergies, "insight"),
  };
}

function summaryLine(parsed: SweepResult): string {
  if (parsed.contradictions.length === 0 && parsed.synergies.length === 0) {
    return "Synthesis sweep: no contradictions or synergies found.";
  }
  return `Synthesis sweep: ${parsed.contradictions.length} contradiction(s), ${parsed.synergies.length} synergy(ies).`;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
