import type { Profile } from "@/types/domain";
import type { License } from "@/types/entities";
import { PETUGAS_EDITABLE } from "./status";

/**
 * Hak UI atas satu izin. Cermin dari RLS licenses_update + trigger guard_license_write;
 * database tetap menjadi penegak akhir.
 */
export function licensePermissions(profile: Profile | null, l: Pick<License, "officer_id" | "created_by" | "status">) {
  const role = profile?.role;
  const admin = role === "super_admin" || role === "admin_arsip";
  const own = !!profile && (l.officer_id === profile.id || l.created_by === profile.id);
  return {
    canEdit: admin || (role === "petugas" && own && PETUGAS_EDITABLE.includes(l.status)),
    canEditIssuance: admin,
    canDelete: role === "super_admin",
    isOwner: own,
  };
}

export const canCreateLicense = (profile: Profile | null) =>
  profile?.role === "super_admin" || profile?.role === "admin_arsip" || profile?.role === "petugas";
