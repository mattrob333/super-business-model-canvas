import type { SupabaseClient } from "@supabase/supabase-js";
import { ClaudeAgentRunner, type AgentRunner } from "../agent/runner.js";
import { asRecord, asStringArray } from "../db/json.js";
import { buildSystemPrompt, buildUserPrompt, parseLegacySectionAnalysis } from "../domain/legacy-output.js";
import { isSectionKey, SECTION_AGENT_KEYS, SECTION_LABELS, type SectionKey } from "../domain/sections.js";
import type { AgentJob } from "../queue/types.js";
import { createBmcServer } from "../tools/bmc-tools.js";

interface AgentProfile {
  id: string;
  agent_key: string;
  system_instructions: string | null;
  model_route_key: string | null;
}

interface ModelRoute {
  provider: string;
  model_name: string;
  cost_per_1k_in: number | null;
  cost_per_1k_out: number | null;
}

interface BusinessContext {
  company_name?: string;
  industry?: string;
}

export interface CanvasSectionAnalysisDependencies {
  client: SupabaseClient;
  runner?: AgentRunner;
  xaiApiKey?: string;
  firecrawlApiKey?: string;
}

export class CanvasSectionAnalysisHandler {
  private readonly runner: AgentRunner;

  constructor(private readonly deps: CanvasSectionAnalysisDependencies) {
    this.runner = deps.runner ?? new ClaudeAgentRunner();
  }

