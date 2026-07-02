import type { WorkerConfig } from "../config/env.js";

export interface AgentTaskLimit {
  maxTurns: number;
  taskBudgetTokens: number;
  maxBudgetUsd?: number;
}

export interface AgentTaskLimits {
  sectionAnalysis: AgentTaskLimit;
  workspaceChat: AgentTaskLimit;
}

export function taskLimitsFromConfig(config: WorkerConfig): AgentTaskLimits {
  return {
    sectionAnalysis: {
      maxTurns: config.SECTION_ANALYSIS_MAX_TURNS,
      taskBudgetTokens: config.SECTION_ANALYSIS_TASK_BUDGET_TOKENS,
      maxBudgetUsd: config.SECTION_ANALYSIS_MAX_BUDGET_USD,
    },
    workspaceChat: {
      maxTurns: config.WORKSPACE_CHAT_MAX_TURNS,
      taskBudgetTokens: config.WORKSPACE_CHAT_TASK_BUDGET_TOKENS,
      maxBudgetUsd: config.WORKSPACE_CHAT_MAX_BUDGET_USD,
    },
  };
}
