import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Download,
  FilterX,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  SearchX,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/errors";
import { Pagination } from "./Pagination";
import type { Column, RowAction } from "./types";
import type { TableState } from "./useTableState";
import { downloadText, timestampedName, toCsv } from "./csv";

type Props<T> = {
  /** Kunci unik untuk menyimpan pilihan kolom di peramban. */
  tableId: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  total: number;
  loading: boolean;
  fetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  state: TableState;
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowActions?: RowAction<T>[];
  searchPlaceholder?: string;
  filters?: ReactNode;
  /** Ambil seluruh baris sesuai filter untuk diekspor. Kosong = tombol ekspor disembunyikan. */
  exportAll?: () => Promise<T[]>;
  exportName?: string;
  empty: { icon: LucideIcon; title: string; description?: string; action?: ReactNode };
};

function loadHidden(tableId: string, columns: Column<unknown>[]): Set<string> {
  try {
    const raw = window.localStorage.getItem(`sipar.cols.${tableId}`);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* penyimpanan peramban tidak tersedia: pakai bawaan */
  }
  return new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id));
}

export function DataTable<T>({
  tableId,
  columns,
  rows,
  total,
  loading,
  fetching,
  error,
  onRetry,
  state,
  getRowId,
  onRowClick,
  rowActions,
  searchPlaceholder = "Cari…",
  filters,
  exportAll,
  exportName,
  empty,
}: Props<T>) {
  const [hidden, setHidden] = useState<Set<string>>(() => loadHidden(tableId, columns as Column<unknown>[]));
  const [exporting, setExporting] = useState(false);
  const visible = useMemo(() => columns.filter((c) => !hidden.has(c.id)), [columns, hidden]);
  const { page, pageSize, sort } = state.params;
  const hasActions = !!rowActions?.length;

  useEffect(() => {
    try {
      window.localStorage.setItem(`sipar.cols.${tableId}`, JSON.stringify([...hidden]));
    } catch {
      /* abaikan */
    }
  }, [hidden, tableId]);

  // Bila halaman saat ini kosong (mis. setelah menghapus baris terakhir), mundur ke halaman terakhir.
  useEffect(() => {
    if (!loading && !error && rows && rows.length === 0 && page > 1 && total > 0) {
      state.setPage(Math.max(1, Math.ceil(total / pageSize)));
    }
  }, [loading, error, rows, page, total, pageSize, state]);

  function toggleSort(field: string) {
    if (!sort || sort.field !== field) state.setSort({ field, asc: true });
    else if (sort.asc) state.setSort({ field, asc: false });
    else state.setSort(null);
  }

  async function doExport() {
    if (!exportAll) return;
    setExporting(true);
    try {
      const all = await exportAll();
      const cols = columns.filter((c) => c.exportValue && !hidden.has(c.id));
      const csv = toCsv(all, cols.map((c) => ({ header: c.header, value: c.exportValue! })));
      downloadText(timestampedName(exportName ?? tableId), csv);
      toast.success(`${all.length.toLocaleString("id-ID")} baris diekspor ke CSV.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  const colSpan = visible.length + (hasActions ? 1 : 0);
  const filtered = state.activeFilterCount > 0;

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={state.searchInput}
            onChange={(e) => state.setSearchInput(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 pl-9"
            aria-label={searchPlaceholder}
          />
        </div>
        {filters}
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={state.resetFilters} className="h-9">
            <FilterX className="h-4 w-4" aria-hidden />
            Reset
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {fetching && !loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Memuat" /> : null}
          <Dropdown
            label="Pilih kolom"
            trigger={(p) => (
              <Button variant="outline" size="sm" className="h-9" {...p}>
                <Columns3 className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Kolom</span>
              </Button>
            )}
          >
            {() =>
              columns
                .filter((c) => c.hideable !== false)
                .map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-navy-800"
                      checked={!hidden.has(c.id)}
                      onChange={() =>
                        setHidden((h) => {
                          const n = new Set(h);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                    />
                    {c.header}
                  </label>
                ))
            }
          </Dropdown>
          {exportAll ? (
            <Button variant="outline" size="sm" className="h-9" onClick={doExport} disabled={exporting || total === 0}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
              <span className="hidden sm:inline">Ekspor CSV</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Tabel */}
      {/* relative: elemen absolute (mis. sr-only) ikut terpotong, tidak melebarkan halaman di ponsel */}
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              {visible.map((c) => {
                const active = !!c.sortField && sort?.field === c.sortField;
                const ariaSort = active ? (sort!.asc ? "ascending" : "descending") : undefined;
                return (
                  <th key={c.id} scope="col" aria-sort={ariaSort} className={cn("whitespace-nowrap px-4 py-3", c.headerClassName)}>
                    {c.sortField ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.sortField!)}
                        className="inline-flex items-center gap-1 uppercase hover:text-foreground"
                      >
                        {c.header}
                        {active ? (
                          sort!.asc ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {hasActions ? <th scope="col" className="w-12 px-2 py-3"><span className="sr-only">Aksi</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              Array.from({ length: Math.min(pageSize, 8) }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: colSpan }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-10">
                  <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
                    <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />
                    <p className="text-sm font-medium">Data gagal dimuat</p>
                    <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
                    {onRetry ? (
                      <Button variant="outline" size="sm" onClick={onRetry}>
                        <RefreshCw className="h-4 w-4" aria-hidden /> Coba lagi
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : !rows || rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="p-4">
                  {filtered ? (
                    <EmptyState
                      icon={SearchX}
                      title="Tidak ada data yang cocok"
                      description="Ubah kata kunci atau filter pencarian."
                      action={
                        <Button variant="outline" size="sm" onClick={state.resetFilters}>
                          <FilterX className="h-4 w-4" aria-hidden /> Reset filter
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState icon={empty.icon} title={empty.title} description={empty.description} action={empty.action} />
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={getRowId(row)}
                  className={cn("hover:bg-slate-50", onRowClick && "cursor-pointer")}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" && e.target === e.currentTarget) onRowClick(row);
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {visible.map((c) => (
                    <td key={c.id} className={cn("px-4 py-3 align-middle", c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                  {hasActions ? (
                    <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <RowMenu row={row} actions={rowActions!} />
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!error ? (
        <Pagination page={page} pageSize={pageSize} total={total} onPage={state.setPage} onPageSize={state.setPageSize} />
      ) : null}
    </div>
  );
}

function RowMenu<T>({ row, actions }: { row: T; actions: RowAction<T>[] }) {
  const list = actions.filter((a) => !a.hidden?.(row));
  if (!list.length) return null;
  return (
    <Dropdown
      label="Aksi"
      width={190}
      trigger={(p) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Aksi baris" {...p}>
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Button>
      )}
    >
      {(close) =>
        list.map((a) => {
          const Icon = a.icon;
          return (
            <MenuItem
              key={a.label}
              danger={a.danger}
              icon={Icon ? <Icon className="h-4 w-4" aria-hidden /> : undefined}
              onSelect={() => {
                close();
                a.onSelect(row);
              }}
            >
              {a.label}
            </MenuItem>
          );
        })
      }
    </Dropdown>
  );
}
