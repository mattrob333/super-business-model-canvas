/**
 * Agent Runtime Configuration Detection
 *
 * Determines whether the app uses a live Hermes runtime (real LLM execution
 * via Supabase Edge Function) or falls back to MockAgentRuntime.
 *
 * Env-gated: when VITE_HERMES_RUNTIME_ENDPOINT is set, the factory returns
 * HermesAgentRuntime. Otherwise, MockAgentRuntime is used.
 *
 * Guardrail: "Hermes is the agent runtime, not the backend."
 * The "live" mode calls a Supabase Edge Function that executes the agent
 * loop — the browser never calls Hermes or the LLM directly.
 */

/** The runtime mode selected by environment configuration. */
export type RuntimeMode = "live" | "mock";

/**
 * Read the runtime endpoint from env. Returns null if not configured,
 * which means "use mock runtime."
 */
export function getRuntimeEndpoint(): string | null {
  const endpoint = import.meta.env.VITE_HERMES_RUNTIME_ENDPOINT;
  if (typeof endpoint === "string" && endpoint.trim().length > 0) {
    return endpoint.trim();
  }
  return null;
}

/**
 * Determine the current runtime mode based on environment configuration.
 * - "live" when VITE_HERMES_RUNTIME_ENDPOINT is set
 * - "mock" otherwise (development default)
 */
export function getRuntimeMode(): RuntimeMode {
  return getRuntimeEndpoint() ? "live" : "mock";
}

/**
 * Read the optional runtime API key for authenticating to the edge function.
 * Falls back to the Supabase anon key if not separately configured.
 */
export function getRuntimeApiKey(): string | null {
  const key = import.meta.env.VITE_HERMES_RUNTIME_API_KEY;
  if (typeof key === "string" && key.trim().length > 0) {
    return key.trim();
  }
  return null;
}

/**
 * Human-readable label for the current runtime mode, for UI display.
 */
export function getRuntimeModeLabel(): string {
  return getRuntimeMode() === "live" ? "Live Runtime" : "Mock Runtime";
}
