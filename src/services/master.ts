import { supabase } from "@/lib/supabase";
import { AppError, check, toAppError } from "@/lib/errors";
import type { ListSpec } from "./listQuery";
import type { MasterEntity, MasterRow } from "@/pages/master/entities";

export function masterSpec(entity: MasterEntity): ListSpec {
  return {
    table: entity.table,
    select: entity.select,
    searchColumns: entity.searchColumns,
    defaultSort: entity.defaultSort,
    sortable: entity.sortable,
    apply: (q, f) => (entity.filterDistrict && f.district ? q.eq("district_id", f.district) : q),
  };
}

export async function saveMaster(entity: MasterEntity, id: string | null, payload: Record<string, unknown>): Promise<MasterRow> {
  const q = id
    ? supabase.from(entity.table).update(payload).eq("id", id).select("id").single()
    : supabase.from(entity.table).insert(payload).select("id").single();
  return check(await q) as MasterRow;
}

export async function deleteMaster(entity: MasterEntity, id: string): Promise<void> {
  for (const u of entity.usedBy ?? []) {
    const { count, error } = await supabase.from(u.table).select("id", { count: "exact", head: true }).eq(u.column, id);
    if (error) throw toAppError(error);
    if (count) {
      throw new AppError(`Tidak dapat dihapus: masih dipakai oleh ${count.toLocaleString("id-ID")} ${u.label}.`);
    }
  }
  const res = await supabase.from(entity.table).delete().eq("id", id).select("id");
  const rows = check(res) as { id: string }[];
  // RLS menyaring baris tanpa galat: 0 baris = tidak berwenang / sudah dihapus.
  if (!rows.length) throw new Error("Data tidak dapat dihapus (tidak berwenang atau sudah tidak ada).");
}
