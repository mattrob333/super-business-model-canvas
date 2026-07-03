import {
  XAI_CHAT_MODEL,
  XAI_CHAT_REASONING,
  type XaiReasoningEffort,
} from "./xai-models.ts";

interface GrokMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** @deprecated Live search via search_parameters was removed by xAI — use webSearch instead. */
interface GrokSearchParameters {
  mode: "on" | "off" | "auto";
  return_citations?: boolean;
}

export interface GrokChatOptions {
  messages: GrokMessage[];
  /** Enable xAI Agent Tools web_search (replaces deprecated live search). */
  webSearch?: boolean;
  /** @deprecated Maps to webSearch when mode is on/auto. */
  search_parameters?: GrokSearchParameters;
  model?: string;
  reasoning_effort?: XaiReasoningEffort;
  temperature?: number;
  maxTokens?: number;
  maxTurns?: number;
}

interface StreamGrokChatOptions extends GrokChatOptions {
  onChunk?: (text: string) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

function wantsWebSearch(options: GrokChatOptions): boolean {
  if (options.webSearch) return true;
  if (!options.search_parameters) return false;
  return options.search_parameters.mode === "on" ||
    options.search_parameters.mode === "auto";
}

function splitMessages(messages: GrokMessage[]) {
  const system = messages.find((m) => m.role === "system")?.content;
  const conversation = messages.filter((m) => m.role !== "system");
  return { instructions: system, conversation };
}

// ─── Provider resolution ─────────────────────────────────────────────────────
// xAI direct when XAI_API_KEY is set; otherwise fall back to the same Grok
// models through OpenRouter (slug convention `x-ai/<model>`, web search via
// OpenRouter's `:online` suffix). Override the fallback slug with
// OPENROUTER_GROK_FALLBACK_MODEL if the derived one ever mismatches.

interface GrokProvider {
  name: "xai" | "openrouter";
  apiKey: string;
  chatEndpoint: string;
  /** Only xAI supports the Responses API (web_search agent tools). */
  supportsResponsesApi: boolean;
  resolveModel: (requestedModel: string, webSearch: boolean) => string;
}

/** True when any Grok-capable provider key is configured. */
export function hasGrokProvider(): boolean {
  return Boolean(Deno.env.get("XAI_API_KEY") || Deno.env.get("OPENROUTER_API_KEY"));
}

const NO_PROVIDER_ERROR =
  "No Grok-capable provider configured. Set XAI_API_KEY (preferred) or OPENROUTER_API_KEY (fallback via x-ai/* models).";

function resolveGrokProvider(): GrokProvider {
  const xaiKey = Deno.env.get("XAI_API_KEY");
  if (xaiKey) {
    return {
      name: "xai",
      apiKey: xaiKey,
      chatEndpoint: "https://api.x.ai/v1/chat/completions",
      supportsResponsesApi: true,
      resolveModel: (model) => model,
    };
  }
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (openrouterKey) {
    return {
      name: "openrouter",
      apiKey: openrouterKey,
      chatEndpoint: "https://openrouter.ai/api/v1/chat/completions",
      supportsResponsesApi: false,
      resolveModel: (model, webSearch) => {
        const base = Deno.env.get("OPENROUTER_GROK_FALLBACK_MODEL") || `x-ai/${model}`;
        return webSearch ? `${base}:online` : base;
      },
    };
  }
  throw new Error(NO_PROVIDER_ERROR);
}

function buildChatCompletionsBody(
  options: GrokChatOptions,
  stream: boolean,
  provider: GrokProvider,
  useWebSearch: boolean,
): Record<string, unknown> {
  const requested = options.model || XAI_CHAT_MODEL;
  const body: Record<string, unknown> = {
    model: provider.resolveModel(requested, useWebSearch),
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens,
    stream,
  };
  const effort = options.reasoning_effort ?? XAI_CHAT_REASONING;
  if (provider.name === "xai") {
    body.reasoning_effort = effort;
  } else if (effort !== "none") {
    // OpenRouter's unified reasoning parameter
    body.reasoning = { effort };
  }
  return body;
}

function buildResponsesBody(
  options: GrokChatOptions,
  stream: boolean,
): Record<string, unknown> {
  const { instructions, conversation } = splitMessages(options.messages);
  const body: Record<string, unknown> = {
    model: options.model || XAI_CHAT_MODEL,
    stream,
    temperature: options.temperature ?? 0.7,
    max_output_tokens: options.maxTokens,
    max_turns: options.maxTurns ?? 12,
    tools: [{ type: "web_search" }],
    reasoning: { effort: options.reasoning_effort ?? XAI_CHAT_REASONING },
    input: conversation.length === 1 && conversation[0].role === "user"
      ? conversation[0].content
      : conversation,
  };
  if (instructions) body.instructions = instructions;
  return body;
}

function extractResponsesText(data: Record<string, unknown>): string {
  const output = (data.output as Array<Record<string, unknown>>) || [];
  let text = "";
  for (const item of output) {
    if (item.type !== "message") continue;
    const content = item.content as Array<Record<string, unknown>> | undefined;
    if (!content) continue;
    for (const block of content) {
      if (block.type === "output_text" && typeof block.text === "string") {
        text += block.text;
      }
    }
  }
  return text;
}

function parseResponsesStreamEvent(
  payload: Record<string, unknown>,
): string | null {
  const type = payload.type as string | undefined;
  if (type === "response.output_text.delta" && typeof payload.delta === "string") {
    return payload.delta;
  }
  if (type === "response.completed") {
    const response = payload.response as Record<string, unknown> | undefined;
    if (response) return extractResponsesText(response) || null;
  }
  return null;
}

async function readResponsesStream(
  response: Response,
  onChunk?: (text: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let fullResponse = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim() || line.startsWith(":")) continue;
      if (!line.startsWith("data: ")) continue;

      const data = line.slice(6).trim();
      if (data === "[DONE]") return fullResponse;

      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        if (parsed.error) {
          const err = parsed.error as Record<string, unknown>;
          throw new Error(
            `Grok API stream error: ${err.message || JSON.stringify(err)}`,
          );
        }

        const chunk = parseResponsesStreamEvent(parsed);
        if (chunk) {
          if (chunk.length > fullResponse.length && chunk.startsWith(fullResponse)) {
            const delta = chunk.slice(fullResponse.length);
            fullResponse = chunk;
            if (delta && onChunk) onChunk(delta);
          } else if (!fullResponse.includes(chunk)) {
            fullResponse += chunk;
            if (onChunk) onChunk(chunk);
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Grok API stream error:")) {
          throw e;
        }
        console.warn("Failed to parse Responses API SSE chunk:", data);
      }
    }
  }

  return fullResponse;
}

