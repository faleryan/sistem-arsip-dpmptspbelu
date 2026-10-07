import {
  Archive,
  Bell,
  Building2,
  ClipboardList,
  FileSearch,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
  UserSquare2,
  BarChart3,
  ClipboardCheck,
  Database,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/types/domain";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  roles: AppRole[];
};

export type NavGroup = { title: string; items: NavItem[] };

const ALL: AppRole[] = [
  "super_admin",
  "admin_arsip",
  "petugas",
  "verifikator",
  "pimpinan",
  "viewer",
];

const INTERNAL: AppRole[] = ALL.filter((r) => r !== "viewer");

/**
 * Menu per role (mengikuti matriks pada docs/00-DESAIN.md).
 * Ini hanya kenyamanan UI — keamanan sebenarnya ditegakkan RLS di database.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Utama",
    items: [
      { label: "Dashboard", to: "/", icon: LayoutDashboard, roles: ALL },
      { label: "Pencarian Arsip", to: "/pencarian", icon: FileSearch, roles: ALL },
    ],
  },
  {
    title: "Perizinan",
    items: [
      { label: "Data Perizinan", to: "/perizinan", icon: ClipboardList, roles: ALL },
      { label: "Pemohon", to: "/pemohon", icon: UserSquare2, roles: INTERNAL },
      { label: "Perusahaan", to: "/perusahaan", icon: Building2, roles: INTERNAL },
      { label: "Antrean Verifikasi", to: "/verifikasi", icon: ClipboardCheck, roles: ["super_admin", "verifikator"] },
    ],
  },
  {
    title: "Arsip",
    items: [
      { label: "Arsip Digital", to: "/arsip", icon: Archive, roles: ALL },
      {
        label: "Laporan",
        to: "/laporan",
        icon: BarChart3,
        roles: ["super_admin", "admin_arsip", "petugas", "verifikator", "pimpinan"],
      },
      { label: "Notifikasi", to: "/notifikasi", icon: Bell, roles: ALL },
    ],
  },
  {
    title: "Administrasi",
    items: [
      { label: "Master Data", to: "/master", icon: Database, roles: ALL },
      { label: "Pengguna & Role", to: "/pengguna", icon: Users, roles: ["super_admin"] },
      {
        label: "Audit Log",
        to: "/audit",
        icon: ShieldCheck,
        roles: ["super_admin", "admin_arsip", "pimpinan"],
      },
      { label: "Data Terhapus", to: "/terhapus", icon: Trash2, roles: ["super_admin", "admin_arsip"] },
      { label: "Pengaturan", to: "/pengaturan", icon: Settings, roles: ["super_admin"] },
    ],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/pencarian": "Pencarian Arsip",
  "/perizinan": "Data Perizinan",
  "/pemohon": "Pemohon",
  "/perusahaan": "Perusahaan",
  "/arsip": "Arsip Digital",
  "/laporan": "Laporan",
  "/notifikasi": "Notifikasi",
  "/master": "Master Data",
  "/pengguna": "Pengguna & Role",
  "/audit": "Audit Log",
  "/verifikasi": "Antrean Verifikasi",
  "/terhapus": "Data Terhapus",
  "/pengaturan": "Pengaturan",
};
