import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDebounce } from "@/hooks/useDebounce";
import type { ListParams, SortState } from "@/services/listQuery";

export const PAGE_SIZES = [10, 25, 50, 100] as const;

type Options = {
  /** Simpan status tabel di URL (?q=&page=&sort=&f_status=) agar bisa dibagikan dan kembali dengan tombol Back. */
  urlSync?: boolean;
  defaultPageSize?: number;
};

type Raw = { q: string; page: number; size: number; sort: SortState; filters: Record<string, string> };

function parseSort(v: string | null): SortState {
  if (!v) return null;
  const [field, dir] = v.split(".");
  return field ? { field, asc: dir !== "desc" } : null;
}

export function useTableState({ urlSync = true, defaultPageSize = 25 }: Options = {}) {
  const [params, setParams] = useSearchParams();
  const [local, setLocal] = useState<Raw>({ q: "", page: 1, size: defaultPageSize, sort: null, filters: {} });

  const raw: Raw = useMemo(() => {
    if (!urlSync) return local;
    const filters: Record<string, string> = {};
    params.forEach((v, k) => {
      if (k.startsWith("f_") && v) filters[k.slice(2)] = v;
    });
    const size = Number(params.get("size"));
    return {
      q: params.get("q") ?? "",
      page: Math.max(1, Number(params.get("page")) || 1),
      size: (PAGE_SIZES as readonly number[]).includes(size) ? size : defaultPageSize,
      sort: parseSort(params.get("sort")),
      filters,
    };
  }, [urlSync, local, params, defaultPageSize]);

  const update = useCallback(
    (patch: Partial<Raw>) => {
      if (!urlSync) {
        setLocal((s) => ({ ...s, ...patch }));
        return;
      }
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const put = (k: string, v: string | null) => (v ? next.set(k, v) : next.delete(k));
          if ("q" in patch) put("q", patch.q ?? null);
          if ("page" in patch) put("page", patch.page && patch.page > 1 ? String(patch.page) : null);
          if ("size" in patch) put("size", patch.size && patch.size !== defaultPageSize ? String(patch.size) : null);
          if ("sort" in patch) put("sort", patch.sort ? `${patch.sort.field}.${patch.sort.asc ? "asc" : "desc"}` : null);
          if (patch.filters) {
            [...next.keys()].filter((k) => k.startsWith("f_")).forEach((k) => next.delete(k));
            Object.entries(patch.filters).forEach(([k, v]) => v && next.set(`f_${k}`, v));
          }
          return next;
        },
        { replace: true },
      );
    },
    [urlSync, setParams, defaultPageSize],
  );

  // Kotak pencarian: nilai ketikan lokal, dikirim ke query setelah jeda (debounce).
  const [searchInput, setSearchInput] = useState(raw.q);
  const debounced = useDebounce(searchInput, 350);
  useEffect(() => {
    if (debounced !== raw.q) update({ q: debounced, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const listParams: ListParams = useMemo(
    () => ({ page: raw.page, pageSize: raw.size, search: raw.q, sort: raw.sort, filters: raw.filters }),
    [raw],
  );

  return {
    params: listParams,
    searchInput,
    setSearchInput,
    setPage: (page: number) => update({ page }),
    setPageSize: (size: number) => update({ size, page: 1 }),
    setSort: (sort: SortState) => update({ sort, page: 1 }),
    setFilter: (key: string, value: string) => update({ filters: { ...raw.filters, [key]: value }, page: 1 }),
    resetFilters: () => {
      setSearchInput("");
      update({ filters: {}, q: "", page: 1 });
    },
    activeFilterCount: Object.values(raw.filters).filter(Boolean).length + (raw.q ? 1 : 0),
  };
}

export type TableState = ReturnType<typeof useTableState>;