export async function streamGrokChat(options: StreamGrokChatOptions): Promise<string> {
  const provider = resolveGrokProvider();

  const useWebSearch = wantsWebSearch(options);
  // The Responses API (web_search agent tools) is xAI-only; on OpenRouter,
  // web search rides the chat-completions path via the :online model suffix.
  const useResponsesApi = useWebSearch && provider.supportsResponsesApi;
  const model = options.model || XAI_CHAT_MODEL;
  console.log(
    `Grok stream: provider=${provider.name}, model=${model}, webSearch=${useWebSearch}, reasoning=${
      options.reasoning_effort ?? XAI_CHAT_REASONING
    }`,
  );

  const endpoint = useResponsesApi
    ? "https://api.x.ai/v1/responses"
    : provider.chatEndpoint;
  const body = useResponsesApi
    ? buildResponsesBody(options, true)
    : buildChatCompletionsBody(options, true, provider, useWebSearch);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Grok API error:", response.status, errorText);
    throw new Error(`Grok API error: ${response.status} - ${errorText}`);
  }

  try {
    let fullResponse = "";

    if (useResponsesApi) {
      fullResponse = await readResponsesStream(response, options.onChunk);
    } else {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;

          const data = line.slice(6).trim();
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              throw new Error(
                `Grok API stream error: ${
                  parsed.error.message || JSON.stringify(parsed.error)
                }`,
              );
            }
            const content =
              parsed.choices?.[0]?.delta?.content ??
              parsed.choices?.[0]?.message?.content;
            if (content) {
              fullResponse += content;
              if (options.onChunk) options.onChunk(content);
            }
          } catch (e) {
            if (e instanceof Error && e.message.startsWith("Grok API stream error:")) {
              throw e;
            }
            console.warn("Failed to parse SSE chunk:", data);
          }
        }
      }
    }

    if (options.onDone) options.onDone();
    if (!fullResponse.trim()) {
      throw new Error(
        `Grok (${provider.name}) returned an empty response. Check the API key and account credits.`,
      );
    }
    return fullResponse;
  } catch (error) {
    console.error("Grok streaming error:", error);
    if (options.onError) options.onError(error as Error);
    throw error;
  }
}

export async function callGrokChat(
  options: Omit<StreamGrokChatOptions, "onChunk" | "onDone" | "onError">,
): Promise<string> {
  const provider = resolveGrokProvider();

  const useWebSearch = wantsWebSearch(options);
  const useResponsesApi = useWebSearch && provider.supportsResponsesApi;
  const model = options.model || XAI_CHAT_MODEL;
  console.log(
    `Grok request: provider=${provider.name}, model=${model}, webSearch=${useWebSearch}, reasoning=${
      options.reasoning_effort ?? XAI_CHAT_REASONING
    }`,
  );

  const endpoint = useResponsesApi
    ? "https://api.x.ai/v1/responses"
    : provider.chatEndpoint;
  const body = useResponsesApi
    ? buildResponsesBody(options, false)
    : buildChatCompletionsBody(options, false, provider, useWebSearch);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Grok API error:", response.status, errorText);
    throw new Error(`Grok API error (${provider.name}): ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = useResponsesApi
    ? extractResponsesText(data)
    : (data.choices?.[0]?.message?.content || "");

  if (!text.trim()) {
    throw new Error(
      `Grok (${provider.name}) returned an empty response. Check the API key and account credits.`,
    );
  }
  return text;
}
