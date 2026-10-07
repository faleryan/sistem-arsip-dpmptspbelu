import type { Profile } from "@/types/domain";
import type { License } from "@/types/entities";

/** Status izin di mana Petugas pemilik masih boleh mengunggah (cermin can_manage_documents). */
const PETUGAS_UPLOAD = ["DRAFT", "DIAJUKAN", "VERIFIKASI"];

/** Hak UI atas dokumen sebuah izin. Database (RLS + policy Storage) tetap penegak akhir. */
export function documentPermissions(profile: Profile | null, l: Pick<License, "officer_id" | "created_by" | "status">) {
  const role = profile?.role;
  const admin = role === "super_admin" || role === "admin_arsip";
  const own = !!profile && (l.officer_id === profile.id || l.created_by === profile.id);
  const canManage = admin || (role === "petugas" && own && PETUGAS_UPLOAD.includes(l.status));
  return {
    canUpload: canManage,
    canEditMeta: canManage,
    canDelete: admin,
  };
}
