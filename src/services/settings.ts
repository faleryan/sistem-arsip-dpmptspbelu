/**
 * Pengaturan sistem (tabel system_settings) dan pemeriksaan integritas Storage.
 * Hak ubah ditegakkan di database: policy RLS (hanya super_admin) + trigger validasi nilai.
 */
import { supabase } from "@/lib/supabase";
import { AppError } from "@/lib/errors";
import { AGENCY_NAME } from "@/types/domain";
import { BUCKET } from "./storage";

export type Settings = {
  agency_name: string;
  agency_short_name: string;
  max_upload_mb: number;
  expiry_warning_days: number;
};
export type SettingKey = keyof Settings;

export const SETTING_DEFAULTS: Settings = {
  agency_name: AGENCY_NAME,
  agency_short_name: "DPMPTSP Kabupaten Belu",
  max_upload_mb: 10,
  expiry_warning_days: 30,
};

export type SettingsRow = { key: SettingKey; value: unknown; updated_at: string; updated_by: string | null };

export async function fetchSettings(): Promise<{ values: Settings; rows: SettingsRow[] }> {
  const { data, error } = await supabase.from("system_settings").select("key, value, updated_at, updated_by");
  if (error) throw error;
  const rows = (data ?? []) as SettingsRow[];
  const values = { ...SETTING_DEFAULTS };
  for (const r of rows) {
    if (r.key in values) {
      const def = SETTING_DEFAULTS[r.key];
      if (typeof def === "number" && typeof r.value === "number") (values[r.key] as number) = r.value;
      if (typeof def === "string" && typeof r.value === "string" && r.value.trim()) (values[r.key] as string) = r.value;
    }
  }
  return { values, rows };
}

/** Simpan hanya kunci yang berubah. Setiap baris divalidasi trigger di database. */
export async function saveSettings(changes: Partial<Settings>): Promise<number> {
  let n = 0;
  for (const [key, value] of Object.entries(changes) as [SettingKey, Settings[SettingKey]][]) {
    const { data, error } = await supabase.from("system_settings").update({ value }).eq("key", key).select("key");
    if (error) throw error;
    if (!data?.length) throw new AppError("Anda tidak berwenang mengubah pengaturan.", "FORBIDDEN");
    n++;
  }
  return n;
}

export type IntegrityRow = {
  kind: "FILE_YATIM" | "FILE_HILANG";
  storage_path: string;
  size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
  license_id: string | null;
  license_label: string | null;
  deletable: boolean;
};

export async function storageIntegrityReport(): Promise<IntegrityRow[]> {
  const { data, error } = await supabase.rpc("storage_integrity_report");
  if (error) throw error;
  return (data ?? []) as IntegrityRow[];
}

/**
 * Hapus file yatim. Policy Storage hanya mengizinkan Super Admin menghapus objek tanpa versi
 * dokumen yang berumur > 1 jam; objek lain diabaikan diam-diam oleh RLS, jadi hasilnya dihitung.
 */
export async function deleteOrphans(paths: string[]): Promise<{ deleted: number; skipped: number }> {
  if (!paths.length) return { deleted: 0, skipped: 0 };
  const { data, error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw error;
  const deleted = data?.length ?? 0;
  return { deleted, skipped: paths.length - deleted };
}
