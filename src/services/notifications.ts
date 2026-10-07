/**
 * Notifikasi milik pengguna yang login. Baris dibuat oleh database (trigger/fungsi workflow);
 * klien hanya boleh membaca, menandai dibaca (kolom is_read), dan menghapus miliknya (RLS).
 */
import { supabase } from "@/lib/supabase";
import { check, toAppError } from "@/lib/errors";

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

const SELECT = "id, type, title, body, link, is_read, created_at";

export async function countUnread(): Promise<number> {
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false);
  if (error) throw toAppError(error);
  return count ?? 0;
}

export async function listNotifications(opts: { limit: number; offset?: number; onlyUnread?: boolean; type?: string }) {
  let q = supabase
    .from("notifications")
    .select(SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (opts.onlyUnread) q = q.eq("is_read", false);
  if (opts.type) q = q.eq("type", opts.type);
  const from = opts.offset ?? 0;
  const { data, count, error } = await q.range(from, from + opts.limit - 1);
  if (error) throw toAppError(error);
  return { rows: (data ?? []) as Notification[], total: count ?? 0 };
}

export async function setRead(id: string, isRead = true): Promise<void> {
  check(await supabase.from("notifications").update({ is_read: isRead }).eq("id", id));
}

export async function markAllRead(): Promise<void> {
  check(await supabase.from("notifications").update({ is_read: true }).eq("is_read", false));
}

export async function deleteNotification(id: string): Promise<void> {
  check(await supabase.from("notifications").delete().eq("id", id));
}

export async function deleteReadNotifications(): Promise<void> {
  check(await supabase.from("notifications").delete().eq("is_read", true));
}

/** Jenis notifikasi yang dibuat database (lihat 0003_functions_triggers.sql). */
export const NOTIF_TYPE_LABEL: Record<string, string> = {
  izin_diajukan: "Permohonan diajukan",
  dokumen_menunggu: "Dokumen menunggu verifikasi",
  dokumen_ditolak: "Dokumen ditolak",
  dokumen_terverifikasi: "Dokumen terverifikasi",
  izin_disetujui: "Izin disetujui",
  izin_ditolak: "Permohonan ditolak",
  izin_terbit: "Izin diterbitkan",
  izin_akan_berakhir: "Izin akan berakhir",
  izin_berakhir: "Izin berakhir",
};
