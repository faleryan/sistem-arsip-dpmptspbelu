/** Menyusun model laporan (judul, kolom, baris, total) — dipakai bersama oleh tampilan dan ekspor. */
import type { Cell, ReportColumn } from "@/lib/export/report";
import { STATUS_GROUPS, type DocSummaryRow, type SummaryRow } from "@/services/reports";
import { formatDate } from "@/utils/format";
import { DOC_STATUSES, DOC_STATUS_LABEL, LICENSE_STATUS_LABEL, type LicenseRow } from "@/types/entities";

export type ReportKind = "rekap" | "kecamatan" | "terbit" | "berlaku" | "dokumen";

export type ReportFilters = {
  from: string;
  to: string;
  basis: "application" | "issue";
  district: string;
  validity: "akan" | "sudah";
  days: number;
};

export type Built = {
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: Cell[][];
  totals?: Cell[];
  orientation: "portrait" | "landscape";
  fileBase: string;
};

const num = (c: string, width = 14): ReportColumn => ({ header: c, align: "right", width });

function periodText(f: ReportFilters) {
  const p = f.from || f.to ? `Periode ${f.from ? formatDate(f.from) : "awal"} s.d. ${f.to ? formatDate(f.to) : "sekarang"}` : "Seluruh periode";
  return p;
}

/** Rekap per kunci (jenis izin atau kecamatan) × kelompok status. */
function groupSummary(rows: SummaryRow[], keyOf: (r: SummaryRow) => string) {
  const map = new Map<string, number[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const acc = map.get(k) ?? STATUS_GROUPS.map(() => 0);
    const gi = STATUS_GROUPS.findIndex((g) => g.statuses.includes(r.status));
    if (gi >= 0) acc[gi] += r.total;
    map.set(k, acc);
  }
  const out = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "id"));
  const body: Cell[][] = out.map(([k, v]) => [k, ...v, v.reduce((a, b) => a + b, 0)]);
  const sums = STATUS_GROUPS.map((_, i) => out.reduce((a, [, v]) => a + v[i], 0));
  return { body, totals: ["Jumlah", ...sums, sums.reduce((a, b) => a + b, 0)] as Cell[] };
}

export function buildSummary(kind: "rekap" | "kecamatan", rows: SummaryRow[], f: ReportFilters, districtName: string): Built {
  const byType = kind === "rekap";
  const { body, totals } = groupSummary(rows, (r) => (byType ? r.license_type_name : (r.district_name ?? "(Tanpa kecamatan)")));
  const basis = f.basis === "issue" ? "tanggal terbit" : "tanggal permohonan";
  return {
    title: byType ? "Rekapitulasi Perizinan per Jenis Izin" : "Rekapitulasi Perizinan per Kecamatan",
    subtitle: `${periodText(f)} · berdasarkan ${basis}${byType && f.district ? ` · Kecamatan ${districtName}` : ""}`,
    columns: [{ header: byType ? "Jenis izin" : "Kecamatan", width: 32 }, ...STATUS_GROUPS.map((g) => num(g.label, 16)), num("Total", 10)],
    rows: body,
    totals,
    orientation: "portrait",
    fileBase: byType ? "rekap_perizinan" : "rekap_per_kecamatan",
  };
}

const holder = (r: LicenseRow) => r.business_name ?? r.applicant_name;

export function buildIssued(list: LicenseRow[], f: ReportFilters, districtName: string): Built {
  return {
    title: "Daftar Izin Terbit",
    subtitle: `${periodText(f)} · berdasarkan tanggal terbit${f.district ? ` · Kecamatan ${districtName}` : ""} · ${list.length.toLocaleString("id-ID")} izin`,
    columns: [
      { header: "No", align: "right", width: 5 },
      { header: "No. izin", width: 24 },
      { header: "Jenis izin", width: 22 },
      { header: "Pemegang izin", width: 30 },
      { header: "Kecamatan", width: 16 },
      { header: "Tgl. terbit", width: 16 },
      { header: "Berlaku s.d.", width: 16 },
      { header: "Status", width: 12 },
    ],
    rows: list.map((r, i) => [
      i + 1,
      r.license_number ?? r.application_number,
      r.license_type_name,
      holder(r),
      r.district_name ?? "-",
      formatDate(r.issue_date),
      r.expiry_date ? formatDate(r.expiry_date) : "Tanpa batas",
      LICENSE_STATUS_LABEL[r.status],
    ]),
    orientation: "landscape",
    fileBase: "izin_terbit",
  };
}

export function buildValidity(list: LicenseRow[], f: ReportFilters, today: string): Built {
  const akan = f.validity === "akan";
  const dayMs = 86400000;
  const left = (d: string | null) => (d ? Math.round((Date.parse(d) - Date.parse(today)) / dayMs) : null);
  return {
    title: akan ? `Izin Akan Berakhir dalam ${f.days} Hari` : "Izin yang Telah Berakhir",
    subtitle: akan
      ? `Per ${formatDate(today)} · izin berstatus Aktif · ${list.length.toLocaleString("id-ID")} izin`
      : `${periodText(f)} · berdasarkan tanggal berakhir · ${list.length.toLocaleString("id-ID")} izin`,
    columns: [
      { header: "No", align: "right", width: 5 },
      { header: "No. izin", width: 24 },
      { header: "Jenis izin", width: 22 },
      { header: "Pemegang izin", width: 30 },
      { header: "Tgl. terbit", width: 16 },
      { header: "Berlaku s.d.", width: 16 },
      akan ? num("Sisa hari", 10) : { header: "Kecamatan", width: 16 },
    ],
    rows: list.map((r, i) => [
      i + 1,
      r.license_number ?? r.application_number,
      r.license_type_name,
      holder(r),
      formatDate(r.issue_date),
      formatDate(r.expiry_date),
      akan ? left(r.expiry_date) : (r.district_name ?? "-"),
    ]),
    orientation: "landscape",
    fileBase: akan ? "izin_akan_berakhir" : "izin_berakhir",
  };
}

export function buildDocuments(rows: DocSummaryRow[], f: ReportFilters): Built {
  const map = new Map<string, number[]>();
  for (const r of rows) {
    const acc = map.get(r.document_type_name) ?? DOC_STATUSES.map(() => 0);
    const i = DOC_STATUSES.indexOf(r.status);
    if (i >= 0) acc[i] += r.total;
    map.set(r.document_type_name, acc);
  }
  const out = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "id"));
  const sums = DOC_STATUSES.map((_, i) => out.reduce((a, [, v]) => a + v[i], 0));
  return {
    title: "Rekapitulasi Dokumen Arsip",
    subtitle: `${periodText(f)} · berdasarkan tanggal unggah · versi aktif`,
    columns: [{ header: "Jenis dokumen", width: 26 }, ...DOC_STATUSES.map((s) => num(DOC_STATUS_LABEL[s], 16)), num("Total", 10)],
    rows: out.map(([k, v]) => [k, ...v, v.reduce((a, b) => a + b, 0)]),
    totals: ["Jumlah", ...sums, sums.reduce((a, b) => a + b, 0)],
    orientation: "portrait",
    fileBase: "rekap_dokumen",
  };
}
