import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/utils/format";
import { PAGE_SIZES } from "./useTableState";

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      <p className="text-muted-foreground" aria-live="polite">
        {formatNumber(from)}–{formatNumber(to)} dari {formatNumber(total)} data
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-muted-foreground">
          <span className="hidden sm:inline">Baris per halaman</span>
          <select
            className="h-8 rounded-md border bg-white px-2 text-sm text-foreground"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            aria-label="Baris per halaman"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPage(1)} disabled={page <= 1} aria-label="Halaman pertama">
            <ChevronsLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Halaman sebelumnya">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <span className="min-w-[5.5rem] text-center tabular-nums">
            {formatNumber(Math.min(page, pages))} / {formatNumber(pages)}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Halaman berikutnya">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPage(pages)} disabled={page >= pages} aria-label="Halaman terakhir">
            <ChevronsRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
