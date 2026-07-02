import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentTaskLimits } from "../agent/limits.js";
import { createAgentHooks } from "../agent/guardrails.js";
import { ClaudeAgentRunner, type AgentRunner } from "../agent/runner.js";
import { asRecord } from "../db/json.js";
import { SECTION_LABELS, sectionKeyForAgentKey, type SectionKey } from "../domain/sections.js";
import type { AgentJob } from "../queue/types.js";
import { createBmcServer } from "../tools/bmc-tools.js";
import { chooseModelRoute } from "./canvas-section-analysis.js";

interface WorkspaceThread {
  id: string;
  account_id: string;
  agent_profile_id: string;
  title: string | null;
}

interface WorkspaceMessage {
  role: string;
  kind: string;
  content: unknown;
  created_at: string;
}

interface AgentProfile {
  id: string;
  agent_key: string;
  display_name: string | null;
  system_instructions: string | null;
  model_route_key: string | null;
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

export interface WorkspaceChatDependencies {
  client: SupabaseClient;
  runner?: AgentRunner;
  xaiApiKey?: string;
  firecrawlApiKey?: string;
  fredApiKey?: string;
  googleTrendsApiKey?: string;
  githubToken?: string;
  taskLimits?: AgentTaskLimits;
}

export class WorkspaceChatHandler {
  private readonly runner: AgentRunner;

  constructor(private readonly deps: WorkspaceChatDependencies) {
    this.runner = deps.runner ?? new ClaudeAgentRunner();
  }

