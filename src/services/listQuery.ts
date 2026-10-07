/**
 * Pembantu daftar server-side (paginasi, pencarian, urut, ekspor) di atas PostgREST.
 * Klien belum memakai tipe hasil generate, sehingga builder diketik longgar di sini saja.
 */
import { supabase } from "@/lib/supabase";
import { toAppError } from "@/lib/errors";

export type SortState = { field: string; asc: boolean } | null;

export type ListParams = {
  page: number; // mulai 1
  pageSize: number;
  search: string;
  sort: SortState;
  filters: Record<string, string>;
};

export type Page<T> = { rows: T[]; total: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Builder = any;

export type ListSpec = {
  table: string;
  select: string;
  searchColumns: string[];
  defaultSort: { field: string; asc: boolean };
  /** Kolom yang boleh dipakai untuk urut (mencegah urut pada kolom sembarang dari URL). */
  sortable: string[];
  /** Terapkan filter tambahan (dari dropdown filter, dsb.). */
  apply?: (q: Builder, filters: Record<string, string>) => Builder;
};

/** Hilangkan karakter yang punya arti khusus pada sintaks filter PostgREST. */
export function sanitizeSearch(term: string): string {
  return term
    .replace(/[,()*%\\"':]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function applyCommon(q: Builder, spec: ListSpec, params: Pick<ListParams, "search" | "sort" | "filters">): Builder {
  const term = sanitizeSearch(params.search);
  if (term && spec.searchColumns.length) {
    q = q.or(spec.searchColumns.map((c) => `${c}.ilike.*${term}*`).join(","));
  }
  if (spec.apply) q = spec.apply(q, params.filters);
  const sort = params.sort && spec.sortable.includes(params.sort.field) ? params.sort : spec.defaultSort;
  q = q.order(sort.field, { ascending: sort.asc, nullsFirst: false });
  // Urutan kedua yang stabil agar paginasi tidak melompat-lompat.
  if (sort.field !== "id") q = q.order("id", { ascending: true });
  return q;
}

export async function fetchPage<T>(spec: ListSpec, params: ListParams): Promise<Page<T>> {
  const from = (params.page - 1) * params.pageSize;
  let q = supabase.from(spec.table).select(spec.select, { count: "exact" });
  q = applyCommon(q, spec, params);
  const { data, count, error } = await q.range(from, from + params.pageSize - 1);
  if (error) throw toAppError(error);
  return { rows: (data ?? []) as T[], total: count ?? 0 };
}

/** Ambil semua baris sesuai filter aktif (untuk ekspor), per 1.000 baris, maksimal `limit`. */
export async function fetchAll<T>(
  spec: ListSpec,
  params: Pick<ListParams, "search" | "sort" | "filters">,
  limit = 10000,
): Promise<T[]> {
  const out: T[] = [];
  const chunk = 1000;
  for (let from = 0; from < limit; from += chunk) {
    let q = supabase.from(spec.table).select(spec.select);
    q = applyCommon(q, spec, params);
    const { data, error } = await q.range(from, Math.min(from + chunk, limit) - 1);
    if (error) throw toAppError(error);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < chunk) break;
  }
  return out;
}
