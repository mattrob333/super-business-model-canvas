import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Resolves the current account_id for the authenticated user.
 *
 * Fetches the user's first `account_members` row (ordered by created_at)
 * to determine their active workspace. Returns the account_id string or
 * null if the user has no workspace membership yet.
 *
 * This is a temporary single-account resolver — when AccountSwitcher
 * becomes interactive, this hook will track the selected account.
 */
export function useAccountId() {
  const { user, loading: authLoading } = useAuth();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Key the lookup on the user id, never the user object: auth token
  // refreshes may deliver a new object for the same user, and re-entering the
  // loading state here unmounted whole pages mid-session (owner finding
  // 2026-07-08).
  const userId = user?.id ?? null;

  useEffect(() => {
    if (authLoading) return;

    if (!userId) {
      setAccountId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("account_members")
          .select("account_id")
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (!cancelled) {
          setAccountId(data?.account_id ?? null);
        }
      } catch (err) {
        console.error("Failed to resolve account_id:", err);
        if (!cancelled) {
          setAccountId(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, authLoading]);

  return { accountId, loading: authLoading || loading };
}
