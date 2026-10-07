import { Navigate, createBrowserRouter } from "react-router-dom";
import { GuestRoute, ProtectedRoute, RoleGuard } from "./guards";
import { AppLayout } from "@/layouts/AppLayout";
import LoginPage from "@/pages/auth/LoginPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import UsersPage from "@/pages/users/UsersPage";
import LicensesPage from "@/pages/licenses/LicensesPage";
import LicenseDetailPage from "@/pages/licenses/LicenseDetailPage";
import { LicenseCreatePage, LicenseEditPage } from "@/pages/licenses/LicenseFormPage";
import ApplicantsPage from "@/pages/applicants/ApplicantsPage";
import ApplicantDetailPage from "@/pages/applicants/ApplicantDetailPage";
import BusinessesPage from "@/pages/businesses/BusinessesPage";
import BusinessDetailPage from "@/pages/businesses/BusinessDetailPage";
import MasterDataPage from "@/pages/master/MasterDataPage";
import ArchivePage from "@/pages/documents/ArchivePage";
import VerificationQueuePage from "@/pages/verification/VerificationQueuePage";
import AuditLogPage from "@/pages/audit/AuditLogPage";
import TrashPage from "@/pages/trash/TrashPage";
import VerifyPage from "@/pages/verify/VerifyPage";
import QrPrintPage from "@/pages/licenses/QrPrintPage";
import NotificationsPage from "@/pages/notifications/NotificationsPage";
import ReportsPage from "@/pages/reports/ReportsPage";
import SearchPage from "@/pages/search/SearchPage";
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

  // Halaman verifikasi QR publik — tanpa login, tanpa layout aplikasi.
  { path: "/verify", element: <VerifyPage /> },
  { path: "/verify/:code", element: <VerifyPage /> },

  {
    element: <ProtectedRoute />,
    children: [
      // Halaman cetak (tanpa sidebar/topbar), hanya role internal.
      {
        element: <RoleGuard roles={["super_admin", "admin_arsip", "petugas", "verifikator", "pimpinan"]} />,
        children: [{ path: "/cetak/qr/:id", element: <QrPrintPage /> }],
      },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "pencarian", element: <SearchPage /> },
          { path: "perizinan", element: <LicensesPage /> },
          { path: "perizinan/:id", element: <LicenseDetailPage /> },
          {
            element: <RoleGuard roles={["super_admin", "admin_arsip", "petugas"]} />,
            children: [
              { path: "perizinan/baru", element: <LicenseCreatePage /> },
              { path: "perizinan/:id/ubah", element: <LicenseEditPage /> },
            ],
          },
          {
            // Viewer tidak membaca tabel pemohon/perusahaan (RLS); namanya tetap tampil di data izin.
            element: <RoleGuard roles={["super_admin", "admin_arsip", "petugas", "verifikator", "pimpinan"]} />,
            children: [
              { path: "pemohon", element: <ApplicantsPage /> },
              { path: "pemohon/:id", element: <ApplicantDetailPage /> },
              { path: "perusahaan", element: <BusinessesPage /> },
              { path: "perusahaan/:id", element: <BusinessDetailPage /> },
            ],
          },
          { path: "arsip", element: <ArchivePage /> },
          {
            element: <RoleGuard roles={["super_admin", "admin_arsip", "petugas", "verifikator", "pimpinan"]} />,
            children: [{ path: "laporan", element: <ReportsPage /> }],
          },
          { path: "notifikasi", element: <NotificationsPage /> },
          { path: "master", element: <Navigate to="/master/jenis-izin" replace /> },
          { path: "master/:slug", element: <MasterDataPage /> },
          {
            element: <RoleGuard roles={["super_admin"]} />,
            children: [
              { path: "pengguna", element: <UsersPage /> },
              { path: "pengaturan", element: <ComingSoonPage title="Pengaturan" phase={7} /> },
            ],
          },
          {
            element: <RoleGuard roles={["super_admin", "admin_arsip", "pimpinan"]} />,
            children: [{ path: "audit", element: <AuditLogPage /> }],
          },
          {
            element: <RoleGuard roles={["super_admin", "verifikator"]} />,
            children: [{ path: "verifikasi", element: <VerificationQueuePage /> }],
          },
          {
            element: <RoleGuard roles={["super_admin", "admin_arsip"]} />,
            children: [{ path: "terhapus", element: <TrashPage /> }],
          },
          { path: "tidak-berwenang", element: <NotFoundPage forbidden /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
