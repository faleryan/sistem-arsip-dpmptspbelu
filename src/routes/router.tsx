import type { ComponentType } from "react";
import { Navigate, createBrowserRouter, type RouteObject } from "react-router-dom";
import { GuestRoute, ProtectedRoute, RoleGuard } from "./guards";
import { AppLayout } from "@/layouts/AppLayout";
import { FullPageSpinner } from "@/components/shared/FullPageSpinner";
import LoginPage from "@/pages/auth/LoginPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import RouteErrorPage from "@/pages/shared/RouteErrorPage";
import NotFoundPage from "@/pages/shared/NotFoundPage";
import type { AppRole } from "@/types/domain";

/**
 * Setiap halaman dimuat saat dibuka (code splitting per rute) agar unduhan awal kecil.
 * Galat pemuatan (mis. file lama hilang setelah deploy) ditangani RouteErrorPage.
 */
type Loader = () => Promise<Record<string, unknown>>;
const page = (load: Loader, name = "default"): Pick<RouteObject, "lazy"> => ({
  lazy: async () => {
    const mod = await load();
    if (!mod?.[name]) throw new Error(`Failed to fetch dynamically imported module (${name})`);
    return { Component: mod[name] as ComponentType };
  },
});

const INTERNAL: AppRole[] = ["super_admin", "admin_arsip", "petugas", "verifikator", "pimpinan"];

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <FullPageSpinner />,
    children: [
      {
        element: <GuestRoute />,
        children: [
          { path: "/login", element: <LoginPage /> },
          { path: "/lupa-password", element: <ForgotPasswordPage /> },
        ],
      },
      // Dapat dibuka dengan sesi pemulihan dari email (tidak lewat GuestRoute/ProtectedRoute).
      { path: "/reset-password", element: <ResetPasswordPage /> },

      // Halaman verifikasi QR publik — tanpa login, tanpa layout aplikasi.
      { path: "/verify", ...page(() => import("@/pages/verify/VerifyPage")) },
      { path: "/verify/:code", ...page(() => import("@/pages/verify/VerifyPage")) },

      {
        element: <ProtectedRoute />,
        children: [
          // Halaman cetak (tanpa sidebar/topbar), hanya role internal.
          {
            element: <RoleGuard roles={INTERNAL} />,
            children: [{ path: "/cetak/qr/:id", ...page(() => import("@/pages/licenses/QrPrintPage")) }],
          },
          {
            element: <AppLayout />,
            children: [
              {
                // Galat di dalam halaman tidak menghilangkan sidebar & topbar.
                errorElement: <RouteErrorPage />,
                children: [
                  { index: true, ...page(() => import("@/pages/dashboard/DashboardPage")) },
                  { path: "pencarian", ...page(() => import("@/pages/search/SearchPage")) },
                  { path: "perizinan", ...page(() => import("@/pages/licenses/LicensesPage")) },
                  { path: "perizinan/:id", ...page(() => import("@/pages/licenses/LicenseDetailPage")) },
                  {
                    element: <RoleGuard roles={["super_admin", "admin_arsip", "petugas"]} />,
                    children: [
                      { path: "perizinan/baru", ...page(() => import("@/pages/licenses/LicenseFormPage"), "LicenseCreatePage") },
                      { path: "perizinan/:id/ubah", ...page(() => import("@/pages/licenses/LicenseFormPage"), "LicenseEditPage") },
                    ],
                  },
                  {
                    // Viewer tidak membaca tabel pemohon/perusahaan (RLS); namanya tetap tampil di data izin.
                    element: <RoleGuard roles={INTERNAL} />,
                    children: [
                      { path: "pemohon", ...page(() => import("@/pages/applicants/ApplicantsPage")) },
                      { path: "pemohon/:id", ...page(() => import("@/pages/applicants/ApplicantDetailPage")) },
                      { path: "perusahaan", ...page(() => import("@/pages/businesses/BusinessesPage")) },
                      { path: "perusahaan/:id", ...page(() => import("@/pages/businesses/BusinessDetailPage")) },
                      { path: "laporan", ...page(() => import("@/pages/reports/ReportsPage")) },
                    ],
                  },
                  { path: "arsip", ...page(() => import("@/pages/documents/ArchivePage")) },
                  { path: "notifikasi", ...page(() => import("@/pages/notifications/NotificationsPage")) },
                  { path: "master", element: <Navigate to="/master/jenis-izin" replace /> },
                  { path: "master/:slug", ...page(() => import("@/pages/master/MasterDataPage")) },
                  {
                    element: <RoleGuard roles={["super_admin"]} />,
                    children: [
                      { path: "pengguna", ...page(() => import("@/pages/users/UsersPage")) },
                      { path: "pengaturan", ...page(() => import("@/pages/settings/SettingsPage")) },
                    ],
                  },
                  {
                    element: <RoleGuard roles={["super_admin", "admin_arsip", "pimpinan"]} />,
                    children: [{ path: "audit", ...page(() => import("@/pages/audit/AuditLogPage")) }],
                  },
                  {
                    element: <RoleGuard roles={["super_admin", "verifikator"]} />,
                    children: [{ path: "verifikasi", ...page(() => import("@/pages/verification/VerificationQueuePage")) }],
                  },
                  {
                    element: <RoleGuard roles={["super_admin", "admin_arsip"]} />,
                    children: [{ path: "terhapus", ...page(() => import("@/pages/trash/TrashPage")) }],
                  },
                  { path: "tidak-berwenang", element: <NotFoundPage forbidden /> },
                  { path: "*", element: <NotFoundPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
