import { describe, expect, it, vi } from "vitest";
import { OpenRouterChatRunner } from "../agent/runner.js";

describe("OpenRouterChatRunner", () => {
  it("calls OpenRouter chat completions and maps usage", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      id: "or-run-1",
      choices: [{ message: { content: "{\"claims\":[]}" } }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
      total_cost_usd: 0.0012,
    }), { status: 200 }));
    const runner = new OpenRouterChatRunner("openrouter-key", fetch as never);

    const result = await runner.run({
      model: "google/gemini-2.5-flash-lite",
      modelParams: { temperature: 0.2, max_tokens: 2000 },
      prompt: "extract",
      systemPrompt: "system",
      maxTurns: 1,
      maxBudgetUsd: 0.1,
      allowedTools: [],
      mcpServers: {},
    });

    expect(result).toMatchObject({
      resultText: "{\"claims\":[]}",
      sessionId: "or-run-1",
      costUsd: 0.0012,
      tokensIn: 11,
      tokensOut: 7,
    });
    const fetchMock = fetch as unknown as { mock: { calls: Array<[unknown, RequestInit?]> } };
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      model: "google/gemini-2.5-flash-lite",
      temperature: 0.2,
      max_tokens: 2000,
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "extract" },
      ],
    });
  });

  it("fails clearly when OPENROUTER_API_KEY is missing", async () => {
    const runner = new OpenRouterChatRunner(undefined, vi.fn() as never);

    await expect(runner.run({
      model: "google/gemini-2.5-flash-lite",
      prompt: "extract",
      systemPrompt: "system",
      maxTurns: 1,
      maxBudgetUsd: 0.1,
      allowedTools: [],
      mcpServers: {},
    })).rejects.toThrow("OPENROUTER_API_KEY not configured");
  });
});
