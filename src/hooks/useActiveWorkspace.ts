import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIVE_WORKSPACE_EVENT,
  getActiveWorkspaceName,
} from "@/lib/active-workspace";
import { useAccountId } from "@/hooks/useAccountId";

/**
 * Label shown in the sidebar workspace switcher.
 * Prefers the active analyzed company, then the account name from the database.
 */
export function useActiveWorkspace() {
  const { accountId } = useAccountId();
  const [companyName, setCompanyName] = useState<string | null>(() =>
    getActiveWorkspaceName(),
  );
  const [accountName, setAccountName] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setCompanyName(getActiveWorkspaceName());
    window.addEventListener(ACTIVE_WORKSPACE_EVENT, sync);
    return () => window.removeEventListener(ACTIVE_WORKSPACE_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!accountId) {
      setAccountName(null);
      return;
    }

    let cancelled = false;

    void supabase
      .from("accounts")
      .select("name")
      .eq("id", accountId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setAccountName(data?.name ?? null);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return {
    workspaceLabel: companyName || accountName || "My Workspace",
    activeCompanyName: companyName,
    accountName,
  };
}
