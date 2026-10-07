import { supabase } from "@/lib/supabase";
import { check } from "@/lib/errors";
import type { Applicant } from "@/types/entities";
import { sanitizeSearch, type ListSpec } from "./listQuery";

const SELECT =
  "id, full_name, nik, npwp, phone, email, address, district_id, village_id, created_at, updated_at, district:districts(name), village:villages(name)";

export const applicantSpec: ListSpec = {
  table: "applicants",
  select: SELECT,
  searchColumns: ["full_name", "nik", "npwp", "phone", "email"],
  defaultSort: { field: "full_name", asc: true },
  sortable: ["full_name", "nik", "created_at"],
  apply: (q, f) => {
    q = q.is("deleted_at", null);
    if (f.district) q = q.eq("district_id", f.district);
    return q;
  },
};

export type ApplicantInput = {
  full_name: string;
  nik: string | null;
  npwp: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  district_id: string | null;
  village_id: string | null;
};

export async function getApplicant(id: string): Promise<Applicant> {
  return check(await supabase.from("applicants").select(SELECT).eq("id", id).is("deleted_at", null).single()) as unknown as Applicant;
}

export async function saveApplicant(id: string | null, input: ApplicantInput): Promise<Applicant> {
  const q = id
    ? supabase.from("applicants").update(input).eq("id", id).select(SELECT).single()
    : supabase.from("applicants").insert(input).select(SELECT).single();
  return check(await q) as unknown as Applicant;
}

/** Hapus lunak (hanya Super Admin; ditegakkan trigger guard_soft_delete). */
export async function softDeleteApplicant(id: string): Promise<void> {
  check(await supabase.from("applicants").update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id").single());
}

/** Pencarian cepat untuk combobox di form perizinan. */
export async function searchApplicants(term: string, limit = 15): Promise<Pick<Applicant, "id" | "full_name" | "nik">[]> {
  let q = supabase.from("applicants").select("id, full_name, nik").is("deleted_at", null).order("full_name").limit(limit);
  const t = sanitizeSearch(term);
  if (t) q = q.or(`full_name.ilike.*${t}*,nik.ilike.*${t}*`);
  return check(await q) as Pick<Applicant, "id" | "full_name" | "nik">[];
}

/** Cek NIK yang sama sudah terdaftar (peringatan duplikat, bukan larangan). */
export async function findApplicantByNik(nik: string, exceptId?: string): Promise<{ id: string; full_name: string } | null> {
  let q = supabase.from("applicants").select("id, full_name").eq("nik", nik).is("deleted_at", null).limit(1);
  if (exceptId) q = q.neq("id", exceptId);
  const rows = check(await q) as { id: string; full_name: string }[];
  return rows[0] ?? null;
}
