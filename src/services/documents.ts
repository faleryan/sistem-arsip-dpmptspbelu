import { supabase } from "@/lib/supabase";
import { AppError, check } from "@/lib/errors";
import { HARD_MAX_BYTES, buildStoragePath, sha256Hex, validateArchiveFile } from "@/lib/files";
import type { DocumentRow } from "@/types/entities";
import type { ListSpec } from "./listQuery";
import { uploadObject } from "./storage";

export const DOC_SELECT =
  "id, license_id, title, document_number, document_date, status, created_at, updated_at, created_by, document_type_id, document_type_code, document_type_name, storage_folder, archive_class_id, archive_class_code, archive_class_name, version_id, version_no, file_name, mime_type, size_bytes, storage_path, checksum_sha256, uploaded_at, uploaded_by, application_number, license_number, license_type_name, license_status, applicant_name, business_name, year";

/** Daftar arsip dari view v_document_search (mengikuti RLS dokumen pemanggil). */
export function documentSpec(base: Record<string, string> = {}): ListSpec {
  return {
    table: "v_document_search",
    select: DOC_SELECT,
    searchColumns: ["title", "document_number", "file_name", "application_number", "license_number", "applicant_name", "business_name"],
    defaultSort: { field: "uploaded_at", asc: false },
    sortable: ["title", "document_number", "document_date", "document_type_name", "status", "uploaded_at", "size_bytes", "application_number", "year"],
    apply: (q, filters) => {
      const f = { ...filters, ...base };
      if (f.license) q = q.eq("license_id", f.license);
      if (f.type) q = q.eq("document_type_id", f.type);
      if (f.status) q = q.eq("status", f.status);
      if (f.class) q = q.eq("archive_class_id", f.class);
      if (f.mime) q = q.eq("mime_type", f.mime);
      if (f.year && /^\d{4}$/.test(f.year)) q = q.eq("year", Number(f.year));
      return q;
    },
  };
}

export async function listLicenseDocuments(licenseId: string): Promise<DocumentRow[]> {
  return check(
    await supabase
      .from("v_document_search")
      .select(DOC_SELECT)
      .eq("license_id", licenseId)
      .order("document_type_name")
      .order("created_at"),
  ) as unknown as DocumentRow[];
}

/** Batas unggah: min(pengaturan max_upload_mb, batas bucket 10 MB). */
export async function getMaxUploadBytes(): Promise<number> {
  const { data } = await supabase.from("system_settings").select("value").eq("key", "max_upload_mb").maybeSingle();
  const mb = Number((data as { value?: unknown } | null)?.value);
  return Number.isFinite(mb) && mb > 0 ? Math.min(mb * 1024 * 1024, HARD_MAX_BYTES) : HARD_MAX_BYTES;
}

export type DocumentMeta = {
  title: string;
  document_number: string | null;
  document_date: string | null;
  archive_class_id: string | null;
};

export type UploadPhase = "validating" | "hashing" | "uploading" | "saving";
export type UploadProgress = { phase: UploadPhase; fraction: number };

type Target = { licenseId: string; year: number; folder: string };

/** Validasi → checksum → unggah ke Storage. Mengembalikan data versi untuk dicatat di database. */
async function putFile(target: Target, file: File, maxBytes: number, onProgress: (p: UploadProgress) => void, signal?: AbortSignal) {
  onProgress({ phase: "validating", fraction: 0 });
  const mime = await validateArchiveFile(file, maxBytes);
  onProgress({ phase: "hashing", fraction: 0 });
  const checksum = await sha256Hex(file);
  const path = buildStoragePath(target.year, target.licenseId, target.folder, file.name);
  await uploadObject(path, file, mime, { signal, onProgress: (f) => onProgress({ phase: "uploading", fraction: f }) });
  onProgress({ phase: "saving", fraction: 1 });
  return { path, mime, checksum };
}

/** Dokumen baru (metadata + versi 1) dalam satu transaksi database (RPC create_document). */
export async function uploadNewDocument(
  args: Target & { documentTypeId: string; meta: DocumentMeta; file: File; maxBytes: number },
  onProgress: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { path, mime, checksum } = await putFile(args, args.file, args.maxBytes, onProgress, signal);
  const id = check(
    await supabase.rpc("create_document", {
      p_license_id: args.licenseId,
      p_document_type_id: args.documentTypeId,
      p_title: args.meta.title,
      p_file_name: args.file.name,
      p_storage_path: path,
      p_mime_type: mime,
      p_size_bytes: args.file.size,
      p_checksum_sha256: checksum,
      p_document_number: args.meta.document_number,
      p_document_date: args.meta.document_date,
      p_archive_class_id: args.meta.archive_class_id,
    }),
  ) as string;
  if (!id) throw new AppError("Dokumen tidak tersimpan.");
  return id;
}

/** Versi baru untuk dokumen yang sudah ada (mis. mengganti dokumen yang ditolak). */
export async function uploadNewVersion(
  args: Target & { documentId: string; file: File; maxBytes: number },
  onProgress: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { path, mime, checksum } = await putFile(args, args.file, args.maxBytes, onProgress, signal);
  check(
    await supabase
      .from("document_versions")
      .insert({
        document_id: args.documentId,
        file_name: args.file.name,
        storage_path: path,
        mime_type: mime,
        size_bytes: args.file.size,
        checksum_sha256: checksum,
      })
      .select("id")
      .single(),
  );
}

export async function updateDocumentMeta(id: string, meta: DocumentMeta): Promise<void> {
  check(await supabase.from("documents").update(meta).eq("id", id).select("id").single());
}

/** Hapus lunak (Super Admin/Admin Arsip). File fisik tetap tersimpan di Storage. */
export async function softDeleteDocument(id: string): Promise<void> {
  check(await supabase.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id").single());
}
