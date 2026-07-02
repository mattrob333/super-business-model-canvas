import type { SupabaseClient } from "@supabase/supabase-js";
import { CanvasSectionAnalysisHandler } from "./canvas-section-analysis.js";
import { FeedRefreshHandler } from "./feed-refresh.js";
import { WorkspaceChatHandler } from "./workspace-chat.js";
import type { AgentTaskLimits } from "../agent/limits.js";
import type { AgentRunner } from "../agent/runner.js";
import type { FeedRuntimeConfig } from "../feeds/types.js";
import type { AgentJob, JobHandler } from "../queue/types.js";

export interface JobDispatcherOptions extends FeedRuntimeConfig {
  client: SupabaseClient;
  runner?: AgentRunner;
  xaiApiKey?: string;
  firecrawlApiKey?: string;
  taskLimits?: AgentTaskLimits;
}

export function createJobDispatcher(options: JobDispatcherOptions): JobHandler {
  const canvasSectionAnalysis = new CanvasSectionAnalysisHandler(options);
  const workspaceChat = new WorkspaceChatHandler(options);
  const feedRefresh = new FeedRefreshHandler(options);

  return async (job: AgentJob): Promise<void> => {
    try {
      if (job.kind === "canvas_section_analysis") {
        await canvasSectionAnalysis.handle(job);
        return;
      }

      if (job.kind === "workspace_chat") {
        await workspaceChat.handle(job);
        return;
      }

      if (job.kind === "feed_refresh") {
        await feedRefresh.handle(job);
        return;
      }

      throw new Error(`Unsupported job kind: ${job.kind}`);
    } catch (error) {
      await markAgentRunFailed(options.client, job, error);
      throw error;
    }
  };
}

async function markAgentRunFailed(client: SupabaseClient, job: AgentJob, error: unknown): Promise<void> {
  if (!job.agent_run_id) return;

  const message = error instanceof Error ? error.message : String(error);
  const { error: updateError } = await client
    .from("agent_runs")
    .update({
      status: "failed",
      error: message,
      summary: `Run failed: ${message}`,
      completed_at: new Date().toISOString(),
    })
    .eq("id", job.agent_run_id)
    .eq("account_id", job.account_id);

  if (updateError) {
    throw new Error(`Failed to mark agent run failed after job error: ${updateError.message}; original error: ${message}`);
  }
}
