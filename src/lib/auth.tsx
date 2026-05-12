import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "sam" | "manager" | "affiliate" | "customer";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  status: "active" | "suspended" | "pending";
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string; role?: AppRole | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadedFor = useRef<string | null>(null);

  const loadUserData = useCallback(async (uid: string, force = false) => {
    if (!force && loadedFor.current === uid) return role;
    setLoading(true);
    try {
      const [{ data: profileData }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select("id,email,full_name,avatar_url,status").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      const roles = ((roleRows ?? []) as { role: AppRole }[]).map((r) => r.role);
      const rolePriority: AppRole[] = ["super_admin", "sam", "manager", "affiliate", "customer"];
      const resolvedRole = rolePriority.find((candidate) => roles.includes(candidate)) ?? null;
      setProfile(profileData as Profile | null);
      setRole(resolvedRole);
      loadedFor.current = uid;
      return resolvedRole;
    } catch (error) {
      console.error("Failed to load signed-in user data", error);
      loadedFor.current = null;
      setProfile(null);
      setRole(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    // CRITICAL: set listener BEFORE getSession
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // defer to avoid deadlock; dedup via loadedFor ref
        setTimeout(() => loadUserData(sess.user.id), 0);
      } else {
        loadedFor.current = null;
        setProfile(null);
        setRole(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      const sess = data.session;
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        void loadUserData(sess.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [loadUserData]);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      return { error: error.message };
    }
    if (data.user) {
      setSession(data.session);
      setUser(data.user);
      const loadedRole = await loadUserData(data.user.id, true);
      return { role: loadedRole };
    } else {
      setLoading(false);
    }
    return {};
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName },
      },
    });
    return { error: error?.message };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refresh = async () => {
    if (user) {
      loadedFor.current = null;
      await loadUserData(user.id);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, role, loading, signIn, signUp, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  sam: "Super Admin Manager",
  manager: "Manager",
  affiliate: "Affiliate",
  customer: "Customer",
};

export const ROLE_HOME: Record<AppRole, string> = {
  super_admin: "/admin",
  sam: "/sam",
  manager: "/manager",
  affiliate: "/affiliate",
  customer: "/affiliate",
};
