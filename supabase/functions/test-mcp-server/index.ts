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

const TEST_TIMEOUT_MS = 8000;

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

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized - Invalid token" }, 401);
    }

    const { serverId, accountId } = (await req.json()) as {
      serverId?: string;
      accountId?: string;
    };
    if (!serverId || !accountId) {
      return jsonResponse({ error: "Missing required fields: serverId, accountId" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Authorization: caller must be a member of the target account
    const { data: membership } = await adminClient
      .from("account_members")
      .select("id")
      .eq("account_id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      return jsonResponse({ error: "Forbidden - Not a member of this account" }, 403);
    }

    const { data: server, error: serverError } = await adminClient
      .from("mcp_servers")
      .select("id, name, transport_type, url, account_id")
      .eq("id", serverId)
      .eq("account_id", accountId)
      .maybeSingle();
    if (serverError || !server) {
      return jsonResponse({ error: "MCP server not found" }, 404);
    }

    const testedAt = new Date().toISOString();
    let status: "connected" | "error" = "error";
    let message: string;

    if (server.transport_type === "stdio") {
      // stdio servers run as local subprocesses — unreachable from the cloud.
      message =
        "stdio MCP servers cannot be tested from the cloud backend. They require the agent runtime host.";
      status = "error";
    } else if (!server.url) {
      message = "No URL configured for this server.";
      status = "error";
    } else {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
        // A reachable MCP HTTP/SSE endpoint responds to a POST (even an error
        // response proves connectivity); network-level failures throw.
        const response = await fetch(server.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "super-bmc-test", version: "1.0.0" },
            },
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (response.status < 500) {
          status = "connected";
          message = `Endpoint reachable (HTTP ${response.status}).`;
        } else {
          status = "error";
          message = `Endpoint returned HTTP ${response.status}.`;
        }
        // Drain body to avoid resource leak
        await response.body?.cancel();
      } catch (err) {
        status = "error";
        message = err instanceof Error && err.name === "AbortError"
          ? `Connection timed out after ${TEST_TIMEOUT_MS / 1000}s.`
          : `Connection failed: ${err instanceof Error ? err.message : "unknown error"}`;
      }
    }

    await adminClient
      .from("mcp_servers")
      .update({ status, last_tested_at: testedAt })
      .eq("id", serverId);

    return jsonResponse({ success: status === "connected", status, message, testedAt });
  } catch (error) {
    console.error("test-mcp-server error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
