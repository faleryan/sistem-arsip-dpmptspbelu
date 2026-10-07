/** Verifikasi keaslian izin oleh publik (tanpa login) lewat fungsi verify_license(). */
import { supabase } from "@/lib/supabase";
import { check } from "@/lib/errors";

export type PublicLicense = {
  license_number: string | null;
  license_type: string;
  holder_name: string;
  issue_date: string | null;
  /** Ada sejak migration 0010; undefined bila belum dijalankan. */
  expiry_date?: string | null;
  status: "DITERBITKAN" | "AKTIF" | "BERAKHIR" | "DICABUT";
  agency: string;
};

/** Format kode: 12 karakter A–Z/0–9 (sama dengan aturan database). */
export const CODE_RE = /^[A-Z0-9]{12}$/;

export function normalizeCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export async function verifyCode(code: string): Promise<PublicLicense | null> {
  const c = normalizeCode(code);
  if (!CODE_RE.test(c)) return null;
  const rows = check(await supabase.rpc("verify_license", { p_code: c })) as PublicLicense[] | null;
  return rows?.[0] ?? null;
}

/** URL publik yang dimuat di QR. VITE_PUBLIC_APP_URL dipakai bila domain cetak berbeda dari domain aplikasi. */
export function publicVerifyUrl(code: string): string {
  const base = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.replace(/\/+$/, "") || window.location.origin;
  return `${base}/verify/${code}`;
}
