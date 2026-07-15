import type { SupabaseClient } from "@supabase/supabase-js";
import { stringify as stringifyYaml } from "yaml";
import type { AgentRunner, AgentRunResult } from "../agent/runner.js";
import { ClaudeAgentRunner, OpenRouterChatRunner } from "../agent/runner.js";
import { createAgentHooks } from "../agent/guardrails.js";
import { readVariables, writeVariables, type BrainConfidence, type BrainVariable } from "../db/brain.js";
import { loadCompanyScope } from "../db/company-scope.js";
import { asRecord } from "../db/json.js";
import { buildCanvasSnapshot } from "../domain/canvas-snapshot.js";
import type { FeedRuntimeConfig } from "../feeds/types.js";
import type { AgentJob } from "../queue/types.js";
import { createBmcServer } from "../tools/bmc-tools.js";
import { chooseModelRoute } from "./canvas-section-analysis.js";
import {
  createSurface,
  emitA2ui,
  pointerSegment,
  surfaceIdForRun,
  updateComponents,
  updateDataModel,
  type A2uiComponent,
  type A2uiMessage,
} from "../workflows/a2ui.js";
import { postprocessWorkflowArtifact } from "../workflows/postprocess.js";
import {
  loadWorkflowRegistry,
  type LoadedWorkflowCard,
  type WorkflowRegistry,
  type WorkflowStep,
} from "../workflows/registry.js";

interface ModelRoute {
  account_id?: string | null;
  route_key?: string | null;
  task_class?: string | null;
  provider: string;
  model_name: string;
  params?: Record<string, unknown> | null;
  cost_per_1k_in: number | null;
  cost_per_1k_out: number | null;
}

export interface WorkflowRunDependencies extends FeedRuntimeConfig {
  client: SupabaseClient;
  runner?: AgentRunner;
  registry?: WorkflowRegistry;
  openRouterApiKey?: string;
}

interface ParsedStepOutput {
  artifactSection: string;
  variables: Record<string, unknown>;
}

interface StepExecution {
  parsed: ParsedStepOutput;
  result: AgentRunResult;
  attempts: number;
}

interface WorkflowFrontmatter {
  workflow: string;
  version: string;
  business: string;
  run_date: string;
  produces: string[];
  consumed: string[];
  confidence: BrainConfidence;
}

const registryAtBoot = await loadWorkflowRegistry();

/** One data-driven interpreter for every authored Atlas workflow card. */
export class WorkflowRunHandler {
  private readonly defaultRunner: AgentRunner;

  constructor(private readonly deps: WorkflowRunDependencies) {
    this.defaultRunner = deps.runner ?? new ClaudeAgentRunner();
  }

  async handle(job: AgentJob): Promise<void> {
    const payload = asRecord(job.payload);
    const workflowId = readString(payload.workflow_id ?? payload.workflowId);
    if (!workflowId) throw new Error("workflow_run requires workflow_id");
    const threadId = readString(payload.thread_id ?? payload.threadId) ?? null;
    // Resume flag: the user chose to continue without answering the step's
    // questions — proceed, leaving the unanswered slots honestly absent.
    const skipAwaits = payload.skip_awaits === true;

    const registry = this.deps.registry ?? await registryAtBoot;
    const card = registry.get(workflowId);
    if (!card) throw new Error(`Unknown workflow: ${workflowId}`);
    if (card.status !== "runnable") throw new Error(`Workflow ${workflowId} is not runnable (status: ${card.status})`);

    const runId = await this.ensureWorkflowRun(job, card, threadId, readString(payload.workflow_run_id ?? payload.workflowRunId));
    try {
      await this.execute(job, runId, card, threadId, skipAwaits);
    } catch (error) {
      const message = humanError(error);
      await this.failWorkflowRun(job.account_id, runId, message);
      await this.emit(job, threadId, runId, [
        updateDataModel(surfaceIdForRun(runId), "/run/status", "failed"),
        updateDataModel(surfaceIdForRun(runId), "/run/error", message),
      ]);
      throw error;
    }
  }

