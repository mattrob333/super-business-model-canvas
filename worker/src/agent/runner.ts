import { query, type HookCallbackMatcher, type HookEvent, type McpServerConfig, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export interface AgentRunRequest {
  prompt: string;
  systemPrompt: string;
  model: string;
  maxTurns: number;
  maxBudgetUsd: number;
  taskBudgetTokens?: number;
  mcpServers: Record<string, McpServerConfig>;
  allowedTools: string[];
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
}

export interface AgentRunResult {
  resultText: string;
  sessionId: string | null;
  costUsd: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface AgentRunner {
  run(request: AgentRunRequest): Promise<AgentRunResult>;
}

export class ClaudeAgentRunner implements AgentRunner {
  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const q = query({
      prompt: request.prompt,
      options: {
        systemPrompt: request.systemPrompt,
        model: request.model,
        maxTurns: request.maxTurns,
        maxBudgetUsd: request.maxBudgetUsd,
        taskBudget: request.taskBudgetTokens ? { total: request.taskBudgetTokens } : undefined,
        permissionMode: "bypassPermissions",
        settingSources: [],
        persistSession: false,
        env: { ...process.env },
        mcpServers: request.mcpServers,
        allowedTools: request.allowedTools,
        disallowedTools: ["Bash", "Write", "Edit"],
        hooks: request.hooks,
      },
    });

    try {
      for await (const message of q) {
        if (isResultMessage(message)) {
          if (message.subtype !== "success") {
            throw new Error(`Claude Agent SDK run failed with subtype: ${message.subtype}`);
          }

          return {
            resultText: typeof message.result === "string" ? message.result : "",
            sessionId: typeof message.session_id === "string" ? message.session_id : null,
            costUsd: typeof message.total_cost_usd === "number" ? message.total_cost_usd : null,
            tokensIn: typeof message.usage?.input_tokens === "number" ? message.usage.input_tokens : null,
            tokensOut: typeof message.usage?.output_tokens === "number" ? message.usage.output_tokens : null,
          };
        }
      }
    } finally {
      q.close();
    }

    throw new Error("Claude Agent SDK query ended without a result message");
  }
}

type ResultMessage = Extract<SDKMessage, { type: "result" }>;

function isResultMessage(message: SDKMessage): message is ResultMessage {
  return message.type === "result";
}
