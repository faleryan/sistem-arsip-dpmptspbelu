/** Potongan skema zod yang dipakai ulang di form. Input form selalu string; hasilnya siap dikirim ke DB. */
import { z } from "zod";

const blankToNull = (v: string) => (v.trim() === "" ? null : v.trim());

export const reqText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} wajib diisi.`).max(max, `${label} maksimal ${max} karakter.`);

export const optText = (max = 1000) =>
  z.string().max(max, `Maksimal ${max} karakter.`).transform(blankToNull);

export const optId = z.string().transform((v) => (v ? v : null));

export const reqId = (label: string) => z.string().min(1, `${label} wajib dipilih.`);

export const optEmail = z
  .string()
  .trim()
  .refine((v) => v === "" || z.string().email().safeParse(v).success, "Format email tidak valid.")
  .transform(blankToNull);

export const optPhone = z
  .string()
  .trim()
  .refine((v) => v === "" || /^[0-9+\-\s()]{6,20}$/.test(v), "Nomor telepon tidak valid.")
  .transform(blankToNull);

/** Angka saja dengan panjang tertentu (NIK 16, NIB 13). Spasi diabaikan. */
export const optDigits = (label: string, len: number) =>
  z
    .string()
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => v === "" || new RegExp(`^[0-9]{${len}}$`).test(v), `${label} harus ${len} digit angka.`)
    .transform((v) => (v === "" ? null : v));

export const optNpwp = z
  .string()
  .transform((v) => v.replace(/\s/g, ""))
  .refine((v) => v === "" || /^[0-9.\-]{15,20}$/.test(v), "NPWP harus 15–20 karakter (angka, titik, strip).")
  .transform((v) => (v === "" ? null : v));

export const optDate = z
  .string()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Tanggal tidak valid.")
  .transform((v) => (v === "" ? null : v));

export const optPositiveInt = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) > 0 && Number(v) <= 1200), `${label} harus angka 1–1200.`)
    .transform((v) => (v === "" ? null : Number(v)));

export const code = (label = "Kode", max = 30) =>
  z
    .string()
    .trim()
    .min(1, `${label} wajib diisi.`)
    .max(max, `${label} maksimal ${max} karakter.`)
    .regex(/^[A-Za-z0-9._\-/]+$/, `${label} hanya boleh huruf, angka, titik, strip, garis miring, atau garis bawah.`);
