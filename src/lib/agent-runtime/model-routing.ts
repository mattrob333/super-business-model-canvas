/**
 * Model Routing — maps agent_profile.model_route_key to provider+model.
 *
 * Route keys are tier labels (premium/standard/economy/local) assigned per
 * agent profile via the Settings > Model Routing panel. This module resolves
 * a route key to a concrete provider+model pair that the edge function can
 * use for LLM selection.
 *
 * The edge function reads API keys from Deno env vars — the provider_credentials
 * table is for UI management only. This resolver picks the provider+model based
 * on the route tier; the edge function uses its env vars for the actual key.
 *
 * If the route key is null or unrecognized, returns null — the edge function
 * will auto-detect from its env vars (priority: OpenAI > Anthropic > OpenRouter > xAI).
 */

import { supabase } from "@/integrations/supabase/client";

export interface ResolvedModelRoute {
  provider: string;
  modelName: string;
}

/**
 * Static mapping from route tier to default provider+model.
 *
 * These defaults assume the edge function has the corresponding env var set.
 * If the provider's env key is not configured on the edge function, it will
 * fall through to auto-detection.
 */
const MODEL_ROUTE_MAPPING: Record<string, ResolvedModelRoute> = {
  premium: {
    provider: "xai",
    modelName: "grok-4.3",
  },
  standard: {
    provider: "xai",
    modelName: "grok-4.3",
  },
  economy: {
    provider: "openrouter",
    modelName: "openai/gpt-4o-mini",
  },
  local: {
    // Local models are served via OpenAI-compatible endpoints (Ollama, vLLM).
    // The edge function would need a LOCAL_LLM_ENDPOINT env var to use this.
    // For now, local falls through to auto-detection.
    provider: "openai",
    modelName: "llama-3.1-8b-instruct",
  },
};

/**
 * Resolve a model_route_key to a provider+model pair.
 *
 * @param modelRouteKey - The route key from agent_profiles (premium/standard/economy/local)
 * @returns Resolved provider+model, or null if the key is null/unrecognized
 *          (null means "let the edge function auto-detect")
 */
export function resolveModelRoute(
  modelRouteKey: string | null | undefined,
): ResolvedModelRoute | null {
  if (!modelRouteKey) return null;
  return MODEL_ROUTE_MAPPING[modelRouteKey] ?? null;
}

/**
 * Get the list of available route tiers for UI display.
 */
export function getAvailableRouteTiers(): { value: string; label: string; provider: string; model: string }[] {
  return Object.entries(MODEL_ROUTE_MAPPING).map(([key, route]) => ({
    value: key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    provider: route.provider,
    model: route.modelName,
  }));
}

// ---------------------------------------------------------------------------
// Database-backed routes (model_routes table)
// ---------------------------------------------------------------------------
//
// The static map above is the fallback. The source of truth is the
// `model_routes` table, which is seeded globally and copied into each account
// on provisioning, so users can re-point a tier (e.g. "premium") at any
// provider/model (including OpenRouter) from the Settings UI.

export interface ModelRoute {
  routeKey: string;
  label: string;
  provider: string;
  modelName: string;
  params: Record<string, unknown>;
  fallbackRouteKey: string | null;
  isDefault: boolean;
}

/**
 * Load the model routes for an account from the database. Falls back to the
 * static tier map if the table is empty or the query fails, so the UI always
 * has something to show.
 */
export async function fetchModelRoutes(
  accountId: string | null | undefined,
): Promise<ModelRoute[]> {
  if (accountId) {
    try {
      const { data, error } = await supabase
        .from("model_routes")
        .select(
          "route_key, label, provider, model_name, params, fallback_route_key, is_default",
        )
        .eq("account_id", accountId)
        .order("route_key", { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map((r) => ({
          routeKey: r.route_key,
          label: r.label,
          provider: r.provider,
          modelName: r.model_name,
          params: (r.params as Record<string, unknown>) ?? {},
          fallbackRouteKey: r.fallback_route_key,
          isDefault: r.is_default,
        }));
      }
    } catch (err) {
      console.warn("fetchModelRoutes: falling back to static map", err);
    }
  }

  // Fallback: derive routes from the static tier map.
  return Object.entries(MODEL_ROUTE_MAPPING).map(([key, route]) => ({
    routeKey: key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    provider: route.provider,
    modelName: route.modelName,
    params: {},
    fallbackRouteKey: null,
    isDefault: key === "standard",
  }));
}
