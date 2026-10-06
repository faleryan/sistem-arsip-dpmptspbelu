export const APP_ROLES = [
  "super_admin",
  "admin_arsip",
  "petugas",
  "verifikator",
  "pimpinan",
  "viewer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin_arsip: "Admin Arsip",
  petugas: "Petugas",
  verifikator: "Verifikator",
  pimpinan: "Pimpinan",
  viewer: "Viewer",
};

export interface Profile {
  id: string;
  full_name: string;
  role: AppRole;
  is_active: boolean;
}

export const APP_NAME = "SIPAR-BELU";
export const APP_FULL_NAME =
  "Sistem Informasi Pengarsipan dan Manajemen Dokumen Perizinan";
export const AGENCY_NAME =
  "Dinas Penanaman Modal dan Pelayanan Terpadu Satu Pintu Kabupaten Belu";
