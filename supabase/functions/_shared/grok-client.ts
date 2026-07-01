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

function buildChatCompletionsBody(
  options: GrokChatOptions,
  stream: boolean,
): Record<string, unknown> {
  return {
    model: options.model || XAI_CHAT_MODEL,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens,
    stream,
    reasoning_effort: options.reasoning_effort ?? XAI_CHAT_REASONING,
  };
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
  const apiKey = Deno.env.get("XAI_API_KEY");
  if (!apiKey) throw new Error("XAI_API_KEY not configured");

  const useWebSearch = wantsWebSearch(options);
  const model = options.model || XAI_CHAT_MODEL;
  console.log(
    `Grok stream: model=${model}, webSearch=${useWebSearch}, reasoning=${
      options.reasoning_effort ?? XAI_CHAT_REASONING
    }`,
  );

  const endpoint = useWebSearch
    ? "https://api.x.ai/v1/responses"
    : "https://api.x.ai/v1/chat/completions";
  const body = useWebSearch
    ? buildResponsesBody(options, true)
    : buildChatCompletionsBody(options, true);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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

    if (useWebSearch) {
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
        "Grok API returned an empty response. Check your xAI API key and account credits at console.x.ai",
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
  const apiKey = Deno.env.get("XAI_API_KEY");
  if (!apiKey) throw new Error("XAI_API_KEY not configured");

  const useWebSearch = wantsWebSearch(options);
  const model = options.model || XAI_CHAT_MODEL;
  console.log(
    `Grok request: model=${model}, webSearch=${useWebSearch}, reasoning=${
      options.reasoning_effort ?? XAI_CHAT_REASONING
    }`,
  );

  const endpoint = useWebSearch
    ? "https://api.x.ai/v1/responses"
    : "https://api.x.ai/v1/chat/completions";
  const body = useWebSearch
    ? buildResponsesBody(options, false)
    : buildChatCompletionsBody(options, false);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Grok API error:", response.status, errorText);
    throw new Error(`Grok API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = useWebSearch
    ? extractResponsesText(data)
    : (data.choices?.[0]?.message?.content || "");

  if (!text.trim()) {
    throw new Error(
      "Grok API returned an empty response. Check your xAI API key and account credits at console.x.ai",
    );
  }
  return text;
}
