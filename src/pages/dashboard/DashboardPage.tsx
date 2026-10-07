import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlarmClock,
  Bell,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileClock,
  FileStack,
  Hourglass,
} from "lucide-react";
import { fetchDashboardStats, fetchRecentActivity } from "@/services/dashboard";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "./StatCard";
import { formatDateTime, formatRelative } from "@/utils/format";
import { Link } from "react-router-dom";
import { listNotifications } from "@/services/notifications";
import { NotifIcon } from "@/pages/notifications/NotifIcon";
import { APP_FULL_NAME } from "@/types/domain";
import { useAuth } from "@/hooks/useAuth";

export default function DashboardPage() {
  const { hasRole } = useAuth();
  // Tautan kartu hanya ke halaman yang boleh dibuka role ini.
  const pendingLink = hasRole("super_admin", "verifikator") ? "/verifikasi" : "/arsip?f_status=MENUNGGU_VERIFIKASI";
  const reportLink = hasRole("viewer") ? undefined : "/laporan?jenis=berlaku";
  const stats = useQuery({ queryKey: ["dashboard", "stats"], queryFn: fetchDashboardStats });
  // Audit Log hanya boleh dibaca Super Admin, Admin Arsip, Pimpinan (RLS); role lain melihat notifikasinya.
  const canAudit = hasRole("super_admin", "admin_arsip", "pimpinan");
  const activity = useQuery({ queryKey: ["dashboard", "activity"], queryFn: () => fetchRecentActivity(8), enabled: canAudit });

  return (
    <>
      <PageHeader title="Dashboard" description={APP_FULL_NAME} />

      {stats.isError ? (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Data statistik belum dapat dimuat.</p>
            <p className="mt-0.5 text-amber-800">
              Pastikan migrasi database (Fase 2) sudah dijalankan di Supabase dan akun Anda memiliki hak akses.
            </p>
          </div>
        </div>
      ) : null}

      <section aria-label="Ringkasan" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Perizinan" value={stats.data?.totalLicenses} icon={ClipboardList} loading={stats.isLoading} to="/perizinan" />
        <StatCard label="Izin Aktif" value={stats.data?.activeLicenses} icon={CheckCircle2} loading={stats.isLoading} />
        <StatCard label="Izin Berakhir" value={stats.data?.expiredLicenses} icon={CalendarClock} loading={stats.isLoading} />
        <StatCard label="Izin Dalam Proses" value={stats.data?.inProgressLicenses} icon={Hourglass} loading={stats.isLoading} />
        <StatCard label="Total Dokumen" value={stats.data?.totalDocuments} icon={FileStack} loading={stats.isLoading} />
        <StatCard label="Menunggu Verifikasi" value={stats.data?.pendingDocuments} icon={FileClock} loading={stats.isLoading} to={pendingLink} />
        <StatCard label="Arsip Bulan Ini" value={stats.data?.archivedThisMonth} icon={Activity} loading={stats.isLoading} to="/arsip" />
        <StatCard
          label="Akan Berakhir (30 hari)"
          value={stats.data?.expiringSoon}
          icon={AlarmClock}
          loading={stats.isLoading}
          to={reportLink}
        />
      </section>

      {!canAudit ? (
        <RecentNotifications />
      ) : (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Aktivitas Terbaru</CardTitle>
          <CardDescription>Dicatat otomatis oleh sistem (audit trail).</CardDescription>
        </CardHeader>
        <CardContent>
          {activity.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : activity.isError ? (
            <p role="alert" className="text-sm text-muted-foreground">
              Aktivitas belum dapat dimuat (tabel audit belum tersedia atau akses terbatas).
            </p>
          ) : (activity.data?.length ?? 0) === 0 ? (
            <EmptyState icon={Activity} title="Belum ada aktivitas" description="Aktivitas pengguna akan muncul di sini." />
          ) : (
            <ul className="divide-y">
              {activity.data!.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                  <span>
                    <span className="font-medium">{a.user_name ?? "Sistem"}</span> · {a.description ?? a.action}
                  </span>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={a.created_at}>
                    {formatDateTime(a.created_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      )}
    </>
  );
}

function RecentNotifications() {
  const q = useQuery({ queryKey: ["notifications", "latest"], queryFn: () => listNotifications({ limit: 5 }) });
  return (
    <Card className="mt-6">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Pemberitahuan Terbaru</CardTitle>
          <CardDescription>Perkembangan permohonan yang terkait dengan Anda.</CardDescription>
        </div>
        <Link to="/notifikasi" className="text-sm font-medium text-accent hover:underline">
          Lihat semua
        </Link>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !q.data?.rows.length ? (
          <EmptyState icon={Bell} title="Belum ada pemberitahuan" description="Pemberitahuan muncul saat ada perubahan pada permohonan Anda." />
        ) : (
          <ul className="divide-y">
            {q.data.rows.map((n) => (
              <li key={n.id} className="flex items-start gap-3 py-3 text-sm">
                <NotifIcon type={n.type} />
                <div className="min-w-0 flex-1">
                  {n.link ? (
                    <Link to={n.link} className={n.is_read ? "hover:underline" : "font-semibold text-navy-900 hover:underline"}>
                      {n.title}
                    </Link>
                  ) : (
                    <span className={n.is_read ? "" : "font-semibold text-navy-900"}>{n.title}</span>
                  )}
                  {n.body ? <p className="truncate text-muted-foreground">{n.body}</p> : null}
                </div>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={n.created_at}>
                  {formatRelative(n.created_at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
