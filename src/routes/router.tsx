import { createBrowserRouter } from "react-router-dom";
import { GuestRoute, ProtectedRoute, RoleGuard } from "./guards";
import { AppLayout } from "@/layouts/AppLayout";
import LoginPage from "@/pages/auth/LoginPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import ComingSoonPage from "@/pages/shared/ComingSoonPage";
import NotFoundPage from "@/pages/shared/NotFoundPage";

export const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/lupa-password", element: <ForgotPasswordPage /> },
    ],
  },
  // Dapat dibuka dengan sesi pemulihan dari email (tidak lewat GuestRoute/ProtectedRoute).
  { path: "/reset-password", element: <ResetPasswordPage /> },

  // Halaman verifikasi QR publik (tanpa login) ditambahkan di Fase 6: /verify/:code

  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "pencarian", element: <ComingSoonPage title="Pencarian Arsip" phase={6} /> },
          { path: "perizinan/*", element: <ComingSoonPage title="Data Perizinan" phase={3} /> },
          { path: "pemohon/*", element: <ComingSoonPage title="Pemohon" phase={3} /> },
          { path: "perusahaan/*", element: <ComingSoonPage title="Perusahaan" phase={3} /> },
          { path: "arsip/*", element: <ComingSoonPage title="Arsip Digital" phase={4} /> },
          {
            element: <RoleGuard roles={["super_admin", "admin_arsip", "petugas", "verifikator", "pimpinan"]} />,
            children: [{ path: "laporan", element: <ComingSoonPage title="Laporan" phase={6} /> }],
          },
          { path: "notifikasi", element: <ComingSoonPage title="Notifikasi" phase={6} /> },
          { path: "master/*", element: <ComingSoonPage title="Master Data" phase={3} /> },
          {
            element: <RoleGuard roles={["super_admin"]} />,
            children: [
              { path: "pengguna/*", element: <ComingSoonPage title="Pengguna & Role" phase={2} /> },
              { path: "pengaturan", element: <ComingSoonPage title="Pengaturan" phase={7} /> },
            ],
          },
          {
            element: <RoleGuard roles={["super_admin", "admin_arsip", "pimpinan"]} />,
            children: [{ path: "audit", element: <ComingSoonPage title="Audit Log" phase={5} /> }],
          },
          { path: "tidak-berwenang", element: <NotFoundPage forbidden /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
