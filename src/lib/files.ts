/**
 * Utilitas file arsip: deteksi jenis dari isi file (magic bytes), checksum, nama aman, path Storage.
 * Aturan path harus sama dengan CHECK document_versions.storage_path dan policy Storage (0005).
 */
import { AppError } from "./errors";

export type ArchiveMime = "application/pdf" | "image/jpeg" | "image/png";

export const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export const HARD_MAX_BYTES = 10 * 1024 * 1024; // batas bucket (0005_storage.sql)

const EXT_MIME: Record<string, ArchiveMime> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export const MIME_LABEL: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
};

export function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

/** Jenis file berdasarkan isi, bukan nama. null = bukan PDF/JPG/PNG. */
export async function sniffMime(file: Blob): Promise<ArchiveMime | null> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString("id-ID", { maximumFractionDigits: 0 })} KB`;
  return `${(n / 1024 / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`;
}

/**
 * Periksa file sebelum diunggah: ekstensi diizinkan, isi cocok dengan ekstensi, ukuran dalam batas.
 * Mengembalikan MIME yang terdeteksi dari isi file.
 */
export async function validateArchiveFile(file: File, maxBytes: number): Promise<ArchiveMime> {
  const ext = extOf(file.name);
  const byExt = EXT_MIME[ext];
  if (!byExt) throw new AppError("Format file tidak diizinkan. Gunakan PDF, JPG, atau PNG.", "FILE_TYPE");
  if (file.size === 0) throw new AppError("File kosong.", "FILE_EMPTY");
  if (file.size > maxBytes) {
    throw new AppError(`Ukuran file ${formatBytes(file.size)} melebihi batas ${formatBytes(maxBytes)}.`, "FILE_SIZE");
  }
  const sniffed = await sniffMime(file);
  if (!sniffed) throw new AppError("Isi file bukan PDF, JPG, atau PNG yang valid (mungkin rusak atau berganti nama).", "FILE_CONTENT");
  if (sniffed !== byExt) {
    throw new AppError(`Isi file adalah ${MIME_LABEL[sniffed]}, tetapi ekstensinya .${ext}. Ubah nama file agar sesuai.`, "FILE_MISMATCH");
  }
  if (file.name.length > 255) throw new AppError("Nama file terlalu panjang (maks. 255 karakter).", "FILE_NAME");
  return sniffed;
}

export async function sha256Hex(file: Blob): Promise<string | null> {
  // crypto.subtle hanya ada di konteks aman (HTTPS/localhost); checksum bersifat tambahan.
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Nama file aman untuk Storage: ASCII, tanpa spasi, ekstensi huruf kecil. */
export function safeStorageName(name: string): string {
  const ext = extOf(name) || "bin";
  const base = name
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, 120);
  return `${base || "dokumen"}.${ext}`;
}

/** {tahun}/{license_id}/{folder}/{uuid}-{nama-aman} — format yang diterima policy Storage. */
export function buildStoragePath(year: number, licenseId: string, folder: string, fileName: string): string {
  return `${year}/${licenseId}/${folder}/${crypto.randomUUID()}-${safeStorageName(fileName)}`;
}
