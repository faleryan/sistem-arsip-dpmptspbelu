/** Data rujukan (master) untuk dropdown form dan filter. */
import { supabase } from "@/lib/supabase";
import { check } from "@/lib/errors";
import type { ArchiveClass, District, DocumentType, LicenseType, Unit, Village } from "@/types/entities";

export async function listDistricts(): Promise<District[]> {
  return check(await supabase.from("districts").select("id, code, name").order("name")) as District[];
}

export async function listVillages(districtId?: string | null): Promise<Village[]> {
  let q = supabase.from("villages").select("id, district_id, code, name, type").order("name");
  if (districtId) q = q.eq("district_id", districtId);
  return check(await q) as Village[];
}

export async function listLicenseTypes(activeOnly = false): Promise<LicenseType[]> {
  let q = supabase
    .from("license_types")
    .select("id, code, name, category, description, validity_months, is_active")
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  return check(await q) as LicenseType[];
}

export async function listDocumentTypes(activeOnly = false): Promise<DocumentType[]> {
  let q = supabase
    .from("document_types")
    .select("id, code, name, storage_folder, viewer_visible, is_active")
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  return check(await q) as DocumentType[];
}

export async function listArchiveClasses(): Promise<ArchiveClass[]> {
  return check(
    await supabase.from("archive_classes").select("id, code, name, description, is_active").order("code"),
  ) as ArchiveClass[];
}

export async function listUnitsRef(): Promise<Unit[]> {
  return check(await supabase.from("units").select("id, name").order("name")) as Unit[];
}

/** Jenis dokumen wajib untuk satu jenis izin. */
export async function listRequiredDocs(licenseTypeId: string): Promise<string[]> {
  const rows = check(
    await supabase.from("license_type_documents").select("document_type_id").eq("license_type_id", licenseTypeId),
  ) as { document_type_id: string }[];
  return rows.map((r) => r.document_type_id);
}

export async function saveRequiredDocs(licenseTypeId: string, documentTypeIds: string[]): Promise<void> {
  const current = new Set(await listRequiredDocs(licenseTypeId));
  const wanted = new Set(documentTypeIds);
  const remove = [...current].filter((id) => !wanted.has(id));
  const add = [...wanted].filter((id) => !current.has(id));
  if (remove.length) {
    check(
      await supabase
        .from("license_type_documents")
        .delete()
        .eq("license_type_id", licenseTypeId)
        .in("document_type_id", remove),
    );
  }
  if (add.length) {
    check(
      await supabase
        .from("license_type_documents")
        .insert(add.map((document_type_id) => ({ license_type_id: licenseTypeId, document_type_id }))),
    );
  }
}
