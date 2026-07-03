import { query, type HookCallbackMatcher, type HookEvent, type McpServerConfig, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export interface AgentRunRequest {
  prompt: string;
  systemPrompt: string;
  model: string;
  modelParams?: Record<string, unknown>;
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

export class OpenRouterChatRunner implements AgentRunner {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY not configured");

    const response = await this.fetcher("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        ...request.modelParams,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.prompt },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OpenRouter chat completion failed with HTTP ${response.status}`);

    const payload = await response.json() as Record<string, unknown>;
    const choice = Array.isArray(payload.choices) ? payload.choices[0] as Record<string, unknown> | undefined : undefined;
    const message = choice?.message as Record<string, unknown> | undefined;
    const usage = payload.usage as Record<string, unknown> | undefined;
    return {
      resultText: typeof message?.content === "string" ? message.content : "",
      sessionId: typeof payload.id === "string" ? payload.id : null,
      costUsd: typeof payload.total_cost_usd === "number" ? payload.total_cost_usd : null,
      tokensIn: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null,
      tokensOut: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null,
    };
  }
}

type ResultMessage = Extract<SDKMessage, { type: "result" }>;

function isResultMessage(message: SDKMessage): message is ResultMessage {
  return message.type === "result";
}
