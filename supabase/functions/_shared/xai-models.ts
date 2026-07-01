/**
 * Canonical xAI / Grok model IDs for edge functions.
 *
 * Grok 4.3 is the current general-purpose model (replaces retired grok-4-1-fast-*).
 * @see https://docs.x.ai/developers/models
 */

/** Default for chat, streaming, and most interactive features. */
export const XAI_CHAT_MODEL = "grok-4.3";

/** Company research, web search, and structured JSON analysis. */
export const XAI_RESEARCH_MODEL = "grok-4.3";

/** Agent runtime default when routed to xAI. */
export const XAI_AGENT_MODEL = "grok-4.3";

export type XaiReasoningEffort = "none" | "low" | "medium" | "high";

/** Fast responses — BMC chat, competitor chat, coaching. */
export const XAI_CHAT_REASONING: XaiReasoningEffort = "none";

/** Web research and multi-step analysis. */
export const XAI_RESEARCH_REASONING: XaiReasoningEffort = "low";
