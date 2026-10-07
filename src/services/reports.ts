import { supabase } from "@/lib/supabase";
import { check } from "@/lib/errors";
import type { DocStatus, LicenseRow, LicenseStatus } from "@/types/entities";
import { fetchAll } from "./listQuery";
import { licenseSpec } from "./licenses";

export type SummaryRow = {
  license_type_id: string;
  license_type_name: string;
  district_id: string | null;
  district_name: string | null;
  status: LicenseStatus;
  total: number;
};

export type MonthlyRow = { month: number; submitted: number; issued: number };
export type DocSummaryRow = { document_type_name: string; status: DocStatus; total: number };

export async function licenseSummary(args: { from?: string; to?: string; basis: "application" | "issue"; districtId?: string }) {
  const rows = check(
    await supabase.rpc("report_license_summary", {
      p_from: args.from || null,
      p_to: args.to || null,
      p_basis: args.basis,
      p_district_id: args.districtId || null,
    }),
  ) as SummaryRow[];
  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

export async function monthlyTrend(year: number): Promise<MonthlyRow[]> {
  const rows = check(await supabase.rpc("report_monthly", { p_year: year })) as MonthlyRow[];
  return rows.map((r) => ({ month: Number(r.month), submitted: Number(r.submitted), issued: Number(r.issued) }));
}

export async function documentSummary(from?: string, to?: string): Promise<DocSummaryRow[]> {
  const rows = check(await supabase.rpc("report_document_summary", { p_from: from || null, p_to: to || null })) as DocSummaryRow[];
  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

/** Daftar izin (maks. 10.000) dari v_license_search dengan filter laporan. */
export function licenseList(filters: Record<string, string>, sort: { field: string; asc: boolean }): Promise<LicenseRow[]> {
  return fetchAll<LicenseRow>(licenseSpec(filters), { search: "", sort, filters: {} });
}

/** Kelompok status untuk kolom rekap. */
export const STATUS_GROUPS: { key: string; label: string; statuses: LicenseStatus[] }[] = [
  { key: "proses", label: "Dalam proses", statuses: ["DRAFT", "DIAJUKAN", "VERIFIKASI", "DISETUJUI"] },
  { key: "terbit", label: "Terbit / aktif", statuses: ["DITERBITKAN", "AKTIF"] },
  { key: "berakhir", label: "Berakhir", statuses: ["BERAKHIR"] },
  { key: "selesai", label: "Ditolak / batal / dicabut", statuses: ["DITOLAK", "DIBATALKAN", "DICABUT"] },
];
