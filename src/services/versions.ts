import { supabase } from "@/lib/supabase";
import { check } from "@/lib/errors";

export type Verification = {
  id: string;
  result: "TERVERIFIKASI" | "DITOLAK";
  note: string | null;
  verified_by: string | null;
  verified_at: string;
};

export type VersionRow = {
  id: string;
  version_no: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  checksum_sha256: string | null;
  is_current: boolean;
  uploaded_by: string | null;
  uploaded_at: string;
  /** Kosong untuk Viewer (RLS document_verifications hanya untuk internal). */
  verifications: Verification[];
};

/** Semua versi sebuah dokumen, terbaru dulu, beserta hasil verifikasinya. */
export async function listVersions(documentId: string): Promise<VersionRow[]> {
  const rows = check(
    await supabase
      .from("document_versions")
      .select(
        "id, version_no, file_name, mime_type, size_bytes, storage_path, checksum_sha256, is_current, uploaded_by, uploaded_at, verifications:document_verifications(id, result, note, verified_by, verified_at)",
      )
      .eq("document_id", documentId)
      .order("version_no", { ascending: false }),
  ) as unknown as VersionRow[];
  for (const r of rows) r.verifications = [...(r.verifications ?? [])].sort((a, b) => b.verified_at.localeCompare(a.verified_at));
  return rows;
}

/**
 * Verifikasi versi aktif dokumen lewat fungsi workflow verify_document():
 * status dokumen, status izin (Diajukan → Verifikasi), riwayat, dan notifikasi berubah satu paket.
 */
export async function verifyDocument(versionId: string, result: "TERVERIFIKASI" | "DITOLAK", note: string | null): Promise<void> {
  check(await supabase.rpc("verify_document", { p_version_id: versionId, p_result: result, p_note: note }));
}