  async handle(job: AgentJob): Promise<void> {
    const payload = asRecord(job.payload);
    const sectionKey = readSectionKey(payload);
    const sectionLabel = SECTION_LABELS[sectionKey];
    const agentKey = SECTION_AGENT_KEYS[sectionKey];

    const profile = await this.loadProfile(job.account_id, payload, agentKey);
    const modelRoute = await this.loadModelRoute(job.account_id, profile);
    const businessContext = await this.loadBusinessContext(job.account_id, payload);
    const existingItems = await this.loadExistingItems(job.account_id, sectionKey, payload);

    const systemPrompt = buildSystemPrompt(profile.agent_key, sectionLabel, profile.system_instructions);
    const userPrompt = buildUserPrompt({
      sectionLabel,
      existingItems,
      companyName: businessContext.company_name,
      industry: businessContext.industry,
    });

    await this.markRunRunning(job, profile, modelRoute, { sectionKey, sectionLabel, existingItems });

    const mcpServer = createBmcServer(this.deps.client, {
      accountId: job.account_id,
      agentRunId: job.agent_run_id,
      ownSectionKey: sectionKey,
      agentProfileId: profile.id,
      proposalMode: true,
      xaiApiKey: this.deps.xaiApiKey,
      firecrawlApiKey: this.deps.firecrawlApiKey,
    });

    const agentResult = await this.runner.run({
      prompt: userPrompt,
      systemPrompt,
      model: modelRoute.model_name,
      maxTurns: 40,
      maxBudgetUsd: budgetForRoute(modelRoute),
      mcpServers: { bmc: mcpServer },
      allowedTools: ["mcp__bmc__*"],
    });

    const parsed = parseLegacySectionAnalysis(agentResult.resultText);
    const estimatedCost = agentResult.costUsd ?? estimateCost(agentResult.tokensIn, agentResult.tokensOut, modelRoute);

    if (job.agent_run_id) {
      const { error } = await this.deps.client
        .from("agent_runs")
        .update({
          status: "completed",
          output: parsed,
          summary: parsed.summary,
          model_provider: modelRoute.provider,
          model_name: modelRoute.model_name,
          tokens_in: agentResult.tokensIn,
          tokens_out: agentResult.tokensOut,
          estimated_cost: estimatedCost,
          completed_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", job.agent_run_id)
        .eq("account_id", job.account_id);
      if (error) throw new Error(`Failed to complete agent run: ${error.message}`);
    }
  }

  private async loadProfile(accountId: string, payload: Record<string, unknown>, agentKey: string): Promise<AgentProfile> {
    const profileId = typeof payload.agentProfileId === "string" ? payload.agentProfileId : null;
    let query = this.deps.client
      .from("agent_profiles")
      .select("id, agent_key, system_instructions, model_route_key")
      .or(`account_id.eq.${accountId},account_id.is.null`);

    query = profileId ? query.eq("id", profileId) : query.eq("agent_key", agentKey);
    const { data, error } = await query.order("account_id", { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
    if (error) throw new Error(`Failed to load agent profile: ${error.message}`);
    if (!data) throw new Error(`Agent profile not found for account ${accountId}`);
    return data as AgentProfile;
  }

  private async loadModelRoute(accountId: string, profile: AgentProfile): Promise<ModelRoute> {
    const routeKey = profile.model_route_key ?? "section_analysis";
    const { data, error } = await this.deps.client
      .from("model_routes")
      .select("provider, model_name, cost_per_1k_in, cost_per_1k_out")
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .or(`task_class.eq.section_analysis,route_key.eq.${routeKey}`)
      .order("account_id", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to load model route: ${error.message}`);
    if (!data) throw new Error("No model route configured for section_analysis");
    return data as ModelRoute;
  }

  private async loadBusinessContext(accountId: string, payload: Record<string, unknown>): Promise<BusinessContext> {
    const contextId = typeof payload.businessContextVersionId === "string" ? payload.businessContextVersionId : null;
    let query = this.deps.client
      .from("business_context_versions")
      .select("company_name, industry")
      .eq("account_id", accountId);

    query = contextId ? query.eq("id", contextId) : query.order("created_at", { ascending: false });
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw new Error(`Failed to load business context: ${error.message}`);
    return (data ?? {}) as BusinessContext;
  }

  private async loadExistingItems(accountId: string, sectionKey: SectionKey, payload: Record<string, unknown>): Promise<string[]> {
    const payloadItems = asStringArray(payload.existing_items);
    if (payloadItems.length > 0) return payloadItems;

    const { data, error } = await this.deps.client
      .from("canvas_section_versions")
      .select("items")
      .eq("account_id", accountId)
      .eq("section_key", sectionKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to load existing canvas items: ${error.message}`);
    return normalizeItems(data?.items);
  }

  private async markRunRunning(
    job: AgentJob,
    profile: AgentProfile,
    modelRoute: ModelRoute,
    input: Record<string, unknown>,
  ): Promise<void> {
    if (!job.agent_run_id) return;
    const { error } = await this.deps.client
      .from("agent_runs")
      .update({
        status: "running",
        agent_profile_id: profile.id,
        run_type: "canvas_section_analysis",
        input,
        model_provider: modelRoute.provider,
        model_name: modelRoute.model_name,
        started_at: new Date().toISOString(),
      })
      .eq("id", job.agent_run_id)
      .eq("account_id", job.account_id);
    if (error) throw new Error(`Failed to mark agent run running: ${error.message}`);
  }
}

function readSectionKey(payload: Record<string, unknown>): SectionKey {
  const raw = payload.section_key ?? payload.sectionKey;
  if (!isSectionKey(raw)) throw new Error("canvas_section_analysis payload requires a valid section_key");
  return raw;
}

function normalizeItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      const record = asRecord(item);
      return typeof record.text === "string" ? record.text : null;
    })
    .filter((item): item is string => Boolean(item));
}

function budgetForRoute(route: ModelRoute): number {
  const input = route.cost_per_1k_in ?? 0.002;
  const output = route.cost_per_1k_out ?? 0.01;
  return Math.max(0.05, input * 16 + output * 8);
}

function estimateCost(tokensIn: number | null, tokensOut: number | null, route: ModelRoute): number | null {
  if (tokensIn === null && tokensOut === null) return null;
  const inputCost = ((tokensIn ?? 0) / 1000) * (route.cost_per_1k_in ?? 0);
  const outputCost = ((tokensOut ?? 0) / 1000) * (route.cost_per_1k_out ?? 0);
  return Math.round((inputCost + outputCost) * 10000) / 10000;
}
