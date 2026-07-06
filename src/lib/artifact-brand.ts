import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/lib/supabase-untyped";

export interface ArtifactBrandInfo {
  brandColor: string | null;
  logoUrl: string | null;
}

interface AccountBrandRow {
  brand_color: string | null;
}

interface CompanyLogoRow {
  logo_url: string | null;
}

export async function loadArtifactBrand(accountId: string): Promise<ArtifactBrandInfo> {
  const [accountResult, companyResult] = await Promise.all([
    supabaseUntyped
      .from<AccountBrandRow>("accounts")
      .select("brand_color")
      .eq("id", accountId)
      .maybeSingle(),
    supabase
      .from("companies")
      .select("logo_url")
      .eq("account_id", accountId)
      .eq("is_competitor", false)
      .not("logo_url", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    brandColor: accountResult.error ? null : accountResult.data?.brand_color ?? null,
    logoUrl: companyResult.error ? null : (companyResult.data as CompanyLogoRow | null)?.logo_url ?? null,
  };
}

export function generateShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