  private async execute(job: AgentJob, runId: string, card: LoadedWorkflowCard, threadId: string | null, skipAwaits = false): Promise<void> {
    const scope = await loadCompanyScope(this.deps.client, job.account_id);
    if (!scope.activeContextId) {
      throw new Error("This workflow needs an analyzed company first. Add a website or founder document, then retry.");
    }

    const route = await this.loadModelRoute(job.account_id);
    // Resume support: a run paused for input carries its finished steps in
    // step_state (variables written + the artifact section). Completed steps
    // are skipped, their outputs rebuilt from the durable record.
    const { data: existingRun } = await this.deps.client
      .from("workflow_runs")
      .select("step_state")
      .eq("id", runId)
      .eq("account_id", job.account_id)
      .maybeSingle();
    const priorState = asRecord(existingRun?.step_state);
    await this.markRunning(job, runId, card, route);

    const canvasRows = await readVariables(this.deps.client, job.account_id, { prefix: "canvas." });
    const snapshot = buildCanvasSnapshot(canvasRows);
    if (snapshot.truncated) {
      console.warn(`[workflow:${card.id}] compact canvas snapshot truncated to ${snapshot.chars} characters; dropped: ${snapshot.omittedSections.join(", ")}`);
    }

    const declaredInputPaths = unique(
      [...card.inputs_required, ...card.inputs_optional].map(inputBrainPath).filter(isString),
    );
    const initialInputs = await readVariables(this.deps.client, job.account_id, { paths: declaredInputPaths });
    const byPath = new Map(initialInputs.map((variable) => [variable.path, variable]));
    const missing = card.inputs_required.filter((path) => {
      const brainPath = inputBrainPath(path);
      return !brainPath || !hasValue(byPath.get(brainPath)?.value);
    });
    if (missing.length > 0 && !allowsMissingInputs(card.missing_input_behavior)) {
      throw new Error(`Workflow ${card.name} needs more input before it can run: ${missing.join(", ")}. ${card.missing_input_behavior}`);
    }

    const priorVariables: Record<string, unknown> = {};
    const consumed = new Set(initialInputs.map((variable) => variable.path));
    const artifactSections: string[] = [];
    const stepState: Record<string, unknown> = {};
    for (const [stepId, entry] of Object.entries(priorState)) {
      const record = asRecord(entry);
      if (record.status === "completed") stepState[stepId] = record;
    }
    let totals = { tokensIn: 0, tokensOut: 0, costUsd: 0 };

    // AT-3: one A2UI surface per run. The WorkflowRunCard binds to /run and
    // GapPrompts offer to fill the missing required inputs (answers write
    // user_stated via the AT-4 RPC and benefit the NEXT run — this run
    // proceeds per the card's missing_input_behavior).
    const surfaceId = surfaceIdForRun(runId);
    await this.emit(job, threadId, runId, [
      createSurface(surfaceId),
      updateComponents(surfaceId, [
        { id: "run", component: { WorkflowRunCard: { path: "/run" } } },
        ...missing.map((input): A2uiComponent => ({
          id: `gap-${input}`,
          component: {
            GapPrompt: {
              slot: inputBrainPath(input) ?? input,
              question: `I don't have "${input.replace(/_/g, " ")}" yet. Add it and the next run gets sharper.`,
              mode: "text",
            },
          },
        })),
      ]),
      updateDataModel(surfaceId, "/run", {
        workflowId: card.id,
        name: card.name,
        status: "running",
        steps: card.steps.map((step) => ({ id: step.id, status: "pending" })),
      }),
    ]);

    for (let index = 0; index < card.steps.length; index += 1) {
      const step = card.steps[index];

      // Resume: a step this run already finished is rebuilt from the durable
      // record — variables re-read from the brain (freshest values win, so a
      // user_override made while paused flows into later steps), artifact
      // section restored — and never re-executed.
      const completedEntry = asRecord(stepState[step.id]);
      if (completedEntry.status === "completed") {
        const paths = Array.isArray(completedEntry.variables)
          ? completedEntry.variables.filter((path): path is string => typeof path === "string")
          : [];
        if (paths.length > 0) {
          const restored = await readVariables(this.deps.client, job.account_id, { paths });
          for (const variable of restored) priorVariables[variable.path] = variable.value;
        }
        if (typeof completedEntry.artifact_section === "string") {
          artifactSections.push(completedEntry.artifact_section);
        }
        await this.emit(job, threadId, runId, [
          updateDataModel(surfaceId, `/run/steps/${index}/status`, "completed"),
        ]);
        continue;
      }

      // Interactive step: the card asks the user BEFORE this step runs. If
      // any asked slot is still empty (and the user hasn't chosen to skip),
      // pause the run — the questions render in chat, the answers land as
      // user_stated, and the resume job picks up exactly here.
      const asks = step.await_input ?? [];
      const askPaths = asks.map((ask) => ask.slot);
      if (askPaths.length > 0) {
        const answered = await readVariables(this.deps.client, job.account_id, { paths: askPaths });
        for (const variable of answered) {
          byPath.set(variable.path, variable);
          consumed.add(variable.path);
        }
        if (!skipAwaits) {
          const answeredPaths = new Set(answered.filter((v) => hasValue(v.value)).map((v) => v.path));
          const missingAsks = asks.filter((ask) => !answeredPaths.has(ask.slot));
          if (missingAsks.length > 0) {
            await this.pauseForInput(job, runId, card, threadId, step.id, index, missingAsks, stepState);
            return;
          }
        }
      }

      const declaredReads = brainReads(step.reads);
      if (declaredReads.length > 0) {
        const refreshed = await readVariables(this.deps.client, job.account_id, { paths: declaredReads });
        for (const variable of refreshed) {
          byPath.set(variable.path, variable);
          consumed.add(variable.path);
        }
      }

      await this.updateWorkflowRun(job.account_id, runId, {
        status: "running",
        current_step: step.id,
        step_state: { ...stepState, [step.id]: { status: "running", attempts: 0 } },
      });

      const prompt = buildStepPrompt(card, step, index, snapshot.snapshot, byPath, priorVariables, missing, askPaths);
      const execution = await this.runValidatedStep(job, card, step, route, prompt);
      totals = addUsage(totals, execution.result);

      const writes = variablesToWrites(card, execution.parsed.variables);
      if (writes.length === 0) {
        throw new Error(`Step ${step.id} produced no declared workflow variables`);
      }
      // Output contract: a step that finds research contradicting the brain
      // emits a contradictions[] block. Persist it as a contradiction.* record
      // so Atlas (AT-6 sweep) can surface it — never drop it silently.
      const declaredContradictions = execution.parsed.variables.contradictions;
      if (Array.isArray(declaredContradictions) && declaredContradictions.length > 0) {
        writes.push({
          path: `contradiction.${card.id}.${step.id}`,
          value: declaredContradictions,
          confidence: confidenceFromVariables(execution.parsed.variables),
        });
      }
      const sourceArtifact = `artifact/${card.id}/${runId}/${card.output_artifact}`;
      const writeResult = await writeVariables(this.deps.client, job.account_id, writes, {
        source: `workflow:${card.id}@v${String(card.version)}#s${index + 1}`,
        sourceArtifact,
      });

      for (const write of writes) priorVariables[write.path] = write.value;
      artifactSections.push(execution.parsed.artifactSection);
      stepState[step.id] = {
        status: "completed",
        attempts: execution.attempts,
        variables: writes.map((write) => write.path),
        contradictions: writeResult.contradictions.map((conflict) => conflict.contradictionPath),
        // Stored so a paused-then-resumed run reassembles the full report
        // without re-executing finished steps.
        artifact_section: execution.parsed.artifactSection,
      };
      await this.updateWorkflowRun(job.account_id, runId, {
        current_step: step.id,
        step_state: stepState,
      });

      // Step boundary emission: the run card ticks, and each written variable
      // materializes under /variables — through the card's per-step
      // presentation hints when declared (workflows are data; so is their
      // rendering), with VariableCard as the universal fallback.
      const stepMessages: A2uiMessage[] = [
        updateDataModel(surfaceId, `/run/steps/${index}/status`, "completed"),
        ...writes.map((write) =>
          updateDataModel(surfaceId, `/variables/${pointerSegment(write.path)}`, {
            path: write.path,
            value: write.value,
            confidence: write.confidence,
          }),
        ),
      ];
      const hintByPath = new Map(
        (step.presentation ?? []).map((hint) => [declaredPathForKey(card, hint.bind), hint]),
      );
      const stepComponents = writes
        .filter((write) => !write.path.startsWith("contradiction."))
        .map((write): A2uiComponent => {
          const pointer = `/variables/${pointerSegment(write.path)}`;
          const hint = hintByPath.get(write.path);
          if (hint) {
            return {
              id: `var-${write.path}`,
              component: { [hint.component]: { ...(hint.props ?? {}), path: pointer } },
            };
          }
          return {
            id: `var-${write.path}`,
            component: { VariableCard: { path: pointer, editable: true } },
          };
        });
      if (stepComponents.length > 0) stepMessages.push(updateComponents(surfaceId, stepComponents));
      await this.emit(job, threadId, runId, stepMessages);
    }

    const confidence = workflowConfidence(priorVariables);
    const frontmatter: WorkflowFrontmatter = {
      workflow: card.id,
      version: String(card.version),
      business: scope.activeContextId,
      run_date: new Date().toISOString().slice(0, 10),
      produces: card.produces_variables.map(normalizeDeclaredPath),
      consumed: unique([...consumed]),
      confidence,
    };
    const artifactBody = postprocessWorkflowArtifact(artifactSections.join("\n\n---\n\n").trim());
    const bodyMd = `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n\n${artifactBody}\n`;
    const artifactId = await this.insertArtifact(job.account_id, runId, card, bodyMd, frontmatter);

    await this.updateWorkflowRun(job.account_id, runId, {
      status: "completed",
      current_step: null,
      artifact_id: artifactId,
      error: null,
      finished_at: new Date().toISOString(),
      step_state: stepState,
    });
    await this.emit(job, threadId, runId, [
      updateDataModel(surfaceId, "/run/status", "completed"),
      updateDataModel(surfaceId, "/run/artifactTitle", card.name),
      updateDataModel(surfaceId, "/run/artifactId", artifactId),
      updateDataModel(surfaceId, "/run/confidence", confidence),
    ]);
    await this.completeAgentRun(job, card, artifactId, totals);
    await this.enqueueSynthesisSweep(job, runId, threadId);
  }

