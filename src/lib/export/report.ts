/**
 * Ekspor laporan ke Excel (.xlsx), PDF, dan CSV dari satu model tabel.
 * Library Excel/PDF dimuat saat dibutuhkan (dynamic import) agar tidak memperberat halaman lain.
 */
import { downloadText, timestampedName, toCsv } from "@/components/data-table/csv";

export type Cell = string | number | null;

export type ReportColumn = {
  header: string;
  align?: "left" | "right" | "center";
  /** Lebar kolom Excel dalam karakter. */
  width?: number;
};

export type ReportModel = {
  title: string;
  /** Mis. "Periode 1 Januari 2026 – 7 Oktober 2026 · Kecamatan: semua". */
  subtitle?: string;
  columns: ReportColumn[];
  rows: Cell[][];
  totals?: Cell[];
  orientation?: "portrait" | "landscape";
  fileBase: string;
  meta: { agency: string; printedBy: string; printedAt: Date };
};

const printedLine = (m: ReportModel) =>
  `Dicetak ${new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Makassar" }).format(
    m.meta.printedAt,
  )} WITA oleh ${m.meta.printedBy}`;

export function exportReportCsv(m: ReportModel) {
  const rows = m.totals ? [...m.rows, m.totals] : m.rows;
  const csv = toCsv(
    rows,
    m.columns.map((c, i) => ({ header: c.header, value: (r: Cell[]) => r[i] })),
  );
  downloadText(timestampedName(m.fileBase, "csv"), csv);
}

export async function exportReportXlsx(m: ReportModel) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  type XCell = { value?: string | number; type?: StringConstructor | NumberConstructor; [k: string]: unknown } | null;
  const n = m.columns.length;
  const span = (value: string, extra: Record<string, unknown> = {}): XCell[] => [
    { value, type: String, columnSpan: n, ...extra },
    ...Array.from({ length: n - 1 }, () => null),
  ];
  const border = { borderStyle: "thin", borderColor: "#BCCFEB" };
  const cell = (v: Cell, c: ReportColumn, extra: Record<string, unknown> = {}): XCell =>
    v === null || v === ""
      ? { value: "", type: String, ...border, ...extra }
      : typeof v === "number"
        ? { value: v, type: Number, align: c.align ?? "right", ...border, ...extra }
        : { value: v, type: String, align: c.align ?? "left", wrap: true, ...border, ...extra };

  const data: XCell[][] = [
    span(m.meta.agency, { fontWeight: "bold", fontSize: 12 }),
    span(m.title, { fontWeight: "bold", fontSize: 14 }),
    ...(m.subtitle ? [span(m.subtitle, { textColor: "#334155" })] : []),
    span(printedLine(m), { textColor: "#64748B", fontSize: 9 }),
    Array.from({ length: n }, () => null),
    m.columns.map((c) => ({
      value: c.header,
      type: String,
      fontWeight: "bold",
      backgroundColor: "#112A50",
      textColor: "#FFFFFF",
      align: c.align ?? "left",
      wrap: true,
      ...border,
    })),
    ...m.rows.map((r) => m.columns.map((c, i) => cell(r[i] ?? null, c))),
    ...(m.totals ? [m.columns.map((c, i) => cell(m.totals![i] ?? null, c, { fontWeight: "bold", backgroundColor: "#F1F5FB" }))] : []),
  ];

  await writeXlsxFile(data as never, {
    sheet: "Laporan",
    columns: m.columns.map((c) => ({ width: c.width ?? Math.max(12, Math.min(40, c.header.length + 4)) })),
    orientation: m.orientation === "landscape" ? "landscape" : undefined,
  }).toFile(timestampedName(m.fileBase, "xlsx"));
}

export async function exportReportPdf(m: ReportModel) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: m.orientation ?? "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Kop laporan
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(m.meta.agency.toUpperCase(), W / 2, 16, { align: "center", maxWidth: W - 2 * margin });
  doc.setLineWidth(0.6);
  doc.line(margin, 22, W - margin, 22);
  doc.setFontSize(13);
  doc.text(m.title, W / 2, 30, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let y = 35;
  if (m.subtitle) {
    doc.text(m.subtitle, W / 2, y, { align: "center", maxWidth: W - 2 * margin });
    y += 5;
  }

  const fmt = (v: Cell) => (v === null ? "" : typeof v === "number" ? v.toLocaleString("id-ID") : v);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: margin, right: margin, bottom: 18 },
    head: [m.columns.map((c) => c.header)],
    body: m.rows.map((r) => m.columns.map((_, i) => fmt(r[i] ?? null))),
    foot: m.totals ? [m.columns.map((_, i) => fmt(m.totals![i] ?? null))] : undefined,
    showFoot: "lastPage",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.8, lineColor: [188, 207, 235], lineWidth: 0.1, overflow: "linebreak" },
    headStyles: { fillColor: [17, 42, 80], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [241, 245, 251], textColor: [11, 29, 56], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: Object.fromEntries(m.columns.map((c, i) => [i, { halign: c.align ?? "left" }])),
    // columnStyles hanya berlaku untuk badan tabel; samakan perataan judul kolom & baris total.
    didParseCell: (d) => {
      if (d.section !== "body") d.cell.styles.halign = m.columns[d.column.index]?.align ?? "left";
    },
  });

  // Kaki halaman: waktu cetak + nomor halaman
  const pages = doc.getNumberOfPages();
  const H = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(100);
    doc.text(printedLine(m), margin, H - 8);
    doc.text(`Halaman ${p} dari ${pages}`, W - margin, H - 8, { align: "right" });
  }
  doc.save(timestampedName(m.fileBase, "pdf"));
}
