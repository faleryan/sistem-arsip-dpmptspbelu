import { supabase } from "@/lib/supabase";
import { AppError, check } from "@/lib/errors";
import type {
  Applicant,
  Business,
  License,
  LicenseRow,
  LicenseStatus,
  LicenseType,
  StatusHistory,
  StatusTransition,
} from "@/types/entities";
import type { ListSpec } from "./listQuery";

const VIEW_SELECT =
  "id, license_number, application_number, nib, year, status, application_date, issue_date, expiry_date, license_type_id, license_type_code, license_type_name, district_id, district_name, applicant_id, applicant_name, applicant_nik, applicant_npwp, business_id, business_name, officer_id, created_at";

/** Daftar izin dari view v_license_search (sudah memfilter baris & menyamarkan NIK untuk Viewer). */
export function licenseSpec(base: Record<string, string> = {}): ListSpec {
  return {
    table: "v_license_search",
    select: VIEW_SELECT,
    searchColumns: ["application_number", "license_number", "applicant_name", "business_name", "nib", "applicant_nik"],
    defaultSort: { field: "created_at", asc: false },
    sortable: [
      "application_number",
      "license_number",
      "license_type_name",
      "applicant_name",
      "business_name",
      "district_name",
      "status",
      "application_date",
      "issue_date",
      "expiry_date",
      "year",
      "created_at",
    ],
    apply: (q, filters) => {
      const f = { ...filters, ...base };
      if (f.status) q = q.in("status", f.status.split(","));
      if (f.type) q = q.eq("license_type_id", f.type);
      if (f.district) q = q.eq("district_id", f.district);
      if (f.year && /^\d{4}$/.test(f.year)) q = q.eq("year", Number(f.year));
      if (f.applicant) q = q.eq("applicant_id", f.applicant);
      if (f.business) q = q.eq("business_id", f.business);
      // Rentang tanggal (YYYY-MM-DD) untuk laporan & pencarian lanjutan.
      const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
      for (const [key, col] of [["app", "application_date"], ["issue", "issue_date"], ["expiry", "expiry_date"]] as const) {
        const from = iso(f[`${key}_from`]);
        const to = iso(f[`${key}_to`]);
        if (from) q = q.gte(col, from);
        if (to) q = q.lte(col, to);
      }
      // Pencocokan tepat (bukan "mengandung") untuk nomor identitas.
      if (f.nik) q = q.eq("applicant_nik", f.nik.replace(/\s/g, ""));
      if (f.nib) q = q.eq("nib", f.nib.replace(/\s/g, ""));
      if (f.license_number) q = q.eq("license_number", f.license_number.trim());
      return q;
    },
  };
}

export type LicenseDetail = License & {
  license_type: Pick<LicenseType, "id" | "code" | "name" | "validity_months"> | null;
  district: { name: string } | null;
  /** null bila role tidak boleh membaca tabel pemohon/perusahaan (Viewer). */
  applicant: Pick<Applicant, "id" | "full_name" | "nik" | "npwp" | "phone" | "address"> | null;
  business: Pick<Business, "id" | "name" | "nib" | "entity_type"> | null;
  /** Ringkasan dari view (selalu tersedia, termasuk untuk Viewer). */
  summary: LicenseRow | null;
};

export async function getLicense(id: string): Promise<LicenseDetail> {
  const [main, summary] = await Promise.all([
    supabase
      .from("licenses")
      .select(
        "*, license_type:license_types(id, code, name, validity_months), district:districts(name), applicant:applicants(id, full_name, nik, npwp, phone, address), business:businesses(id, name, nib, entity_type)",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("v_license_search").select(VIEW_SELECT).eq("id", id).maybeSingle(),
  ]);
  const row = check(main) as unknown as Omit<LicenseDetail, "summary"> | null;
  const sum = (summary.data as LicenseRow | null) ?? null;
  if (row) return { ...row, summary: sum };
  // Viewer tidak membaca tabel licenses (kolom internal seperti catatan disembunyikan, RLS 0013):
  // detail disusun dari view yang hanya memuat kolom aman.
  if (!sum) throw new AppError("Data perizinan tidak ditemukan atau Anda tidak berwenang melihatnya.", "NOT_FOUND");
  return {
    id: sum.id,
    license_number: sum.license_number,
    application_number: sum.application_number,
    nib: sum.nib,
    license_type_id: sum.license_type_id,
    applicant_id: sum.applicant_id,
    business_id: sum.business_id,
    district_id: sum.district_id,
    application_date: sum.application_date,
    issue_date: sum.issue_date,
    expiry_date: sum.expiry_date,
    status: sum.status,
    officer_id: sum.officer_id,
    verification_code: "",
    year: sum.year,
    notes: null,
    created_by: null,
    created_at: sum.created_at,
    updated_at: sum.created_at,
    license_type: { id: sum.license_type_id, code: sum.license_type_code, name: sum.license_type_name, validity_months: null },
    district: sum.district_name ? { name: sum.district_name } : null,
    applicant: null,
    business: null,
    summary: sum,
  };
}

export type LicenseInput = {
  license_type_id: string;
  applicant_id: string;
  business_id: string | null;
  district_id: string | null;
  application_date: string | null;
  notes: string | null;
  /** Hanya Admin Arsip/Super Admin (ditegakkan trigger guard_license_write). */
  license_number?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  /** Hanya saat membuat (impor arsip izin lama oleh admin). */
  status?: LicenseStatus;
};

export async function createLicense(input: LicenseInput): Promise<{ id: string }> {
  return check(await supabase.from("licenses").insert(input).select("id").single()) as { id: string };
}

export async function updateLicense(id: string, input: Omit<LicenseInput, "status">): Promise<void> {
  check(await supabase.from("licenses").update(input).eq("id", id).select("id").single());
}

export async function softDeleteLicense(id: string): Promise<void> {
  check(await supabase.from("licenses").update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id").single());
}

export async function changeLicenseStatus(id: string, to: LicenseStatus, note: string | null): Promise<void> {
  check(await supabase.rpc("change_license_status", { p_license_id: id, p_new_status: to, p_note: note }));
}

export async function listTransitions(from: LicenseStatus): Promise<StatusTransition[]> {
  return check(
    await supabase
      .from("license_status_transitions")
      .select("from_status, to_status, allowed_roles, requires_note")
      .eq("from_status", from),
  ) as StatusTransition[];
}

export async function listHistory(licenseId: string): Promise<StatusHistory[]> {
  return check(
    await supabase
      .from("license_status_history")
      .select("id, from_status, to_status, note, changed_by, changed_at")
      .eq("license_id", licenseId)
      .order("changed_at", { ascending: true }),
  ) as StatusHistory[];
}

/** Nama staf (tanpa data sensitif) untuk menampilkan petugas/pengubah status. */
export async function listStaffNames(): Promise<Map<string, string>> {
  const rows = check(await supabase.from("v_staff").select("id, full_name")) as { id: string; full_name: string }[];
  return new Map(rows.map((r) => [r.id, r.full_name]));
}

/** Tahun yang ada di data (untuk filter). */
export function yearOptions(): string[] {
  const now = new Date().getFullYear();
  return Array.from({ length: 12 }, (_, i) => String(now + 1 - i));
}
