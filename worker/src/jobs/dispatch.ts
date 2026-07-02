import type { SupabaseClient } from "@supabase/supabase-js";
import { CanvasSectionAnalysisHandler } from "./canvas-section-analysis.js";
import type { AgentRunner } from "../agent/runner.js";
import type { AgentJob, JobHandler } from "../queue/types.js";

export interface JobDispatcherOptions {
  client: SupabaseClient;
  runner?: AgentRunner;
  xaiApiKey?: string;
  firecrawlApiKey?: string;
}

export function createJobDispatcher(options: JobDispatcherOptions): JobHandler {
  const canvasSectionAnalysis = new CanvasSectionAnalysisHandler(options);

  return async (job: AgentJob): Promise<void> => {
    if (job.kind === "canvas_section_analysis") {
      await canvasSectionAnalysis.handle(job);
      return;
    }

    throw new Error(`Unsupported job kind: ${job.kind}`);
  };
}
