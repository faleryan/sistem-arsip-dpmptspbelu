/** Tipe baris tabel yang dipakai UI (mengikuti supabase/migrations/0002_schema.sql). */

export type Named = { name: string } | null;

export type District = { id: string; code: string; name: string };
export type Village = {
  id: string;
  district_id: string;
  code: string | null;
  name: string;
  type: "desa" | "kelurahan";
  district?: Named;
};
export type Unit = { id: string; name: string };
export type LicenseType = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  description: string | null;
  validity_months: number | null;
  is_active: boolean;
};
export type DocumentType = {
  id: string;
  code: string;
  name: string;
  storage_folder: string;
  viewer_visible: boolean;
  is_active: boolean;
};
export type ArchiveClass = { id: string; code: string; name: string; description: string | null; is_active: boolean };

export type Applicant = {
  id: string;
  full_name: string;
  nik: string | null;
  npwp: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  district_id: string | null;
  village_id: string | null;
  created_at: string;
  updated_at: string;
  district?: Named;
  village?: Named;
};

export type Business = {
  id: string;
  name: string;
  nib: string | null;
  npwp: string | null;
  entity_type: string | null;
  address: string | null;
  district_id: string | null;
  village_id: string | null;
  phone: string | null;
  email: string | null;
  person_in_charge: string | null;
  created_at: string;
  updated_at: string;
  district?: Named;
  village?: Named;
};

export const LICENSE_STATUSES = [
  "DRAFT",
  "DIAJUKAN",
  "VERIFIKASI",
  "DISETUJUI",
  "DITERBITKAN",
  "AKTIF",
  "BERAKHIR",
  "DITOLAK",
  "DICABUT",
  "DIBATALKAN",
] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export const LICENSE_STATUS_LABEL: Record<LicenseStatus, string> = {
  DRAFT: "Draft",
  DIAJUKAN: "Diajukan",
  VERIFIKASI: "Verifikasi",
  DISETUJUI: "Disetujui",
  DITERBITKAN: "Diterbitkan",
  AKTIF: "Aktif",
  BERAKHIR: "Berakhir",
  DITOLAK: "Ditolak",
  DICABUT: "Dicabut",
  DIBATALKAN: "Dibatalkan",
};

/** Baris dari view v_license_search. */
export type LicenseRow = {
  id: string;
  license_number: string | null;
  application_number: string;
  nib: string | null;
  year: number | null;
  status: LicenseStatus;
  application_date: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  license_type_id: string;
  license_type_code: string;
  license_type_name: string;
  district_id: string | null;
  district_name: string | null;
  applicant_id: string;
  applicant_name: string;
  applicant_nik: string | null;
  applicant_npwp: string | null;
  business_id: string | null;
  business_name: string | null;
  officer_id: string | null;
  created_at: string;
};

/** Baris tabel licenses (untuk detail dan form ubah). */
export type License = {
  id: string;
  license_number: string | null;
  application_number: string;
  nib: string | null;
  license_type_id: string;
  applicant_id: string;
  business_id: string | null;
  district_id: string | null;
  application_date: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: LicenseStatus;
  officer_id: string | null;
  verification_code: string;
  year: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StatusHistory = {
  id: string;
  from_status: LicenseStatus | null;
  to_status: LicenseStatus;
  note: string | null;
  changed_by: string | null;
  changed_at: string;
};

export type StatusTransition = {
  from_status: LicenseStatus;
  to_status: LicenseStatus;
  allowed_roles: string[];
  requires_note: boolean;
};

export type Completeness = { required_count: number; uploaded_count: number; verified_count: number };