  async handle(job: AgentJob): Promise<void> {
    const payload = asRecord(job.payload);
    const threadId = readString(payload.thread_id ?? payload.threadId, "workspace_chat payload requires thread_id");

    const thread = await this.loadThread(job.account_id, threadId);
    const profile = await this.loadProfile(job.account_id, thread.agent_profile_id);
    const modelRoute = await this.loadModelRoute(job.account_id, profile);
    const messages = await this.loadMessages(thread.id);
    const sectionKey = sectionKeyForAgentKey(profile.agent_key) ?? "value_propositions";

    await this.markRunRunning(job, profile, modelRoute, { threadId: thread.id, messageCount: messages.length });

    const limits = this.deps.taskLimits?.workspaceChat;
    const result = await this.runner.run({
      prompt: buildChatPrompt(messages),
      systemPrompt: buildChatSystemPrompt(profile, sectionKey),
      model: modelRoute.model_name,
      maxTurns: limits?.maxTurns ?? 40,
      maxBudgetUsd: limits?.maxBudgetUsd ?? budgetForRoute(modelRoute),
      taskBudgetTokens: limits?.taskBudgetTokens,
      mcpServers: {
        bmc: createBmcServer(this.deps.client, {
          accountId: job.account_id,
          agentRunId: job.agent_run_id,
          ownSectionKey: sectionKey,
          agentProfileId: profile.id,
          proposalMode: true,
          xaiApiKey: this.deps.xaiApiKey,
          firecrawlApiKey: this.deps.firecrawlApiKey,
          fredApiKey: this.deps.fredApiKey,
          googleTrendsApiKey: this.deps.googleTrendsApiKey,
          githubToken: this.deps.githubToken,
        }),
      },
      allowedTools: ["mcp__bmc__*"],
      hooks: createAgentHooks({
        accountId: job.account_id,
        agentRunId: job.agent_run_id,
        jobKind: job.kind,
      }),
    });

    const assistantText = result.resultText.trim();
    const { error: messageError } = await this.deps.client.from("workspace_messages").insert({
      thread_id: thread.id,
      role: "agent",
      kind: "text",
      content: { text: assistantText },
      agent_run_id: job.agent_run_id,
    });
    if (messageError) throw new Error(`Failed to write workspace agent message: ${messageError.message}`);

    const estimatedCost = result.costUsd ?? estimateCost(result.tokensIn, result.tokensOut, modelRoute);
    if (job.agent_run_id) {
      const { error } = await this.deps.client
        .from("agent_runs")
        .update({
          status: "completed",
          output: { text: assistantText },
          summary: summarize(assistantText),
          model_provider: modelRoute.provider,
          model_name: modelRoute.model_name,
          tokens_in: result.tokensIn,
          tokens_out: result.tokensOut,
          estimated_cost: estimatedCost,
          completed_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", job.agent_run_id)
        .eq("account_id", job.account_id);
      if (error) throw new Error(`Failed to complete workspace chat run: ${error.message}`);
    }
  }

  private async loadThread(accountId: string, threadId: string): Promise<WorkspaceThread> {
    const { data, error } = await this.deps.client
      .from("workspace_threads")
      .select("id, account_id, agent_profile_id, title")
      .eq("id", threadId)
      .eq("account_id", accountId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load workspace thread: ${error.message}`);
    if (!data) throw new Error("Workspace thread not found for job account");
    return data as WorkspaceThread;
  }

  private async loadProfile(accountId: string, profileId: string): Promise<AgentProfile> {
    const { data, error } = await this.deps.client
      .from("agent_profiles")
      .select("id, agent_key, display_name, system_instructions, model_route_key")
      .eq("id", profileId)
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .maybeSingle();
    if (error) throw new Error(`Failed to load workspace agent profile: ${error.message}`);
    if (!data) throw new Error("Workspace agent profile not found for job account");
    return data as AgentProfile;
  }

  private async loadModelRoute(accountId: string, profile: AgentProfile): Promise<ModelRoute> {
    const routeKey = profile.model_route_key ?? "section_analysis";
    const { data, error } = await this.deps.client
      .from("model_routes")
      .select("account_id, route_key, task_class, provider, model_name, cost_per_1k_in, cost_per_1k_out")
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .or(`task_class.eq.workspace_chat,task_class.eq.section_analysis,route_key.eq.${routeKey}`)
      .order("account_id", { ascending: false, nullsFirst: false });
    if (error) throw new Error(`Failed to load workspace chat model route: ${error.message}`);
    const route = chooseModelRoute((data ?? []) as ModelRoute[], accountId, routeKey, "workspace_chat")
      ?? chooseModelRoute((data ?? []) as ModelRoute[], accountId, routeKey, "section_analysis");
    if (!route) throw new Error("No model route configured for workspace_chat");
    return route;
  }

  private async loadMessages(threadId: string): Promise<WorkspaceMessage[]> {
    const { data, error } = await this.deps.client
      .from("workspace_messages")
      .select("role, kind, content, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(30);
    if (error) throw new Error(`Failed to load workspace messages: ${error.message}`);
    return (data ?? []) as WorkspaceMessage[];
  }

  private async markRunRunning(job: AgentJob, profile: AgentProfile, modelRoute: ModelRoute, input: Record<string, unknown>): Promise<void> {
    if (!job.agent_run_id) return;
    const { error } = await this.deps.client
      .from("agent_runs")
      .update({
        status: "running",
        agent_profile_id: profile.id,
        run_type: "workspace_chat",
        input,
        model_provider: modelRoute.provider,
        model_name: modelRoute.model_name,
        started_at: new Date().toISOString(),
      })
      .eq("id", job.agent_run_id)
      .eq("account_id", job.account_id);
    if (error) throw new Error(`Failed to mark workspace chat run running: ${error.message}`);
  }
}

function readString(value: unknown, message: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(message);
}

function buildChatSystemPrompt(profile: AgentProfile, sectionKey: SectionKey): string {
  const sectionLabel = SECTION_LABELS[sectionKey];
  const base = profile.system_instructions?.trim() || `You are ${profile.display_name ?? profile.agent_key}, a strategy workspace agent for ${sectionLabel}.`;
  return `${base}

You are replying in a workspace chat. Be concise, practical, and cite uncertainty. Use tools for account data instead of inventing facts. If you propose canvas changes, use proposal-mode tool calls rather than claiming changes were applied.`;
}

function buildChatPrompt(messages: WorkspaceMessage[]): string {
  const transcript = messages.map((message) => `${message.role}: ${messageText(message.content)}`).join("\n");
  return `Continue this workspace chat. Answer the latest user message and preserve context.\n\n${transcript}`;
}

function messageText(content: unknown): string {
  const record = asRecord(content);
  if (typeof record.text === "string") return record.text;
  return JSON.stringify(content);
}

function budgetForRoute(route: ModelRoute): number {
  const input = route.cost_per_1k_in ?? 0.002;
  const output = route.cost_per_1k_out ?? 0.01;
  return Math.max(0.05, input * 12 + output * 6);
}

function estimateCost(tokensIn: number | null, tokensOut: number | null, route: ModelRoute): number | null {
  if (tokensIn === null && tokensOut === null) return null;
  const inputCost = ((tokensIn ?? 0) / 1000) * (route.cost_per_1k_in ?? 0);
  const outputCost = ((tokensOut ?? 0) / 1000) * (route.cost_per_1k_out ?? 0);
  return Math.round((inputCost + outputCost) * 10000) / 10000;
}

function summarize(text: string): string {
  return text.length <= 160 ? text : `${text.slice(0, 157)}...`;
}
