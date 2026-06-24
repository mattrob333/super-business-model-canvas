/**
 * HermesAgentRuntime — live agent runtime implementation.
 *
 * When VITE_HERMES_RUNTIME_ENDPOINT is configured, this class calls the
 * Supabase Edge Function `agent-run` to execute real LLM-backed analysis.
 * The browser NEVER calls the LLM directly — it goes through the edge
 * function, which is the "backend" that calls Hermes/LLM providers.
 *
 * Guardrail: "Hermes is the agent runtime, not the backend."
 * Guardrail: "Every agent run produces a durable record in agent_runs."
 *
 * Flow:
 *   1. startRun() — creates agent_runs record (pending), then calls edge function
 *   2. Edge function executes LLM call, returns structured result
 *   3. On success: updates agent_runs with output, tokens, cost (completed)
 *   4. On failure: updates agent_runs with error (failed)
 *
 * Unlike MockAgentRuntime (which uses setTimeout to simulate async), this
 * implementation awaits the edge function call and resolves when the LLM
 * has actually completed.
 */

import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import type {
  AgentRuntime,
  AgentRunStatus,
  RunStatus,
  RunOutput,
  RuntimeConfig,
  StartRunInput,
} from "./index";
import { DEFAULT_RUNTIME_CONFIG } from "./index";
import { getRuntimeEndpoint, getRuntimeApiKey } from "./config";
import { resolveModelRoute } from "./model-routing";

export class HermesAgentRuntime implements AgentRuntime {
  private config: RuntimeConfig = { ...DEFAULT_RUNTIME_CONFIG };
  private endpoint: string;
  private apiKey: string | null;

  constructor(private runtimeAccountId?: string) {
    const endpoint = getRuntimeEndpoint();
    if (!endpoint) {
      throw new Error(
        "HermesAgentRuntime requires VITE_HERMES_RUNTIME_ENDPOINT to be set."
      );
    }
    this.endpoint = endpoint;
    this.apiKey = getRuntimeApiKey();
  }

  async startRun(
    input: StartRunInput
  ): Promise<{ runId: string; status: AgentRunStatus }> {
    // Resolve model routing early so the agent_runs record has the correct provider
    let resolvedProvider = input.modelProvider;
    let resolvedModelName = input.modelName;

    if (!resolvedProvider) {
      const { data: profile } = await supabase
        .from("agent_profiles")
        .select("model_route_key")
        .eq("id", input.agentProfileId)
        .maybeSingle();

      const routeKey = (profile as { model_route_key: string | null } | null)?.model_route_key;
      const resolved = resolveModelRoute(routeKey);
      if (resolved) {
        resolvedProvider = resolved.provider;
        resolvedModelName = resolved.modelName;
      }
    }

    // Step 1: Create durable agent_runs record
    const { data, error } = await supabase
      .from("agent_runs")
      .insert({
        account_id: input.accountId,
        agent_profile_id: input.agentProfileId,
        run_type: input.runType,
        trigger_type: input.triggerType,
        triggered_by: input.triggeredBy,
        status: "pending" as AgentRunStatus,
        input: input.input,
        model_provider: resolvedProvider ?? null,
        model_name: resolvedModelName ?? null,
        started_at: new Date().toISOString(),
      })
      .select("id, status")
      .single();

    if (error) throw new Error(`Failed to create agent run: ${error.message}`);

    const runId = (data as { id: string }).id;
    const runStatus = (data as { status: AgentRunStatus }).status;

    // Step 2: Mark as running
    await supabase
      .from("agent_runs")
      .update({ status: "running" as AgentRunStatus })
      .eq("id", runId);

    // Step 3: Call the edge function (non-blocking — fire and forget)
    // The edge function call happens in background; the UI polls for status
    // Pass resolved provider/model through to executeRun
    void this.executeRun(runId, {
      ...input,
      modelProvider: resolvedProvider,
      modelName: resolvedModelName,
    });

    return { runId, status: runStatus };
  }

  /**
   * Execute the actual LLM call via the edge function.
   * Updates the agent_runs record on completion or failure.
   */
  private async executeRun(runId: string, input: StartRunInput): Promise<void> {
    try {
      // Provider/model are resolved in startRun() via model routing —
      // input.modelProvider/modelName now contain the resolved values
      // (or undefined, meaning the edge function should auto-detect)
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Attach auth — use Supabase session token if available
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      } else if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          agentProfileId: input.agentProfileId,
          accountId: input.accountId,
          runType: input.runType,
          triggerType: input.triggerType,
          triggeredBy: input.triggeredBy,
          input: input.input,
          modelProvider: input.modelProvider,
          modelName: input.modelName,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Edge function error ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Agent execution failed");
      }

      const result = data.result;

      // Step 4: Update agent_runs with the result
      await supabase
        .from("agent_runs")
        .update({
          status: "completed" as AgentRunStatus,
          completed_at: new Date().toISOString(),
          output: {
            items: result.items,
            notes: result.notes,
            confidence: result.confidence,
            summary: result.summary,
          },
          summary: result.summary,
          tokens_in: result.tokensIn,
          tokens_out: result.tokensOut,
          estimated_cost: result.estimatedCost,
          model_provider: result.modelProvider,
          model_name: result.modelName,
        })
        .eq("id", runId);
    } catch (err) {
      // Update agent_runs with the error
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      await supabase
        .from("agent_runs")
        .update({
          status: "failed" as AgentRunStatus,
          completed_at: new Date().toISOString(),
          error: errorMessage,
          summary: `Run failed: ${errorMessage}`,
        })
        .eq("id", runId);
    }
  }

  async cancelRun(
    runId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const { error } = await supabase
        .from("agent_runs")
        .update({
          status: "cancelled" as AgentRunStatus,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      if (error) throw error;

      return { success: true, message: "Run cancelled successfully." };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async getRunStatus(runId: string): Promise<RunStatus | null> {
    const { data, error } = await supabase
      .from("agent_runs")
      .select("id, status, started_at, completed_at, error, summary")
      .eq("id", runId)
      .maybeSingle();

    if (error || !data) return null;
    return data as unknown as RunStatus;
  }

  async getRunOutput(runId: string): Promise<RunOutput | null> {
    const { data, error } = await supabase
      .from("agent_runs")
      .select(
        "id, status, output, summary, tokens_in, tokens_out, estimated_cost, model_provider, model_name"
      )
      .eq("id", runId)
      .maybeSingle();

    if (error || !data) return null;
    return data as unknown as RunOutput;
  }

  getConfig(): RuntimeConfig {
    return { ...this.config };
  }

  async updateConfig(
    config: Partial<RuntimeConfig>
  ): Promise<{ success: boolean }> {
    this.config = { ...this.config, ...config };
    return { success: true };
  }

  async getActiveRunCount(): Promise<number> {
    if (!this.runtimeAccountId) return 0;

    const { count, error } = await supabase
      .from("agent_runs")
      .select("*", { count: "exact", head: true })
      .eq("account_id", this.runtimeAccountId)
      .in("status", ["pending", "running"]);

    if (error || count === null) return 0;
    return count;
  }
}
