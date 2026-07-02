import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WorkspaceChatRequest {
  accountId: string;
  threadId: string;
  message: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "Unauthorized - Authentication required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ success: false, error: "Unauthorized - Invalid token" }, 401);
    }

    const body: WorkspaceChatRequest = await req.json();
    if (!body.accountId || !body.threadId || !body.message?.trim()) {
      return json({ success: false, error: "Missing required fields: accountId, threadId, message" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: membership } = await adminClient
      .from("account_members")
      .select("id")
      .eq("account_id", body.accountId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      return json({ success: false, error: "Forbidden - Not a member of this account" }, 403);
    }

    const { data: thread, error: threadError } = await adminClient
      .from("workspace_threads")
      .select("id, account_id, agent_profile_id")
      .eq("id", body.threadId)
      .eq("account_id", body.accountId)
      .maybeSingle();
    if (threadError) throw new Error(`Failed to load workspace thread: ${threadError.message}`);
    if (!thread) {
      return json({ success: false, error: "Workspace thread not found for this account" }, 404);
    }

    const { data: message, error: messageError } = await adminClient
      .from("workspace_messages")
      .insert({
        thread_id: thread.id,
        role: "user",
        kind: "text",
        content: { text: body.message.trim() },
      })
      .select("id")
      .single();
    if (messageError) throw new Error(`Failed to insert workspace message: ${messageError.message}`);

    const nowIso = new Date().toISOString();
    const { data: run, error: runError } = await adminClient
      .from("agent_runs")
      .insert({
        account_id: body.accountId,
        agent_profile_id: thread.agent_profile_id,
        run_type: "workspace_chat",
        trigger_type: "manual",
        triggered_by: user.id,
        status: "pending",
        input: { thread_id: thread.id, user_message_id: message.id },
        started_at: nowIso,
      })
      .select("id, status")
      .single();
    if (runError) throw new Error(`Failed to create workspace chat run: ${runError.message}`);

    const { error: jobError } = await adminClient.from("agent_jobs").insert({
      account_id: body.accountId,
      kind: "workspace_chat",
      payload: { thread_id: thread.id, user_message_id: message.id },
      status: "queued",
      agent_run_id: run.id,
      run_after: nowIso,
    });
    if (jobError) {
      await adminClient
        .from("agent_runs")
        .update({
          status: "failed",
          error: `Failed to enqueue workspace chat job: ${jobError.message}`,
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id)
        .eq("account_id", body.accountId);
      throw new Error(`Failed to enqueue workspace chat job: ${jobError.message}`);
    }

    return json({
      success: true,
      threadId: thread.id,
      messageId: message.id,
      runId: run.id,
      status: run.status,
    });
  } catch (error) {
    console.error("Workspace chat enqueue error:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
