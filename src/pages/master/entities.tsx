/**
 * Konfigurasi halaman Master Data. Satu entri = satu tabel master (kolom tabel, field form, skema).
 * Hak tulis: hanya Super Admin (RLS 0004). Role lain hanya melihat.
 */
import { z, type ZodType, type ZodTypeDef } from "zod";
import { Building, FileType2, FolderTree, Landmark, MapPin, ScrollText, type LucideIcon } from "lucide-react";
import type { Column, Option } from "@/components/data-table";
import { code, optPositiveInt, optText, reqId, reqText } from "@/lib/validation";

export type MasterRow = { id: string } & Record<string, unknown>;

export type MasterField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "boolean" | "select";
  options?: Option[];
  /** Opsi diambil dari tabel rujukan. */
  source?: "districts";
  required?: boolean;
  hint?: string;
  placeholder?: string;
  uppercase?: boolean;
  wide?: boolean;
};

export type MasterEntity = {
  slug: string;
  title: string;
  singular: string;
  description: string;
  icon: LucideIcon;
  table: string;
  select: string;
  searchColumns: string[];
  defaultSort: { field: string; asc: boolean };
  sortable: string[];
  columns: Column<MasterRow>[];
  fields: MasterField[];
  schema: ZodType<Record<string, unknown>, ZodTypeDef, unknown>;
  /** Tampilkan filter kecamatan (untuk desa/kelurahan). */
  filterDistrict?: boolean;
  /** Tabel punya kolom is_active: sarankan menonaktifkan alih-alih menghapus. */
  hasActive?: boolean;
  /** Jenis izin: atur dokumen wajib. */
  requiredDocs?: boolean;
  /**
   * Tabel yang merujuk entitas ini dengan ON DELETE SET NULL. Penghapusan dicegah bila masih dipakai,
   * agar rujukan arsip tidak hilang diam-diam. (FK ON DELETE RESTRICT sudah dicegah database.)
   */
  usedBy?: { table: string; column: string; label: string }[];
};

const text = (r: MasterRow, k: string) => (r[k] === null || r[k] === undefined || r[k] === "" ? "-" : String(r[k]));

const ActiveBadge = ({ on }: { on: unknown }) => (
  <span
    className={
      on
        ? "inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"
        : "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200"
    }
  >
    {on ? "Aktif" : "Nonaktif"}
  </span>
);

const codeCol: Column<MasterRow> = {
  id: "code",
  header: "Kode",
  cell: (r) => <span className="font-mono text-xs">{text(r, "code")}</span>,
  sortField: "code",
  exportValue: (r) => text(r, "code"),
  hideable: false,
};
const nameCol: Column<MasterRow> = {
  id: "name",
  header: "Nama",
  cell: (r) => <span className="font-medium text-navy-900">{text(r, "name")}</span>,
  sortField: "name",
  exportValue: (r) => text(r, "name"),
  hideable: false,
};
const activeCol: Column<MasterRow> = {
  id: "is_active",
  header: "Status",
  cell: (r) => <ActiveBadge on={r.is_active} />,
  sortField: "is_active",
  exportValue: (r) => (r.is_active ? "Aktif" : "Nonaktif"),
};
const descCol: Column<MasterRow> = {
  id: "description",
  header: "Keterangan",
  cell: (r) => <span className="line-clamp-2 max-w-md text-muted-foreground">{text(r, "description")}</span>,
  exportValue: (r) => text(r, "description"),
};

export const STORAGE_FOLDERS: Option[] = [
  { value: "ktp", label: "ktp" },
  { value: "nib", label: "nib" },
  { value: "npwp", label: "npwp" },
  { value: "surat-permohonan", label: "surat-permohonan" },
  { value: "surat-izin", label: "surat-izin" },
  { value: "dokumen-pendukung", label: "dokumen-pendukung" },
];

const activeField: MasterField = { key: "is_active", label: "Aktif (dapat dipilih pada form)", type: "boolean" };