  /**
   * AT-6: a completed run is a write burst — chain the synthesis sweep.
   * Log-and-continue: the workflow result stands even if the chain fails.
   */
  private async enqueueSynthesisSweep(job: AgentJob, runId: string, threadId: string | null): Promise<void> {
    try {
      let agentProfileId: string | null = null;
      if (job.agent_run_id) {
        const { data } = await this.deps.client
          .from("agent_runs")
          .select("agent_profile_id")
          .eq("id", job.agent_run_id)
          .eq("account_id", job.account_id)
          .maybeSingle();
        agentProfileId = (data?.agent_profile_id as string | undefined) ?? null;
      }
      const nowIso = new Date().toISOString();
      let chainedRunId: string | null = null;
      if (agentProfileId) {
        const { data, error } = await this.deps.client
          .from("agent_runs")
          .insert({
            account_id: job.account_id,
            agent_profile_id: agentProfileId,
            run_type: "synthesis_sweep",
            trigger_type: "cascade",
            status: "pending",
            input: { workflow_run_id: runId, chained_from_run_id: job.agent_run_id },
            started_at: nowIso,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        chainedRunId = data.id as string;
      }
      const { error: jobError } = await this.deps.client.from("agent_jobs").insert({
        account_id: job.account_id,
        kind: "synthesis_sweep",
        payload: { workflow_run_id: runId, thread_id: threadId },
        status: "queued",
        agent_run_id: chainedRunId,
        run_after: nowIso,
      });
      if (jobError) throw new Error(jobError.message);
    } catch (error) {
      console.error(`[synthesis] chain enqueue failed for run ${runId}: ${humanError(error)}`);
    }
  }

  /**
   * Pause the run for user input: persist state, mark the durable run
   * `awaiting_input`, render the questions, and finish this job cleanly.
   * The resume job (enqueued by the chat when answers land) picks up here.
   */
  private async pauseForInput(
    job: AgentJob,
    runId: string,
    card: LoadedWorkflowCard,
    threadId: string | null,
    stepId: string,
    stepIndex: number,
    missingAsks: Array<{ slot: string; question: string; mode?: "text" | "chips"; options?: string[] }>,
    stepState: Record<string, unknown>,
  ): Promise<void> {
    await this.updateWorkflowRun(job.account_id, runId, {
      status: "awaiting_input",
      current_step: stepId,
      step_state: stepState,
    });
    const surfaceId = surfaceIdForRun(runId);
    await this.emit(job, threadId, runId, [
      updateComponents(surfaceId, missingAsks.map((ask): A2uiComponent => ({
        id: `ask-${ask.slot}`,
        component: {
          [ask.mode === "chips" && (ask.options?.length ?? 0) > 0 ? "ChoiceChips" : "GapPrompt"]: {
            slot: ask.slot,
            question: ask.question,
            mode: ask.mode ?? "text",
            ...(ask.options ? { options: ask.options } : {}),
          },
        },
      }))),
      updateDataModel(surfaceId, "/run/status", "awaiting_input"),
      updateDataModel(surfaceId, `/run/steps/${stepIndex}/status`, "awaiting"),
    ]);
    if (job.agent_run_id) {
      const { error } = await this.deps.client
        .from("agent_runs")
        .update({
          status: "completed",
          summary: `${card.name} paused — waiting for your answer`,
          output: { workflow_id: card.id, workflow_run_id: runId, awaiting_input: missingAsks.map((ask) => ask.slot) },
          completed_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", job.agent_run_id)
        .eq("account_id", job.account_id);
      if (error) throw new Error(`Failed to mark paused workflow job: ${error.message}`);
    }
  }

  /** Non-fatal by contract — chat emission never fails the run (a2ui.ts logs). */
  private async emit(job: AgentJob, threadId: string | null, runId: string, messages: A2uiMessage[]): Promise<void> {
    if (!threadId) return;
    await emitA2ui(this.deps.client, {
      threadId,
      agentRunId: job.agent_run_id,
      surfaceId: surfaceIdForRun(runId),
      messages,
    });
  }

  private async runValidatedStep(
    job: AgentJob,
    card: LoadedWorkflowCard,
    step: WorkflowStep,
    route: ModelRoute,
    prompt: string,
  ): Promise<StepExecution> {
    const validator = card.validators.get(step.id);
    if (!validator) throw new Error(`No variables validator compiled for ${card.id}/${step.id}`);

    let currentPrompt = prompt;
    let lastReason = "unknown validation error";
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await this.runnerForRoute(route).run({
        model: route.model_name,
        modelParams: route.params ?? undefined,
        maxTurns: 12,
        maxBudgetUsd: budgetForRoute(route, requiresTools(card, step)),
        prompt: currentPrompt,
        systemPrompt: replaceToken(
          replaceToken(
            replaceToken(card.system_preamble, "{N}", String(card.steps.indexOf(step) + 1)),
            "{compact canvas: segments, value prop, features, known competitors, stage}",
            "See <canvas_snapshot> in the user prompt.",
          ),
          "{JSON variables emitted by completed steps only — never full artifacts}",
          "See <prior_step_variables> in the user prompt.",
        ),
        mcpServers: toolServerForStep(this.deps, job, card, step),
        allowedTools: allowedToolsForStep(card, step),
        hooks: createAgentHooks({ accountId: job.account_id, agentRunId: job.agent_run_id, jobKind: job.kind }),
      });

      const parsed = parseDualOutput(result.resultText);
      if (parsed.ok && validator(parsed.value.variables)) {
        return { parsed: parsed.value, result, attempts: attempt };
      }

      if (parsed.ok) {
        lastReason = (validator.errors ?? [])
          .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
          .join("; ");
      } else if ("error" in parsed) {
        lastReason = parsed.error;
      }
      if (attempt === 1) {
        currentPrompt = `${prompt}\n\nVALIDATION RETRY: Your previous VARIABLES block was invalid: ${lastReason}. Return the full ARTIFACT SECTION again, followed by one final fenced JSON VARIABLES block that matches the schema exactly.`;
      }
    }
    throw new Error(`Workflow ${card.id} failed visibly at step ${step.id} after one validation retry: ${lastReason}`);
  }

  private runnerForRoute(route: ModelRoute): AgentRunner {
    if (this.deps.runner) return this.deps.runner;
    return route.provider === "openrouter"
      ? new OpenRouterChatRunner(this.deps.openRouterApiKey)
      : this.defaultRunner;
  }

  private async loadModelRoute(accountId: string): Promise<ModelRoute> {
    const { data, error } = await this.deps.client
      .from("model_routes")
      .select("account_id, route_key, task_class, provider, model_name, params, cost_per_1k_in, cost_per_1k_out")
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .or("task_class.eq.workflow_run,task_class.eq.skill_run,task_class.eq.workspace_chat,route_key.eq.workflow_run")
      .order("account_id", { ascending: false, nullsFirst: false });
    if (error) throw new Error(`Failed to load workflow model route: ${error.message}`);
    const routes = (data ?? []) as ModelRoute[];
    const route = chooseModelRoute(routes, accountId, "workflow_run", "workflow_run")
      ?? chooseModelRoute(routes, accountId, "workflow_run", "skill_run")
      ?? chooseModelRoute(routes, accountId, "workflow_run", "workspace_chat");
    if (!route) throw new Error("No model route configured for workflow_run (or skill_run/workspace_chat fallback)");
    return route;
  }

  private async ensureWorkflowRun(job: AgentJob, card: LoadedWorkflowCard, threadId: string | null, requestedId?: string): Promise<string> {
    if (requestedId) {
      const { data, error } = await this.deps.client
        .from("workflow_runs")
        .select("id, workflow_id, status")
        .eq("id", requestedId)
        .eq("account_id", job.account_id)
        .maybeSingle();
      if (error) throw new Error(`Failed to load workflow run: ${error.message}`);
      if (!data || data.workflow_id !== card.id) throw new Error("workflow_run_id does not match this account and workflow");
      // Double-resume guard: a duplicate resume against a finished run would
      // re-execute remaining steps and write a duplicate artifact.
      if (data.status === "completed") throw new Error("This workflow run already completed — nothing to resume.");
      return requestedId;
    }

    // A queue retry re-enters with the same agent_run_id: reuse the durable
    // run (and thus its chat surface) instead of minting a new failed card
    // per attempt — live incident 2026-07-13 left three cards in one thread.
    if (job.agent_run_id) {
      const { data: existing, error: existingError } = await this.deps.client
        .from("workflow_runs")
        .select("id")
        .eq("account_id", job.account_id)
        .eq("workflow_id", card.id)
        .eq("agent_run_id", job.agent_run_id)
        .maybeSingle();
      if (existingError) throw new Error(`Failed to load workflow run for retry: ${existingError.message}`);
      if (existing) {
        await this.updateWorkflowRun(job.account_id, existing.id as string, {
          status: "queued",
          current_step: null,
          error: null,
          finished_at: null,
          step_state: {},
          thread_id: threadId,
        });
        return existing.id as string;
      }
    }

    const { data, error } = await this.deps.client
      .from("workflow_runs")
      .insert({
        account_id: job.account_id,
        workflow_id: card.id,
        status: "queued",
        step_state: {},
        agent_run_id: job.agent_run_id,
        thread_id: threadId,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to create workflow run: ${error?.message ?? "no row returned"}`);
    return data.id as string;
  }

  private async markRunning(job: AgentJob, runId: string, card: LoadedWorkflowCard, route: ModelRoute): Promise<void> {
    await this.updateWorkflowRun(job.account_id, runId, {
      status: "running",
      started_at: new Date().toISOString(),
      error: null,
    });
    if (!job.agent_run_id) return;
    const { error } = await this.deps.client
      .from("agent_runs")
      .update({
        status: "running",
        run_type: "workflow_run",
        input: { workflow_id: card.id, workflow_run_id: runId },
        model_provider: route.provider,
        model_name: route.model_name,
        started_at: new Date().toISOString(),
      })
      .eq("id", job.agent_run_id)
      .eq("account_id", job.account_id);
    if (error) throw new Error(`Failed to mark agent run running: ${error.message}`);
  }

  private async insertArtifact(
    accountId: string,
    runId: string,
    card: LoadedWorkflowCard,
    bodyMd: string,
    frontmatter: WorkflowFrontmatter,
  ): Promise<string> {
    const { data, error } = await this.deps.client
      .from("workflow_artifacts")
      .insert({
        account_id: accountId,
        workflow_id: card.id,
        run_id: runId,
        title: card.name,
        body_md: bodyMd,
        frontmatter,
        stale: false,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to save workflow artifact: ${error?.message ?? "no row returned"}`);
    return data.id as string;
  }

  private async completeAgentRun(
    job: AgentJob,
    card: LoadedWorkflowCard,
    artifactId: string,
    totals: { tokensIn: number; tokensOut: number; costUsd: number },
  ): Promise<void> {
    if (!job.agent_run_id) return;
    const { error } = await this.deps.client
      .from("agent_runs")
      .update({
        status: "completed",
        output: { workflow_id: card.id, workflow_artifact_id: artifactId },
        summary: `${card.name} completed`,
        tokens_in: totals.tokensIn,
        tokens_out: totals.tokensOut,
        estimated_cost: totals.costUsd,
        completed_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", job.agent_run_id)
      .eq("account_id", job.account_id);
    if (error) throw new Error(`Failed to complete workflow agent run: ${error.message}`);
  }

  private async failWorkflowRun(accountId: string, runId: string, message: string): Promise<void> {
    const { error } = await this.deps.client
      .from("workflow_runs")
      .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
      .eq("id", runId)
      .eq("account_id", accountId);
    if (error) console.error(`[workflow] failed to persist visible failure for ${runId}: ${error.message}`);
  }

  private async updateWorkflowRun(accountId: string, runId: string, values: Record<string, unknown>): Promise<void> {
    const { error } = await this.deps.client
      .from("workflow_runs")
      .update(values)
      .eq("id", runId)
      .eq("account_id", accountId);
    if (error) throw new Error(`Failed to update workflow run: ${error.message}`);
  }
}

export function parseDualOutput(text: string): { ok: true; value: ParsedStepOutput } | { ok: false; error: string } {
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  const final = blocks.at(-1);
  if (!final || final.index === undefined) return { ok: false, error: "missing final fenced VARIABLES JSON block" };
  let variables: unknown;
  try {
    variables = JSON.parse(final[1].trim());
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${humanError(error)}` };
  }
  if (!isRecord(variables)) return { ok: false, error: "VARIABLES must be a JSON object" };
  const artifactSection = text.slice(0, final.index).replace(/\bVARIABLES\s*:\s*$/i, "").trim();
  if (!artifactSection) return { ok: false, error: "missing ARTIFACT SECTION markdown" };
  return { ok: true, value: { artifactSection, variables } };
}

function buildStepPrompt(
  card: LoadedWorkflowCard,
  step: WorkflowStep,
  index: number,
  snapshot: string,
  inputs: Map<string, BrainVariable>,
  priorVariables: Record<string, unknown>,
  missing: string[],
  askPaths: string[] = [],
): string {
  const declared = unique([
    ...[...card.inputs_required, ...card.inputs_optional].map(inputBrainPath).filter(isString),
    ...brainReads(step.reads),
    ...askPaths,
  ]);
  const values = Object.fromEntries(declared.flatMap((path) => {
    const variable = inputs.get(path);
    return variable ? [[path, { value: variable.value, confidence: variable.confidence, source: variable.source }]] : [];
  }));
  return `Run ${card.name}, step ${index + 1} of ${card.steps.length} (${step.id}).

<canvas_snapshot>
${snapshot}
</canvas_snapshot>

<declared_brain_inputs>
${JSON.stringify(values, null, 2)}
</declared_brain_inputs>

<prior_step_variables>
${JSON.stringify(priorVariables, null, 2)}
</prior_step_variables>

${missing.length > 0 ? `<missing_inputs handled per card>\n${missing.join(", ")}\n${card.missing_input_behavior}\n</missing_inputs>\n\n` : ""}${step.prompt}

Your FINAL output must contain the human-readable ARTIFACT SECTION first and exactly one fenced JSON block last. That final JSON object is the VARIABLES block and must satisfy this schema:
${JSON.stringify(step.variables_schema, null, 2)}`;
}

function variablesToWrites(card: LoadedWorkflowCard, variables: Record<string, unknown>) {
  const confidence = confidenceFromVariables(variables);
  return Object.entries(variables).flatMap(([key, value]) => {
    if (key === "contradictions") return [];
    const path = declaredPathForKey(card, key);
    return [{ path, value, confidence }];
  });
}

function declaredPathForKey(card: LoadedWorkflowCard, key: string): string {
  const declared = card.produces_variables;
  const normalizedKey = normalizeDeclaredPath(key);
  const exact = declared.map(normalizeDeclaredPath).find((path) => path === normalizedKey);
  if (exact) return exact;
  const byLeaf = declared.map(normalizeDeclaredPath).filter((path) => path.split(".").at(-1) === key);
  if (byLeaf.length === 1) return byLeaf[0];
  const namespaced = declared.find((path) => normalizeDeclaredPath(path).includes("."));
  return namespaced ? `${normalizeDeclaredPath(namespaced).split(".")[0]}.${key}` : key;
}

function normalizeDeclaredPath(path: string): string {
  return path.replace(/\[\]$/, "").replace(/\?$/, "");
}

function brainReads(reads: string[]): string[] {
  return reads
    .map(normalizeDeclaredPath)
    .filter((path) => path.startsWith("canvas.") || path.startsWith("positioning.") || path.startsWith("intel.") || path.startsWith("pricing.") || path.startsWith("risks."));
}

function inputBrainPath(path: string): string | null {
  const normalized = normalizeDeclaredPath(path);
  if (normalized.startsWith("artifact/")) return null;
  if (normalized.includes(".")) return normalized;
  const canvasAliases: Record<string, string> = {
    customer_segments: "customer_segments",
    value_proposition: "value_propositions",
    value_propositions: "value_propositions",
    revenue_streams: "revenue_streams",
    channels: "channels",
    key_features: "value_propositions",
  };
  return `canvas.${canvasAliases[normalized] ?? normalized}`;
}

function isString(value: string | null): value is string {
  return typeof value === "string";
}

function toolServerForStep(
  deps: WorkflowRunDependencies,
  job: AgentJob,
  card: LoadedWorkflowCard,
  step: WorkflowStep,
): Record<string, ReturnType<typeof createBmcServer>> {
  if (!requiresTools(card, step)) return {};
  return {
    bmc: createBmcServer(deps.client, {
      accountId: job.account_id,
      agentRunId: job.agent_run_id,
      ownSectionKey: "customer_segments",
      agentProfileId: "00000000-0000-0000-0000-000000000000",
      proposalMode: true,
      xaiApiKey: deps.xaiApiKey,
      xaiModel: deps.xaiModel,
      exaApiKey: deps.exaApiKey,
      firecrawlApiKey: deps.firecrawlApiKey,
      fredApiKey: deps.fredApiKey,
      googleTrendsApiKey: deps.googleTrendsApiKey,
      githubToken: deps.githubToken,
      secEdgarUserAgent: deps.secEdgarUserAgent,
    }),
  };
}

function allowedToolsForStep(card: LoadedWorkflowCard, step: WorkflowStep): string[] {
  if (!requiresTools(card, step)) return [];
  const tools: string[] = [];
  if (card.tools_allowed.includes("web_search")) tools.push("mcp__bmc__search_web");
  if (card.tools_allowed.includes("web_fetch") || card.tools_allowed.includes("firecrawl_scrape")) tools.push("mcp__bmc__firecrawl_scrape");
  return tools;
}

function requiresTools(card: LoadedWorkflowCard, step: WorkflowStep): boolean {
  const index = card.steps.indexOf(step);
  return card.tools_required_steps.some((required) => String(required) === step.id || Number(required) === index + 1);
}

function workflowConfidence(variables: Record<string, unknown>): BrainConfidence {
  const explicit = variables["positioning.confidence"] ?? variables["confidence"];
  if (explicit === "high" || explicit === "medium" || explicit === "low") return explicit;
  return "medium";
}

function confidenceFromVariables(variables: Record<string, unknown>): BrainConfidence {
  const value = variables.confidence;
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function allowsMissingInputs(behavior: string): boolean {
  return /full-research|if .* absent|if .* empty|flags? confidence|continue|assumption|hypothesis/i.test(behavior);
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function addUsage(
  totals: { tokensIn: number; tokensOut: number; costUsd: number },
  result: AgentRunResult,
) {
  return {
    tokensIn: totals.tokensIn + (result.tokensIn ?? 0),
    tokensOut: totals.tokensOut + (result.tokensOut ?? 0),
    costUsd: totals.costUsd + (result.costUsd ?? 0),
  };
}

/**
 * Live incident (first production run, 2026-07-13): the original
 * max(0.25, in*8 + out*4) formula assumed one ~8k-token call and killed the
 * web-research step at $0.25 (error_max_budget_usd) — a 12-turn research
 * loop accumulates far more input than a single call. Research steps now
 * budget like the briefing (~60k in / 8k out) with tool-payload headroom;
 * pure-reasoning steps stay tighter. These are CAPS, not spends.
 */
function budgetForRoute(route: ModelRoute, stepUsesTools: boolean): number {
  const input = route.cost_per_1k_in ?? 0.002;
  const output = route.cost_per_1k_out ?? 0.01;
  return stepUsesTools
    ? Math.max(2.5, input * 150 + output * 12)
    : Math.max(1.0, input * 40 + output * 8);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function humanError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function replaceToken(value: string, token: string, replacement: string): string {
  return value.split(token).join(replacement);
}
