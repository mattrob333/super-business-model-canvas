import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * AES-256-GCM encryption for provider secrets.
 * Requires CREDENTIALS_ENCRYPTION_KEY (base64-encoded 32 bytes) in secrets.
 * Stored format: base64(iv) + "." + base64(ciphertext)
 */
async function getEncryptionKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("CREDENTIALS_ENCRYPTION_KEY");
  if (!raw) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY not configured. Generate one with: openssl rand -base64 32",
    );
  }
  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (keyBytes.length !== 32) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (base64-encoded).");
  }
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const b64 = (buf: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf.buffer : buf)));
  return `${b64(iv)}.${b64(ciphertext)}`;
}

const ALLOWED_PROVIDERS = ["openai", "anthropic", "openrouter", "xai", "firecrawl", "other"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Server misconfigured: missing Supabase env vars" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized - Authentication required" }, 401);
    }

    // Validate the caller's JWT and resolve the user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized - Invalid token" }, 401);
    }

    const body = await req.json();
    const { action, accountId, provider, label, secret } = body as {
      action?: string;
      accountId?: string;
      provider?: string;
      label?: string;
      secret?: string;
    };

    if (action !== "add") {
      return jsonResponse({ error: `Unsupported action: ${action}. Only "add" is supported.` }, 400);
    }
    if (!accountId || !provider || !secret) {
      return jsonResponse({ error: "Missing required fields: accountId, provider, secret" }, 400);
    }
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      return jsonResponse({ error: `Unknown provider: ${provider}` }, 400);
    }
    if (secret.length < 8 || secret.length > 512) {
      return jsonResponse({ error: "Secret length out of accepted range." }, 400);
    }

    // Authorization: caller must be a member of the target account
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: membership } = await adminClient
      .from("account_members")
      .select("id")
      .eq("account_id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      return jsonResponse({ error: "Forbidden - Not a member of this account" }, 403);
    }

    const encrypted = await encryptSecret(secret);
    const lastFour = secret.slice(-4);

    const { error: insertError } = await adminClient.from("provider_credentials").insert({
      account_id: accountId,
      provider,
      label: label ?? null,
      encrypted_secret: encrypted,
      secret_last_four: lastFour,
      status: "active",
      created_by: user.id,
    });

    if (insertError) {
      return jsonResponse({ error: `Failed to store credential: ${insertError.message}` }, 500);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("manage-provider-key error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