export const MASTER_ENTITIES: MasterEntity[] = [
  {
    slug: "jenis-izin",
    title: "Jenis Izin",
    singular: "jenis izin",
    description: "Daftar jenis perizinan beserta masa berlaku dan dokumen wajibnya.",
    icon: ScrollText,
    table: "license_types",
    select: "id, code, name, category, description, validity_months, is_active",
    searchColumns: ["code", "name", "category"],
    defaultSort: { field: "name", asc: true },
    sortable: ["code", "name", "category", "validity_months", "is_active"],
    columns: [
      codeCol,
      nameCol,
      { id: "category", header: "Kategori", cell: (r) => text(r, "category"), sortField: "category", exportValue: (r) => text(r, "category") },
      {
        id: "validity_months",
        header: "Masa berlaku",
        cell: (r) => (r.validity_months ? `${r.validity_months} bulan` : "Tidak terbatas"),
        sortField: "validity_months",
        exportValue: (r) => (r.validity_months as number | null) ?? "",
      },
      activeCol,
      { ...descCol, defaultHidden: true },
    ],
    fields: [
      { key: "code", label: "Kode", type: "text", required: true, uppercase: true, placeholder: "mis. IU" },
      { key: "name", label: "Nama jenis izin", type: "text", required: true },
      { key: "category", label: "Kategori", type: "text", placeholder: "mis. Usaha, Lingkungan" },
      {
        key: "validity_months",
        label: "Masa berlaku (bulan)",
        type: "text",
        hint: "Kosongkan bila izin berlaku tanpa batas. Dipakai untuk menghitung tanggal berakhir saat diterbitkan.",
      },
      { key: "description", label: "Keterangan", type: "textarea", wide: true },
      { ...activeField, wide: true },
    ],
    schema: z.object({
      code: code(),
      name: reqText("Nama jenis izin", 150),
      category: optText(80),
      validity_months: optPositiveInt("Masa berlaku"),
      description: optText(1000),
      is_active: z.boolean(),
    }),
    hasActive: true,
    requiredDocs: true,
  },
  {
    slug: "jenis-dokumen",
    title: "Jenis Dokumen",
    singular: "jenis dokumen",
    description: "Jenis berkas arsip (KTP, NIB, Surat Izin, dll.) dan folder penyimpanannya.",
    icon: FileType2,
    table: "document_types",
    select: "id, code, name, storage_folder, viewer_visible, is_active",
    searchColumns: ["code", "name"],
    defaultSort: { field: "name", asc: true },
    sortable: ["code", "name", "storage_folder", "is_active"],
    columns: [
      codeCol,
      nameCol,
      {
        id: "storage_folder",
        header: "Folder",
        cell: (r) => <span className="font-mono text-xs">{text(r, "storage_folder")}</span>,
        sortField: "storage_folder",
        exportValue: (r) => text(r, "storage_folder"),
      },
      {
        id: "viewer_visible",
        header: "Terlihat Viewer",
        cell: (r) => (r.viewer_visible ? "Ya" : "Tidak"),
        exportValue: (r) => (r.viewer_visible ? "Ya" : "Tidak"),
      },
      activeCol,
    ],
    fields: [
      { key: "code", label: "Kode", type: "text", required: true, uppercase: true, placeholder: "mis. KTP" },
      { key: "name", label: "Nama jenis dokumen", type: "text", required: true },
      {
        key: "storage_folder",
        label: "Folder penyimpanan",
        type: "select",
        options: STORAGE_FOLDERS,
        required: true,
        hint: "Subfolder di bucket perizinan-documents.",
      },
      {
        key: "viewer_visible",
        label: "Boleh dilihat role Viewer",
        type: "boolean",
        hint: "Aktifkan hanya untuk dokumen publik seperti Surat Izin. Jangan untuk KTP/NPWP.",
        wide: true,
      },
      { ...activeField, wide: true },
    ],
    schema: z.object({
      code: code(),
      name: reqText("Nama jenis dokumen", 150),
      storage_folder: z.enum(["ktp", "nib", "npwp", "surat-permohonan", "surat-izin", "dokumen-pendukung"], {
        errorMap: () => ({ message: "Folder penyimpanan wajib dipilih." }),
      }),
      viewer_visible: z.boolean(),
      is_active: z.boolean(),
    }),
    hasActive: true,
  },
  {
    slug: "kecamatan",
    title: "Kecamatan",
    singular: "kecamatan",
    description: "Wilayah kecamatan di Kabupaten Belu.",
    icon: Landmark,
    table: "districts",
    select: "id, code, name",
    searchColumns: ["code", "name"],
    defaultSort: { field: "name", asc: true },
    sortable: ["code", "name"],
    columns: [codeCol, nameCol],
    fields: [
      { key: "code", label: "Kode wilayah", type: "text", required: true, placeholder: "mis. 53.04.01" },
      { key: "name", label: "Nama kecamatan", type: "text", required: true },
    ],
    schema: z.object({ code: code("Kode wilayah"), name: reqText("Nama kecamatan", 100) }),
    usedBy: [
      { table: "licenses", column: "district_id", label: "data perizinan" },
      { table: "applicants", column: "district_id", label: "pemohon" },
      { table: "businesses", column: "district_id", label: "perusahaan" },
    ],
  },
  {
    slug: "desa",
    title: "Desa/Kelurahan",
    singular: "desa/kelurahan",
    description: "Desa dan kelurahan per kecamatan.",
    icon: MapPin,
    table: "villages",
    select: "id, district_id, code, name, type, district:districts(name)",
    searchColumns: ["code", "name"],
    defaultSort: { field: "name", asc: true },
    sortable: ["code", "name", "type"],
    columns: [
      { ...codeCol, hideable: true },
      nameCol,
      {
        id: "type",
        header: "Jenis",
        cell: (r) => (r.type === "kelurahan" ? "Kelurahan" : "Desa"),
        sortField: "type",
        exportValue: (r) => (r.type === "kelurahan" ? "Kelurahan" : "Desa"),
      },
      {
        id: "district",
        header: "Kecamatan",
        cell: (r) => (r.district as { name?: string } | null)?.name ?? "-",
        exportValue: (r) => (r.district as { name?: string } | null)?.name ?? "",
      },
    ],
    fields: [
      { key: "district_id", label: "Kecamatan", type: "select", source: "districts", required: true },
      {
        key: "type",
        label: "Jenis",
        type: "select",
        options: [
          { value: "desa", label: "Desa" },
          { value: "kelurahan", label: "Kelurahan" },
        ],
        required: true,
      },
      { key: "code", label: "Kode wilayah", type: "text", placeholder: "Opsional" },
      { key: "name", label: "Nama desa/kelurahan", type: "text", required: true },
    ],
    schema: z.object({
      district_id: reqId("Kecamatan"),
      type: z.enum(["desa", "kelurahan"]),
      code: optText(30),
      name: reqText("Nama desa/kelurahan", 100),
    }),
    filterDistrict: true,
    usedBy: [
      { table: "applicants", column: "village_id", label: "pemohon" },
      { table: "businesses", column: "village_id", label: "perusahaan" },
    ],
  },
  {
    slug: "klasifikasi-arsip",
    title: "Klasifikasi Arsip",
    singular: "klasifikasi arsip",
    description: "Kode klasifikasi arsip sesuai pedoman kearsipan instansi.",
    icon: FolderTree,
    table: "archive_classes",
    select: "id, code, name, description, is_active",
    searchColumns: ["code", "name"],
    defaultSort: { field: "code", asc: true },
    sortable: ["code", "name", "is_active"],
    columns: [codeCol, nameCol, descCol, activeCol],
    fields: [
      { key: "code", label: "Kode klasifikasi", type: "text", required: true, placeholder: "mis. 500.16" },
      { key: "name", label: "Nama klasifikasi", type: "text", required: true },
      { key: "description", label: "Keterangan", type: "textarea", wide: true },
      { ...activeField, wide: true },
    ],
    schema: z.object({
      code: code("Kode klasifikasi"),
      name: reqText("Nama klasifikasi", 150),
      description: optText(1000),
      is_active: z.boolean(),
    }),
    hasActive: true,
    usedBy: [{ table: "documents", column: "archive_class_id", label: "dokumen" }],
  },
  {
    slug: "unit",
    title: "Unit/Bidang",
    singular: "unit/bidang",
    description: "Unit kerja atau bidang di lingkungan DPMPTSP.",
    icon: Building,
    table: "units",
    select: "id, name",
    searchColumns: ["name"],
    defaultSort: { field: "name", asc: true },
    sortable: ["name"],
    columns: [nameCol],
    fields: [{ key: "name", label: "Nama unit/bidang", type: "text", required: true, wide: true }],
    schema: z.object({ name: reqText("Nama unit/bidang", 150) }),
    usedBy: [{ table: "profiles", column: "unit_id", label: "pengguna" }],
  },
];

export const findEntity = (slug: string | undefined) => MASTER_ENTITIES.find((e) => e.slug === slug);

/** Nilai awal form dari baris (atau kosong untuk data baru). */
export function initialValues(entity: MasterEntity, row?: MasterRow | null): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const f of entity.fields) {
    const v = row?.[f.key];
    if (f.type === "boolean") out[f.key] = row ? Boolean(v) : f.key === "is_active";
    else if (f.key === "type" && !row) out[f.key] = "desa";
    else out[f.key] = v === null || v === undefined ? "" : String(v);
  }
  return out;
}
