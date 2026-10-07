import { supabase } from "@/lib/supabase";
import { check } from "@/lib/errors";
import type { Business } from "@/types/entities";
import { sanitizeSearch, type ListSpec } from "./listQuery";

const SELECT =
  "id, name, nib, npwp, entity_type, address, district_id, village_id, phone, email, person_in_charge, created_at, updated_at, district:districts(name), village:villages(name)";

export const ENTITY_TYPES = ["PT", "CV", "Koperasi", "UD", "Firma", "Yayasan", "Perorangan", "BUMDes", "Lainnya"];

export const businessSpec: ListSpec = {
  table: "businesses",
  select: SELECT,
  searchColumns: ["name", "nib", "npwp", "person_in_charge", "phone", "email"],
  defaultSort: { field: "name", asc: true },
  sortable: ["name", "nib", "entity_type", "created_at"],
  apply: (q, f) => {
    q = q.is("deleted_at", null);
    if (f.district) q = q.eq("district_id", f.district);
    if (f.entity_type) q = q.eq("entity_type", f.entity_type);
    return q;
  },
};

export type BusinessInput = {
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
};

export async function getBusiness(id: string): Promise<Business> {
  return check(await supabase.from("businesses").select(SELECT).eq("id", id).is("deleted_at", null).single()) as unknown as Business;
}

export async function saveBusiness(id: string | null, input: BusinessInput): Promise<Business> {
  const q = id
    ? supabase.from("businesses").update(input).eq("id", id).select(SELECT).single()
    : supabase.from("businesses").insert(input).select(SELECT).single();
  return check(await q) as unknown as Business;
}

export async function softDeleteBusiness(id: string): Promise<void> {
  check(await supabase.from("businesses").update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id").single());
}

export async function searchBusinesses(term: string, limit = 15): Promise<Pick<Business, "id" | "name" | "nib">[]> {
  let q = supabase.from("businesses").select("id, name, nib").is("deleted_at", null).order("name").limit(limit);
  const t = sanitizeSearch(term);
  if (t) q = q.or(`name.ilike.*${t}*,nib.ilike.*${t}*`);
  return check(await q) as Pick<Business, "id" | "name" | "nib">[];
}

export async function findBusinessByNib(nib: string, exceptId?: string): Promise<{ id: string; name: string } | null> {
  let q = supabase.from("businesses").select("id, name").eq("nib", nib).is("deleted_at", null).limit(1);
  if (exceptId) q = q.neq("id", exceptId);
  const rows = check(await q) as { id: string; name: string }[];
  return rows[0] ?? null;
}
