import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();
    if (typeof token !== "string" || token.length < 32) {
      return json({ error: "Invalid token" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: share, error: shareError } = await adminClient
      .from("artifact_shares")
      .select("artifact_id")
      .eq("token", token)
      .eq("revoked", false)
      .maybeSingle();
    if (shareError) throw shareError;
    if (!share) return json({ error: "Shared artifact not found" }, 404);

    const { data: artifact, error: artifactError } = await adminClient
      .from("skill_artifacts")
      .select("account_id, title, body_md, payload, created_at")
      .eq("id", share.artifact_id)
      .maybeSingle();
    if (artifactError) throw artifactError;
    if (!artifact) return json({ error: "Shared artifact not found" }, 404);

    const [{ data: account }, { data: company }] = await Promise.all([
      adminClient
        .from("accounts")
        .select("brand_color")
        .eq("id", artifact.account_id)
        .maybeSingle(),
      adminClient
        .from("companies")
        .select("logo_url")
        .eq("account_id", artifact.account_id)
        .eq("is_competitor", false)
        .not("logo_url", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return json({
      artifact: {
        title: artifact.title,
        body_md: artifact.body_md,
        payload: artifact.payload,
        created_at: artifact.created_at,
      },
      brand: {
        brandColor: account?.brand_color ?? null,
        logoUrl: company?.logo_url ?? null,
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
