import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { APP_ROLES, type AppRole, type Profile } from "@/types/domain";

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Pesan bila akun valid di Supabase Auth tetapi tidak punya profil aktif. */
  accessError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  hasRole: (...roles: AppRole[]) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data || !isAppRole(data.role)) return null;
  return {
    id: data.id as string,
    full_name: (data.full_name as string) ?? "",
    role: data.role,
    is_active: Boolean(data.is_active),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [accessError, setAccessError] = useState<string | null>(null);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setAccessError(null);
      return;
    }
    const p = await fetchProfile(s.user.id);
    if (!p) {
      setProfile(null);
      setAccessError(
        "Akun Anda belum terdaftar di SIPAR-BELU. Hubungi Super Admin.",
      );
    } else if (!p.is_active) {
      setProfile(null);
      setAccessError("Akun Anda dinonaktifkan. Hubungi Super Admin.");
    } else {
      setProfile(p);
      setAccessError(null);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Hindari memanggil Supabase langsung di dalam callback (risiko deadlock).
      setTimeout(() => {
        if (active) void loadProfile(s);
      }, 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback<AuthState["signIn"]>(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return {
        error:
          error.message === "Invalid login credentials"
            ? "Email atau kata sandi salah."
            : "Gagal masuk. Periksa koneksi lalu coba lagi.",
      };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const requestPasswordReset = useCallback<AuthState["requestPasswordReset"]>(
    async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      return { error: error ? "Gagal mengirim email pemulihan." : null };
    },
    [],
  );

  const updatePassword = useCallback<AuthState["updatePassword"]>(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error ? "Gagal mengubah kata sandi." : null };
  }, []);

  const hasRole = useCallback(
    (...roles: AppRole[]) => (profile ? roles.includes(profile.role) : false),
    [profile],
  );

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      accessError,
      signIn,
      signOut,
      requestPasswordReset,
      updatePassword,
      hasRole,
    }),
    [session, profile, loading, accessError, signIn, signOut, requestPasswordReset, updatePassword, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus dipakai di dalam <AuthProvider>");
  return ctx;
}
