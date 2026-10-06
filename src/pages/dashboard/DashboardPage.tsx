import { useQuery } from "@tanstack/react-query";
import {
  Activity,
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
import { formatDateTime } from "@/utils/format";
import { APP_FULL_NAME } from "@/types/domain";

export default function DashboardPage() {
  const stats = useQuery({ queryKey: ["dashboard", "stats"], queryFn: fetchDashboardStats });
  const activity = useQuery({ queryKey: ["dashboard", "activity"], queryFn: () => fetchRecentActivity(8) });

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
        <StatCard label="Total Perizinan" value={stats.data?.totalLicenses} icon={ClipboardList} loading={stats.isLoading} />
        <StatCard label="Izin Aktif" value={stats.data?.activeLicenses} icon={CheckCircle2} loading={stats.isLoading} />
        <StatCard label="Izin Berakhir" value={stats.data?.expiredLicenses} icon={CalendarClock} loading={stats.isLoading} />
        <StatCard label="Izin Dalam Proses" value={stats.data?.inProgressLicenses} icon={Hourglass} loading={stats.isLoading} />
        <StatCard label="Total Dokumen" value={stats.data?.totalDocuments} icon={FileStack} loading={stats.isLoading} />
        <StatCard label="Menunggu Verifikasi" value={stats.data?.pendingDocuments} icon={FileClock} loading={stats.isLoading} />
        <StatCard label="Arsip Bulan Ini" value={stats.data?.archivedThisMonth} icon={Activity} loading={stats.isLoading} />
      </section>

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
                    <span className="font-medium">{a.user_name ?? "Sistem"}</span> · {a.action}{" "}
                    <span className="text-muted-foreground">({a.module})</span>
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
    </>
  );
}
