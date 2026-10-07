/**
 * Akses bucket privat `perizinan-documents`.
 * - Unggah memakai XHR langsung ke Storage API agar progres bisa ditampilkan (supabase-js belum
 *   menyediakan progres). Endpoint, header, dan perilakunya sama dengan storage-js `upload()`.
 * - Baca selalu lewat signed URL berumur pendek; tidak ada URL publik.
 */
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { AppError } from "@/lib/errors";

export const BUCKET = "perizinan-documents";

type StorageErrorBody = { statusCode?: string | number; error?: string; message?: string };

function storageError(status: number, body: StorageErrorBody | null): AppError {
  const msg = `${body?.message ?? ""} ${body?.error ?? ""}`;
  const code = String(body?.statusCode ?? status);
  if (/row-level security|unauthorized|not allowed/i.test(msg) || code === "403") {
    return new AppError("Anda tidak berwenang mengunggah dokumen ke izin ini (atau statusnya tidak lagi mengizinkan).", "STORAGE_FORBIDDEN");
  }
  if (/mime type|invalid_mime/i.test(msg) || code === "415") {
    return new AppError("Jenis file ditolak penyimpanan. Gunakan PDF, JPG, atau PNG.", "STORAGE_MIME");
  }
  if (/maximum allowed size|too large|payload/i.test(msg) || code === "413") {
    return new AppError("File melebihi batas ukuran penyimpanan (10 MB).", "STORAGE_SIZE");
  }
  if (/already exists|duplicate/i.test(msg) || code === "409") {
    return new AppError("File dengan lokasi yang sama sudah ada. Coba unggah ulang.", "STORAGE_DUPLICATE");
  }
  if (code === "401" || /jwt|token/i.test(msg)) {
    return new AppError("Sesi berakhir. Silakan masuk kembali.", "STORAGE_AUTH");
  }
  return new AppError(body?.message || `Gagal mengunggah file (kode ${status}).`, "STORAGE");
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AppError("Sesi berakhir. Silakan masuk kembali.", "STORAGE_AUTH");
  return token;
}

export type UploadOptions = {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

/** Unggah satu file ke path tertentu. Tidak pernah menimpa (x-upsert: false). */
export async function uploadObject(path: string, file: Blob, mime: string, opts: UploadOptions = {}): Promise<void> {
  const token = await accessToken();
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("content-type", mime);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(1);
        resolve();
        return;
      }
      let body: StorageErrorBody | null = null;
      try {
        body = JSON.parse(xhr.responseText) as StorageErrorBody;
      } catch {
        /* bukan JSON */
      }
      reject(storageError(xhr.status, body));
    };
    xhr.onerror = () => reject(new AppError("Koneksi terputus saat mengunggah. Periksa internet lalu coba lagi.", "NETWORK"));
    xhr.onabort = () => reject(new AppError("Unggahan dibatalkan.", "ABORTED"));
    if (opts.signal) {
      if (opts.signal.aborted) return xhr.abort();
      opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
}

/**
 * Signed URL berumur pendek. `download` = nama file → browser mengunduh (Content-Disposition attachment).
 * RLS Storage (can_read_license_file) menentukan siapa yang boleh.
 */
export async function signedUrl(path: string, opts: { download?: string; expiresIn?: number } = {}): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, opts.expiresIn ?? 300, opts.download ? { download: opts.download } : undefined);
  if (error || !data?.signedUrl) {
    const m = error?.message ?? "";
    if (/not found|object not found/i.test(m)) throw new AppError("File tidak ditemukan di penyimpanan.", "STORAGE_NOT_FOUND");
    throw new AppError("Anda tidak berwenang membuka file ini, atau file tidak tersedia.", "STORAGE_READ");
  }
  return data.signedUrl;
}

/** Picu unduhan tanpa membuka tab baru. */
export async function downloadObject(path: string, fileName: string): Promise<void> {
  const url = await signedUrl(path, { download: fileName, expiresIn: 60 });
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
