import type { SupabaseClient } from "@supabase/supabase-js";
import { CanvasSectionAnalysisHandler } from "./canvas-section-analysis.js";
import { CompanyResearchHandler } from "./company-research.js";
import { FeedRefreshHandler } from "./feed-refresh.js";
import { GapEngineHandler } from "./gap-engine.js";
import { KnowledgeJobHandler } from "./knowledge-jobs.js";
import { StalenessSweepHandler } from "./staleness-sweep.js";
import { WorkspaceChatHandler } from "./workspace-chat.js";
import type { AgentTaskLimits } from "../agent/limits.js";
import type { AgentRunner } from "../agent/runner.js";
import type { FeedRunner } from "../feeds/feed-runner.js";
import type { FeedRuntimeConfig } from "../feeds/types.js";
import type { AgentJob, JobHandler } from "../queue/types.js";

export interface JobDispatcherOptions extends FeedRuntimeConfig {
  client: SupabaseClient;
  runner?: AgentRunner;
  feedRunner?: FeedRunner;
  openRouterApiKey?: string;
  xaiApiKey?: string;
  firecrawlApiKey?: string;
  taskLimits?: AgentTaskLimits;
}

export function createJobDispatcher(options: JobDispatcherOptions): JobHandler {
  const canvasSectionAnalysis = new CanvasSectionAnalysisHandler(options);
  const companyResearch = new CompanyResearchHandler(options);
  const workspaceChat = new WorkspaceChatHandler(options);
  const feedRefresh = new FeedRefreshHandler(options);
  const gapEngine = new GapEngineHandler(options.client);
  const knowledgeJobs = new KnowledgeJobHandler(options);
  const stalenessSweep = new StalenessSweepHandler(options);

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

      if (job.kind === "company_research") {
        await companyResearch.handle(job);
        return;
      }

      if (job.kind === "competitor_research") {
        await companyResearch.handleCompetitor(job);
        return;
      }

      if (job.kind === "feed_refresh") {
        await feedRefresh.handle(job);
        return;
      }

      if (job.kind === "gap_engine") {
        await gapEngine.handle(job);
        return;
      }

      if (job.kind === "dossier_refresh") {
        await knowledgeJobs.handleDossierRefresh(job);
        return;
      }

      if (job.kind === "summary_update") {
        await knowledgeJobs.handleSummaryUpdate(job);
        return;
      }

      if (job.kind === "onboarding_extract") {
        await knowledgeJobs.handleOnboardingExtract(job);
        return;
      }

      if (job.kind === "staleness_sweep") {
        await stalenessSweep.handle(job);
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
