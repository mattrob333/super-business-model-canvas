import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  adminLoading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);
  // Which user id the admin role was last checked for — token refreshes for
  // the SAME user must not re-enter the adminLoading state.
  const adminCheckedForUserId = useRef<string | null>(null);

  const checkAdminStatus = async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });

      setIsAdmin(!error && !!data);
    } catch (error) {
      console.error("Error checking admin status:", error);
      setIsAdmin(false);
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    // Token refreshes (e.g. returning to the browser tab) hand us a brand-new
    // session/user object for the SAME signed-in user. Swapping the user's
    // object identity on every refresh cascaded into effect re-runs and page
    // remounts downstream (owner finding 2026-07-08: the workspace thread
    // reset to a fresh chat and re-fired its auto-send). Keep the previous
    // object whenever the underlying value hasn't changed, and only re-check
    // the admin role for a genuinely different user.
    const applySession = (nextSession: Session | null, deferAdminCheck: boolean) => {
      setSession((prev) =>
        prev && nextSession && prev.access_token === nextSession.access_token
          ? prev
          : nextSession,
      );
      setUser((prev) =>
        prev && nextSession?.user && prev.id === nextSession.user.id
          ? prev
          : nextSession?.user ?? null,
      );

      const nextUserId = nextSession?.user?.id ?? null;
      if (nextUserId) {
        if (adminCheckedForUserId.current !== nextUserId) {
          adminCheckedForUserId.current = nextUserId;
          setAdminLoading(true);
          if (deferAdminCheck) {
            // Defer: supabase-js warns against making Supabase calls directly
            // inside the onAuthStateChange callback (can deadlock)
            setTimeout(() => void checkAdminStatus(nextUserId), 0);
          } else {
            void checkAdminStatus(nextUserId);
          }
        }
      } else {
        adminCheckedForUserId.current = null;
        setIsAdmin(false);
        setAdminLoading(false);
      }

      setLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession, true);
    });

    void supabase.auth.getSession().then(({ data: { session: existing } }) => {
      applySession(existing, false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/canvas`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    return { error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  }, []);

  // Stable context identity: consumers only re-render when a value actually
  // changed, never because the provider itself re-rendered.
  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      isAdmin,
      adminLoading,
      signUp,
      signIn,
      signOut,
    }),
    [user, session, loading, isAdmin, adminLoading, signUp, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
