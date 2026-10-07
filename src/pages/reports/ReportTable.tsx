import type { Cell, ReportColumn } from "@/lib/export/report";
import { cn } from "@/lib/utils";

const SHOW_MAX = 500;
const fmt = (v: Cell) => (v === null || v === "" ? "-" : typeof v === "number" ? v.toLocaleString("id-ID") : v);

/** Tabel laporan di layar — dari model yang sama dengan file ekspor. */
export function ReportTable({ columns, rows, totals }: { columns: ReportColumn[]; rows: Cell[][]; totals?: Cell[] }) {
  const shown = rows.slice(0, SHOW_MAX);
  return (
    <>
      <div className="relative overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-navy-800 text-left text-xs font-semibold text-white">
            <tr>
              {columns.map((c) => (
                <th key={c.header} scope="col" className={cn("whitespace-nowrap px-3 py-2.5", c.align === "right" && "text-right")}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((r, i) => (
              <tr key={i} className="even:bg-slate-50/60">
                {columns.map((c, j) => (
                  <td key={j} className={cn("px-3 py-2", c.align === "right" && "text-right tabular-nums")}>
                    {fmt(r[j] ?? null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totals ? (
            <tfoot className="border-t-2 border-navy-200 bg-navy-50 font-semibold">
              <tr>
                {columns.map((c, j) => (
                  <td key={j} className={cn("px-3 py-2", c.align === "right" && "text-right tabular-nums")}>
                    {fmt(totals[j] ?? null)}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {rows.length > SHOW_MAX ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Menampilkan {SHOW_MAX.toLocaleString("id-ID")} dari {rows.length.toLocaleString("id-ID")} baris. File ekspor berisi seluruh baris.
        </p>
      ) : null}
    </>
  );
}
