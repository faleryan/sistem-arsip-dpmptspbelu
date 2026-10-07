/**
 * Data yang dihapus lunak (deleted_at terisi). Hanya Super Admin & Admin Arsip yang dapat melihatnya (RLS).
 * Pemulihan: izin/pemohon/perusahaan hanya Super Admin; dokumen Super Admin & Admin Arsip, dan izinnya
 * harus aktif (tidak terhapus). Aturan ini ditegakkan trigger guard_soft_delete + RLS.
 */
import { supabase } from "@/lib/supabase";
import { AppError, check } from "@/lib/errors";
import type { ListSpec } from "./listQuery";

export type TrashKind = "licenses" | "applicants" | "businesses" | "documents";

const onlyDeleted: ListSpec["apply"] = (q) => q.not("deleted_at", "is", null);

export const TRASH_SPECS: Record<TrashKind, ListSpec> = {
  licenses: {
    table: "licenses",
    select:
      "id, application_number, license_number, status, deleted_at, license_type:license_types(name), applicant:applicants(full_name)",
    searchColumns: ["application_number", "license_number"],
    defaultSort: { field: "deleted_at", asc: false },
    sortable: ["deleted_at", "application_number", "license_number"],
    apply: onlyDeleted,
  },
  applicants: {
    table: "applicants",
    select: "id, full_name, nik, phone, deleted_at",
    searchColumns: ["full_name", "nik"],
    defaultSort: { field: "deleted_at", asc: false },
    sortable: ["deleted_at", "full_name"],
    apply: onlyDeleted,
  },
  businesses: {
    table: "businesses",
    select: "id, name, nib, entity_type, deleted_at",
    searchColumns: ["name", "nib"],
    defaultSort: { field: "deleted_at", asc: false },
    sortable: ["deleted_at", "name"],
    apply: onlyDeleted,
  },
  documents: {
    table: "documents",
    select:
      "id, title, document_number, status, deleted_at, document_type:document_types(name), license:licenses(id, application_number, license_number, deleted_at)",
    searchColumns: ["title", "document_number"],
    defaultSort: { field: "deleted_at", asc: false },
    sortable: ["deleted_at", "title"],
    apply: onlyDeleted,
  },
};

export async function restoreRow(kind: TrashKind, id: string): Promise<void> {
  const rows = check(await supabase.from(kind).update({ deleted_at: null }).eq("id", id).select("id")) as { id: string }[];
  // RLS menyaring baris tanpa galat bila tidak berwenang.
  if (!rows.length) {
    throw new AppError(
      kind === "documents"
        ? "Dokumen tidak dapat dipulihkan. Pastikan izinnya tidak sedang terhapus."
        : "Anda tidak berwenang memulihkan data ini.",
    );
  }
}
