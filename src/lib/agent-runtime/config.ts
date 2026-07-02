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
export type RuntimeMode = "enqueue" | "inline" | "mock";

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
 * - VITE_RUNTIME_MODE=enqueue queues jobs for the worker
 * - VITE_RUNTIME_MODE=inline keeps the legacy edge-function execution path
 * - VITE_RUNTIME_MODE=mock uses the local mock runtime
 * - Backcompat: with only VITE_HERMES_RUNTIME_ENDPOINT set, use inline
 */
export function getRuntimeMode(): RuntimeMode {
  const explicit = import.meta.env.VITE_RUNTIME_MODE;
  if (explicit === "enqueue" || explicit === "inline" || explicit === "mock") {
    return explicit;
  }
  return getRuntimeEndpoint() ? "inline" : "mock";
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
  const mode = getRuntimeMode();
  if (mode === "enqueue") return "Queued Runtime";
  if (mode === "inline") return "Inline Runtime";
  return "Mock Runtime";
}
