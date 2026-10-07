import { supabase } from "@/lib/supabase";
import { check } from "@/lib/errors";
import { addDays, witaStartOfDay } from "@/utils/date";
import type { ListSpec } from "./listQuery";

export type AuditRow = {
  id: number;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  action: string;
  description: string | null;
  module: string;
  record_id: string | null;
  ip_address: string | null;
  created_at: string;
};

export type AuditDetail = AuditRow & {
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  user_agent: string | null;
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  CREATE: "Tambah",
  UPDATE: "Ubah",
  DELETE: "Hapus",
  RESTORE: "Pulihkan",
  STATUS_CHANGE: "Ubah status",
  UPLOAD: "Unggah",
  VERIFY: "Verifikasi",
};

/** Warna lencana aksi (kunci STATUS_TONE dipakai ulang lewat status semu). */
export const AUDIT_ACTION_TONE: Record<string, string> = {
  CREATE: "AKTIF",
  UPDATE: "DIAJUKAN",
  DELETE: "DITOLAK",
  RESTORE: "VERIFIKASI",
  STATUS_CHANGE: "DISETUJUI",
  UPLOAD: "DRAFT",
  VERIFY: "TERVERIFIKASI",
};

export const AUDIT_MODULE_LABEL: Record<string, string> = {
  licenses: "Perizinan",
  applicants: "Pemohon",
  businesses: "Perusahaan",
  documents: "Dokumen",
  document_versions: "Versi dokumen",
  document_verifications: "Verifikasi dokumen",
  profiles: "Pengguna",
  role_permissions: "Hak akses role",
  license_types: "Jenis izin",
  document_types: "Jenis dokumen",
  archive_classes: "Klasifikasi arsip",
  districts: "Kecamatan",
  villages: "Desa/kelurahan",
  units: "Unit/bidang",
  system_settings: "Pengaturan",
};

const LIST_SELECT = "id, user_id, user_name, user_role, action, description, module, record_id, ip_address, created_at";

export const auditSpec: ListSpec = {
  table: "audit_logs",
  select: LIST_SELECT,
  searchColumns: ["description", "user_name", "record_id"],
  defaultSort: { field: "created_at", asc: false },
  sortable: ["created_at", "action", "module", "user_name"],
  apply: (q, f) => {
    if (f.action) q = q.eq("action", f.action);
    if (f.module) q = q.eq("module", f.module);
    if (f.user) q = q.eq("user_id", f.user);
    if (f.record) q = q.eq("record_id", f.record);
    if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) q = q.gte("created_at", witaStartOfDay(f.from));
    if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) q = q.lt("created_at", witaStartOfDay(addDays(f.to, 1)!));
    return q;
  },
};

export async function getAuditEntry(id: number): Promise<AuditDetail> {
  return check(
    await supabase.from("audit_logs").select(`${LIST_SELECT}, old_value, new_value, user_agent`).eq("id", id).single(),
  ) as AuditDetail;
}

/**
 * Halaman aplikasi untuk data yang dicatat, bila ada. Dokumen/versi/verifikasi diarahkan ke izinnya.
 * Mengembalikan null bila data tidak dapat ditemukan (mis. sudah tidak ada).
 */
export async function resolveRecordLink(module: string, recordId: string | null): Promise<string | null> {
  if (!recordId) return null;
  const direct: Record<string, string> = { licenses: "/perizinan/", applicants: "/pemohon/", businesses: "/perusahaan/" };
  if (direct[module]) return direct[module] + recordId;

  let documentId: string | null = null;
  if (module === "documents") documentId = recordId;
  if (module === "document_versions" || module === "document_verifications") {
    let versionId = recordId;
    if (module === "document_verifications") {
      const r = await supabase.from("document_verifications").select("document_version_id").eq("id", recordId).maybeSingle();
      versionId = (r.data as { document_version_id?: string } | null)?.document_version_id ?? "";
    }
    if (versionId) {
      const v = await supabase.from("document_versions").select("document_id").eq("id", versionId).maybeSingle();
      documentId = (v.data as { document_id?: string } | null)?.document_id ?? null;
    }
  }
  if (documentId) {
    const d = await supabase.from("documents").select("license_id").eq("id", documentId).maybeSingle();
    const lic = (d.data as { license_id?: string } | null)?.license_id;
    return lic ? `/perizinan/${lic}` : null;
  }
  if (["license_types", "document_types", "archive_classes", "districts", "villages", "units"].includes(module)) {
    const slug: Record<string, string> = {
      license_types: "jenis-izin",
      document_types: "jenis-dokumen",
      archive_classes: "klasifikasi-arsip",
      districts: "kecamatan",
      villages: "desa",
      units: "unit",
    };
    return `/master/${slug[module]}`;
  }
  if (module === "profiles" || module === "role_permissions") return "/pengguna";
  return null;
}

/** Nama kolom yang lebih mudah dibaca pada tabel perubahan. */
export const FIELD_LABEL: Record<string, string> = {
  status: "Status",
  title: "Judul",
  document_number: "Nomor dokumen",
  document_date: "Tanggal dokumen",
  license_number: "Nomor izin",
  application_number: "Nomor permohonan",
  issue_date: "Tanggal terbit",
  expiry_date: "Berlaku sampai",
  application_date: "Tanggal permohonan",
  full_name: "Nama",
  name: "Nama",
  nik: "NIK",
  nib: "NIB",
  npwp: "NPWP",
  phone: "Telepon",
  email: "Email",
  address: "Alamat",
  notes: "Catatan",
  deleted_at: "Dihapus pada",
  role: "Role",
  is_active: "Aktif",
  file_name: "Nama file",
  version_no: "Versi",
  size_bytes: "Ukuran (byte)",
  mime_type: "Jenis file",
  result: "Hasil",
  note: "Catatan",
};
