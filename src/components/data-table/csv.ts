/**
 * Ekspor CSV yang ramah Excel berbahasa Indonesia: pemisah titik koma, BOM UTF-8,
 * dan perlindungan dari CSV/formula injection (sel diawali = + - @ diberi tanda kutip tunggal).
 */
export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null | undefined };

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(";")];
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(";"));
  return "﻿" + lines.join("\r\n");
}

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function timestampedName(base: string, ext = "csv"): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${base}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
}
