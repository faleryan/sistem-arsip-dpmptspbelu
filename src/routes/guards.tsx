import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { FullPageSpinner } from "@/components/shared/FullPageSpinner";
import { ConfigMissing } from "@/components/shared/ConfigMissing";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { AppRole } from "@/types/domain";

/** Hanya untuk pengguna yang sudah login dan punya profil aktif. */
export function ProtectedRoute() {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (!isSupabaseConfigured) return <ConfigMissing />;
  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  // Sesi ada tetapi profil tidak ada/nonaktif → kembali ke login dengan pesan.
  if (!profile) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Untuk halaman yang hanya boleh dibuka role tertentu. */
export function RoleGuard({ roles }: { roles: AppRole[] }) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) return <Navigate to="/tidak-berwenang" replace />;
  return <Outlet />;
}

/** Halaman login/lupa password: jika sudah login, arahkan ke dashboard. */
export function GuestRoute() {
  const { session, profile, loading } = useAuth();
  if (!isSupabaseConfigured) return <ConfigMissing />;
  if (loading) return <FullPageSpinner />;
  if (session && profile) return <Navigate to="/" replace />;
  return <Outlet />;
}
