import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  Building2,
  ChevronDown,
  FolderOpen,
  LayoutGrid,
  Loader2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useActiveAnalysis } from "@/hooks/useActiveAnalysis";
import { useAccountId } from "@/hooks/useAccountId";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  companyKeyOf,
  computeCompanyScope,
  invalidateCompanyScope,
} from "@/lib/company-scope";
import { clearActiveAnalysis, setActiveAnalysis } from "@/lib/active-analysis";
import { clearActiveWorkspaceName, setActiveWorkspaceName } from "@/lib/active-workspace";

/**
 * The workspace switcher is a real menu now: open the active company, switch
 * to a previously analyzed company, jump to saved companies, or start over.
 *
 * Switching companies works through the era model (src/lib/company-scope.ts):
 * the ACTIVE company is whichever company the newest business_context_versions
 * row belongs to, so selecting a previous company inserts a fresh context row
 * cloned from that company's newest context — its whole history becomes the
 * active scope again without rewriting any of it.
 *
 * "New company" clears every session pointer and hard-loads /canvas so the
 * fresh hero is guaranteed — no stale component state can keep the old
 * company on screen (owner finding 2026-07-06: there was no path to a clean
 * slate).
 */

/** Menu cap — the "Saved companies" page carries the rest. */
const MAX_LISTED_COMPANIES = 8;

interface SwitchTarget {
  /** Stable company identity (domain else normalized name). */
  key: string;
  name: string;
  /** Newest business_context_versions row of that company's era. */
  contextId: string;
}

export function AccountSwitcher() {
  const navigate = useNavigate();
  const { workspaceLabel, activeCompanyName } = useActiveWorkspace();
  const { activeAnalysis } = useActiveAnalysis();
  const { accountId } = useAccountId();
  const { user } = useAuth();
  const hasActiveCompany = Boolean(activeCompanyName && activeAnalysis?.data);

  const [menuOpen, setMenuOpen] = useState(false);
  const [otherCompanies, setOtherCompanies] = useState<SwitchTarget[]>([]);
  const [switchingKey, setSwitchingKey] = useState<string | null>(null);
  // Ref, not state: a double-click can land before React re-renders with the
  // disabled state, and a second insert would fork the era twice.
  const switchingRef = useRef(false);

  // Load the account's other analyzed companies when the menu opens: distinct
  // company eras from business_context_versions, grouped by the same identity
  // the scope resolver uses, minus the active company.
  useEffect(() => {
    if (!menuOpen || !accountId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("business_context_versions")
        .select("id, company_name, website, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (error || !data) {
        setOtherCompanies([]);
        return;
      }
      const activeKey = computeCompanyScope(data).companyKey;
      const seen = new Set<string>();
      const targets: SwitchTarget[] = [];
      for (const row of data) {
        const key = companyKeyOf(row.company_name, row.website);
        if (!key || key === activeKey || seen.has(key)) continue;
        seen.add(key);
        targets.push({
          key,
          name: row.company_name?.trim() || key,
          contextId: row.id,
        });
        if (targets.length === MAX_LISTED_COMPANIES) break;
      }
      setOtherCompanies(targets);
    })();
    return () => {
      cancelled = true;
    };
  }, [menuOpen, accountId]);

  const switchToCompany = async (target: SwitchTarget) => {
    if (switchingRef.current || !accountId) return;
    switchingRef.current = true;
    setSwitchingKey(target.key);
    try {
      const [sourceRes, maxVersionRes] = await Promise.all([
        supabase
          .from("business_context_versions")
          .select("company_name, website, industry, summary, data, source_analysis_id")
          .eq("id", target.contextId)
          .eq("account_id", accountId)
          .single(),
        supabase
          .from("business_context_versions")
          .select("version_number")
          .eq("account_id", accountId)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (sourceRes.error || !sourceRes.data) {
        throw new Error(sourceRes.error?.message ?? "Company context not found");
      }
      if (maxVersionRes.error) throw new Error(maxVersionRes.error.message);
      const source = sourceRes.data;

      // The clone makes this company the newest context — i.e. the active era.
      const { error: insertError } = await supabase
        .from("business_context_versions")
        .insert({
          account_id: accountId,
          source_analysis_id: source.source_analysis_id,
          version_number: (maxVersionRes.data?.version_number ?? 0) + 1,
          summary: source.summary,
          company_name: source.company_name,
          website: source.website,
          industry: source.industry,
          data: source.data,
          created_by: user?.id ?? null,
        });
      if (insertError) throw new Error(insertError.message);

      // Scoped readers must not serve the previous company from cache.
      invalidateCompanyScope(accountId);

      // Rehydrate the session pointers /canvas restores from (same shape
      // MyAnalyses.loadAnalysis writes) so the switched company is what
      // actually renders — clear first so no stale id or data survives when
      // the era's context has no analysis payload.
      clearActiveAnalysis();
      const name = source.company_name?.trim() || target.name;
      const analysisData =
        source.data && typeof source.data === "object" && !Array.isArray(source.data)
          ? (source.data as Record<string, unknown>)
          : null;
      if (analysisData && Object.keys(analysisData).length > 0) {
        try {
          sessionStorage.setItem("loadedAnalysis", JSON.stringify(analysisData));
        } catch {
          // sessionStorage may be unavailable
        }
        setActiveAnalysis({ id: source.source_analysis_id, data: analysisData });
      }
      setActiveWorkspaceName(name);

      toast({ title: `Switched to ${name}` });
      navigate("/canvas");
    } catch (error) {
      toast({
        title: "Failed to switch company",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      switchingRef.current = false;
      setSwitchingKey(null);
    }
  };

  const startNewCompany = () => {
    clearActiveAnalysis();
    clearActiveWorkspaceName();
    try {
      sessionStorage.removeItem("loadedAnalysis");
    } catch {
      // sessionStorage may be unavailable
    }
    window.location.assign("/canvas");
  };

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 w-full justify-start gap-2 px-2">
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm">{workspaceLabel}</span>
          <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {hasActiveCompany ? `Working on ${activeCompanyName}` : "No company selected"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hasActiveCompany && (
          <DropdownMenuItem onClick={() => navigate("/canvas")} className="gap-2">
            <LayoutGrid className="h-4 w-4" />
            Open canvas
          </DropdownMenuItem>
        )}
        {otherCompanies.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Switch company
            </DropdownMenuLabel>
            {otherCompanies.map((company) => (
              <DropdownMenuItem
                key={company.key}
                disabled={switchingKey !== null}
                onClick={() => void switchToCompany(company)}
                className="gap-2"
              >
                {switchingKey === company.key ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowLeftRight className="h-4 w-4" />
                )}
                <span className="truncate">{company.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuItem onClick={() => navigate("/my-analyses")} className="gap-2">
          <FolderOpen className="h-4 w-4" />
          Saved companies
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={startNewCompany} className="gap-2">
          <Plus className="h-4 w-4" />
          New company
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
