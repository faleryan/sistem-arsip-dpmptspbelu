import { supabase } from "@/lib/supabase";

export type DashboardStats = {
  totalLicenses: number;
  activeLicenses: number;
  expiredLicenses: number;
  inProgressLicenses: number;
  totalDocuments: number;
  pendingDocuments: number;
  archivedThisMonth: number;
};

export type ActivityItem = {
  id: number;
  user_name: string | null;
  action: string;
  description: string | null;
  module: string;
  created_at: string;
};

// Tipe database belum dibangkitkan (Fase 2), sehingga builder query diketik longgar.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filter = (q: any) => any;

async function count(table: "licenses" | "documents", filter?: Filter): Promise<number> {
  const base = supabase.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null);
  const { count: n, error } = await (filter ? filter(base) : base);
  if (error) throw new Error(error.message);
  return (n as number | null) ?? 0;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    totalLicenses,
    activeLicenses,
    expiredLicenses,
    inProgressLicenses,
    totalDocuments,
    pendingDocuments,
    archivedThisMonth,
  ] = await Promise.all([
    count("licenses"),
    count("licenses", (q) => q.eq("status", "AKTIF")),
    count("licenses", (q) => q.eq("status", "BERAKHIR")),
    count("licenses", (q) => q.in("status", ["DIAJUKAN", "VERIFIKASI", "DISETUJUI"])),
    count("documents"),
    count("documents", (q) => q.eq("status", "MENUNGGU_VERIFIKASI")),
    count("documents", (q) => q.gte("created_at", monthStart.toISOString())),
  ]);

  return {
    totalLicenses,
    activeLicenses,
    expiredLicenses,
    inProgressLicenses,
    totalDocuments,
    pendingDocuments,
    archivedThisMonth,
  };
}

export async function fetchRecentActivity(limit = 8): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, user_name, action, description, module, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ActivityItem[];
}
