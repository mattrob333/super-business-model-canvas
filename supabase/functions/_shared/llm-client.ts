/**
 * Shared non-streaming LLM client for edge functions.
 *
 * Provider priority when modelProvider is omitted:
 *   OpenRouter > OpenAI > Anthropic > xAI
 *
 * OpenRouter is preferred when a framework specifies a model like
 * "google/gemini-2.5-flash" since it routes arbitrary model IDs.
 */

import {
  XAI_AGENT_MODEL,
  XAI_CHAT_MODEL,
} from "./xai-models.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCallResult {
  text: string;
  provider: string;
  model: string;
}

export async function callChatCompletion(options: {
  messages: ChatMessage[];
  model?: string;
  modelProvider?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<LlmCallResult> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  const xaiKey = Deno.env.get("XAI_API_KEY");

  let provider = options.modelProvider || "";
  if (!provider) {
    if (openrouterKey) provider = "openrouter";
    else if (openaiKey) provider = "openai";
    else if (anthropicKey) provider = "anthropic";
    else if (xaiKey) provider = "xai";
    else {
      throw new Error(
        "No LLM API key configured. Set OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or XAI_API_KEY.",
      );
    }
  }

  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 4000;

  if (provider === "openrouter" && openrouterKey) {
    const model = options.model || "openai/gpt-4o-mini";
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenRouter error: ${response.status} - ${await response.text()}`);
    }
    const data = await response.json();
    return {
      text: data.choices?.[0]?.message?.content || "",
      provider: "openrouter",
      model,
    };
  }

  if (provider === "openai" && openaiKey) {
    const model = options.model || "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status} - ${await response.text()}`);
    }
    const data = await response.json();
    return {
      text: data.choices?.[0]?.message?.content || "",
      provider: "openai",
      model,
    };
  }

  if (provider === "anthropic" && anthropicKey) {
    const model = options.model || "claude-3-5-sonnet-20241022";
    const system = options.messages.find((m) => m.role === "system")?.content;
    const chatMessages = options.messages.filter((m) => m.role !== "system");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        ...(system ? { system } : {}),
        messages: chatMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: maxTokens,
        temperature,
      }),
    });
    if (!response.ok) {
      throw new Error(`Anthropic error: ${response.status} - ${await response.text()}`);
    }
    const data = await response.json();
    return {
      text: data.content?.[0]?.text || "",
      provider: "anthropic",
      model,
    };
  }

  if (provider === "xai" && xaiKey) {
    const model = options.model || XAI_CHAT_MODEL;
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${xaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (!response.ok) {
      throw new Error(`xAI error: ${response.status} - ${await response.text()}`);
    }
    const data = await response.json();
    return {
      text: data.choices?.[0]?.message?.content || "",
      provider: "xai",
      model,
    };
  }

  throw new Error(`Provider "${provider}" not configured or key missing.`);
}

/**
 * Pick provider + model from a framework's ai_model field.
 * Models with a "/" prefix (e.g. google/gemini-2.5-flash) route via OpenRouter.
 */
export function resolveFrameworkModel(aiModel?: string | null): {
  provider?: string;
  model: string;
} {
  const model = aiModel || XAI_AGENT_MODEL;
  if (model.includes("/")) {
    return { provider: "openrouter", model };
  }
  if (model.startsWith("gpt-")) {
    return { provider: "openai", model };
  }
  if (model.startsWith("claude-")) {
    return { provider: "anthropic", model };
  }
  if (model.startsWith("grok-")) {
    return { provider: "xai", model };
  }
  return { model };
}
