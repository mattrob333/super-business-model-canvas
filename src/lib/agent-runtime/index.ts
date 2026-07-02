/**
 * AgentRuntime Interface Boundary
 *
 * This module defines the abstraction layer between the Enterprise Strategy
 * Workspace application and the Hermes agent runtime. The app NEVER calls
 * Hermes directly — it goes through this interface.
 *
 * Guardrail: "Hermes is the agent runtime, not the backend. Create
 * AgentRuntime interface boundary in src/lib/agent-runtime/."
 *
 * The interface supports:
 * - Starting agent runs (with durable records in agent_runs table)
 * - Cancelling in-progress runs
 * - Polling run status
 * - Retrieving run output
 *
 * Implementations:
 * - MockAgentRuntime: for development without a live Hermes instance
 * - HermesAgentRuntime: connects to a real Hermes instance (future)
 */

import type { Database, Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AgentRunStatus = Database["public"]["Enums"]["agent_run_status"];
export type AgentRunTrigger = Database["public"]["Enums"]["agent_run_trigger"];

export interface StartRunInput {
  agentProfileId: string;
  accountId: string;
  runType: string;
  triggerType: AgentRunTrigger;
  triggeredBy: string | null;
  input: Record<string, unknown>;
  modelProvider?: string;
  modelName?: string;
}

export interface RunStatus {
  id: string;
  status: AgentRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  summary: string | null;
}

export interface RunOutput {
  id: string;
  status: AgentRunStatus;
  output: Record<string, unknown> | null;
  summary: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  estimatedCost: number | null;
  modelProvider: string | null;
  modelName: string | null;
}

export interface RuntimeConfig {
  maxConcurrentRuns: number;
  executionTimeoutMinutes: number;
  loggingVerbosity: "minimal" | "normal" | "verbose";
  agentLifecyclePolicy: "stop_on_failure" | "restart_on_failure" | "continue_on_failure";
  sandboxEnabled: boolean;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  maxConcurrentRuns: 3,
  executionTimeoutMinutes: 30,
  loggingVerbosity: "normal",
  agentLifecyclePolicy: "stop_on_failure",
  sandboxEnabled: true,
};

// ─── Interface ──────────────────────────────────────────────────────────────

export interface AgentRuntime {
  /** Start a new agent run. Creates a durable record in agent_runs. */
  startRun(input: StartRunInput): Promise<{ runId: string; status: AgentRunStatus }>;

  /** Cancel an in-progress run. */
  cancelRun(runId: string): Promise<{ success: boolean; message: string }>;

  /** Get the current status of a run. */
  getRunStatus(runId: string): Promise<RunStatus | null>;

  /** Get the output of a completed run. */
  getRunOutput(runId: string): Promise<RunOutput | null>;

  /** Get the current runtime configuration. */
  getConfig(): RuntimeConfig;

  /** Update the runtime configuration. */
  updateConfig(config: Partial<RuntimeConfig>): Promise<{ success: boolean }>;

  /** Get the count of currently running agents. */
  getActiveRunCount(): Promise<number>;

  /** Check runtime health/connectivity. Returns status + message. */
  healthCheck(): Promise<{ healthy: boolean; message: string; latencyMs?: number }>;
}

// ─── Mock Implementation ────────────────────────────────────────────────────

/**
 * MockAgentRuntime — for development without a live Hermes instance.
 *
 * Creates real agent_runs records in the database (so the Activity page
 * shows them), but does not execute any actual AI work. Runs transition
 * from pending → running → completed with mock output.
 */
export class MockAgentRuntime implements AgentRuntime {
  private config: RuntimeConfig = { ...DEFAULT_RUNTIME_CONFIG };

  constructor(private runtimeAccountId?: string) {}

  async startRun(
    input: StartRunInput
  ): Promise<{ runId: string; status: AgentRunStatus }> {
    const { data, error } = await supabase
      .from("agent_runs")
      .insert({
        account_id: input.accountId,
        agent_profile_id: input.agentProfileId,
        run_type: input.runType,
        trigger_type: input.triggerType,
        triggered_by: input.triggeredBy,
        status: "pending",
        input: input.input as Json,
        model_provider: input.modelProvider ?? null,
        model_name: input.modelName ?? null,
        started_at: new Date().toISOString(),
      })
      .select("id, status")
      .single();

    if (error) throw new Error(`Failed to create agent run: ${error.message}`);

    // Simulate async execution — mark as running, then completed after a delay
    const runId = (data as { id: string }).id;
    const runStatus = (data as { status: AgentRunStatus }).status;

    // Mark as running immediately
    void supabase
      .from("agent_runs")
      .update({ status: "running" as AgentRunStatus })
      .eq("id", runId);

    // Simulate completion after 2 seconds (non-blocking)
    setTimeout(() => {
      void this.completeRun(runId);
    }, 2000);

    return { runId, status: runStatus };
  }

  private async completeRun(runId: string): Promise<void> {
    try {
      await supabase
        .from("agent_runs")
        .update({
          status: "completed" as AgentRunStatus,
          completed_at: new Date().toISOString(),
          output: { result: "mock", message: "Mock run completed successfully" },
          summary: "Mock agent run completed (no real AI execution).",
          tokens_in: 150,
          tokens_out: 80,
          estimated_cost: 0.002,
        })
        .eq("id", runId);
    } catch (err) {
      console.error("MockAgentRuntime: failed to complete run", err);
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

  async healthCheck(): Promise<{ healthy: boolean; message: string; latencyMs?: number }> {
    const start = Date.now();
    try {
      // Mock runtime is always "healthy" — just verify DB connectivity
      const { error } = await supabase
        .from("agent_runs")
        .select("id", { count: "exact", head: true })
        .limit(0);
      if (error) throw error;
      const latencyMs = Date.now() - start;
      return {
        healthy: true,
        message: "Mock runtime is operational. Database connection verified.",
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      return {
        healthy: false,
        message: `Database connection failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        latencyMs,
      };
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export { getRuntimeMode, getRuntimeModeLabel, getRuntimeEndpoint } from "./config";
export { HermesAgentRuntime } from "./hermes-runtime";
export { resolveModelRoute, getAvailableRouteTiers } from "./model-routing";
export type { ResolvedModelRoute } from "./model-routing";

import { getRuntimeMode } from "./config";
import { HermesAgentRuntime } from "./hermes-runtime";

let runtimeInstance: AgentRuntime | null = null;
let runtimeInstanceAccountId: string | undefined;

/**
 * Get the AgentRuntime instance for an account.
 *
 * Env-gated: when VITE_HERMES_RUNTIME_ENDPOINT is set, returns
 * HermesAgentRuntime (calls Supabase Edge Function for real LLM execution).
 * Otherwise, returns MockAgentRuntime (development, no real AI).
 *
 * The instance is cached per accountId: if a caller resolves a different
 * account later (e.g. the panel rendered before useAccountId finished),
 * the runtime is re-created rather than staying bound to the stale account.
 *
 * Guardrail: "Hermes is the agent runtime, not the backend."
 */
export function getAgentRuntime(accountId?: string): AgentRuntime {
  if (!runtimeInstance || (accountId && accountId !== runtimeInstanceAccountId)) {
    if (getRuntimeMode() !== "mock") {
      runtimeInstance = new HermesAgentRuntime(accountId);
    } else {
      runtimeInstance = new MockAgentRuntime(accountId);
    }
    runtimeInstanceAccountId = accountId;
  }
  return runtimeInstance;
}

/**
 * Reset the runtime instance (for testing).
 */
export function _resetAgentRuntime(): void {
  runtimeInstance = null;
  runtimeInstanceAccountId = undefined;
}
