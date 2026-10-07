/**
 * Ubah galat Supabase/PostgREST/zod menjadi kalimat yang bisa dibaca pengguna.
 * Pesan dari fungsi/trigger database kita sudah berbahasa Indonesia, jadi diteruskan apa adanya.
 */
import { ZodError } from "zod";

type PgLike = { code?: string; message?: string; details?: string | null; hint?: string | null };

const CONSTRAINT_LABEL: Record<string, string> = {
  nik: "NIK harus 16 digit angka.",
  npwp: "Format NPWP tidak valid (15–20 karakter angka, titik, atau strip).",
  nib: "NIB harus 13 digit angka.",
  validity_months: "Masa berlaku harus lebih dari 0 bulan.",
  expiry_date: "Tanggal berakhir tidak boleh sebelum tanggal terbit.",
  storage_folder: "Folder penyimpanan tidak valid.",
};

export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return new AppError(error.issues[0]?.message ?? "Data tidak valid.", "VALIDATION");
  const e = (error ?? {}) as PgLike;
  const msg = e.message ?? (error instanceof Error ? error.message : "");
  switch (e.code) {
    case "23505": {
      const what = /application_number/.test(msg)
        ? "Nomor permohonan"
        : /license_number/.test(msg)
          ? "Nomor izin"
          : /code/.test(msg)
            ? "Kode"
            : /name/.test(msg)
              ? "Nama"
              : "Data";
      return new AppError(`${what} sudah terdaftar. Gunakan nilai lain.`, e.code);
    }
    case "23503":
      return new AppError(
        /delete|update or delete/i.test(msg)
          ? "Data ini masih dipakai oleh data lain sehingga tidak dapat dihapus."
          : "Data rujukan yang dipilih tidak ditemukan.",
        e.code,
      );
    case "23514": {
      const key = Object.keys(CONSTRAINT_LABEL).find((k) => msg.includes(k));
      return new AppError(key ? CONSTRAINT_LABEL[key] : "Data tidak memenuhi aturan validasi.", e.code);
    }
    case "23502":
      return new AppError("Ada kolom wajib yang belum diisi.", e.code);
    case "42501":
      return new AppError(
        /row-level security|permission denied/i.test(msg) ? "Anda tidak berwenang melakukan tindakan ini." : msg,
        e.code,
      );
    case "PGRST202":
    case "PGRST205":
    case "42883":
    case "42P01":
      return new AppError(
        "Fitur ini membutuhkan pembaruan database. Pastikan semua migration terbaru (supabase/migrations) sudah dijalankan.",
        e.code,
      );
    case "PGRST116":
      return new AppError("Data tidak ditemukan atau Anda tidak memiliki akses.", e.code);
    case "PGRST301":
    case "PGRST302":
      return new AppError("Sesi berakhir. Silakan masuk kembali.", e.code);
    default:
      break;
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return new AppError("Tidak dapat terhubung ke server. Periksa koneksi internet Anda.", "NETWORK");
  }
  return new AppError(msg || "Terjadi kesalahan. Coba lagi.", e.code);
}

export function errorMessage(error: unknown): string {
  return toAppError(error).message;
}

/** Lempar galat Supabase sebagai AppError (dipakai di lapisan services). */
export function check<T>(res: { data: T; error: PgLike | null }): T {
  if (res.error) throw toAppError(res.error);
  return res.data;
}
