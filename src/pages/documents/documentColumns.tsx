import { Link } from "react-router-dom";
import { FileText, ImageIcon } from "lucide-react";
import type { Column } from "@/components/data-table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { MIME_LABEL, formatBytes } from "@/lib/files";
import { formatDate, formatDateTime } from "@/utils/format";
import { DOC_STATUS_LABEL, type DocumentRow } from "@/types/entities";

/** Kolom tabel dokumen (Arsip Digital, Pencarian Arsip). */
const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "-" : v);

export const documentColumns: Column<DocumentRow>[] = [
  {
    id: "title",
    header: "Dokumen",
    cell: (r) => {
      const Icon = r.mime_type === "application/pdf" ? FileText : ImageIcon;
      return (
        <span className="flex min-w-[220px] items-center gap-2.5">
          <Icon className={`h-4 w-4 shrink-0 ${r.mime_type === "application/pdf" ? "text-red-600" : "text-blue-600"}`} aria-hidden />
          <span className="min-w-0">
            <span className="block truncate font-medium text-navy-900">{r.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{r.file_name}</span>
          </span>
        </span>
      );
    },
    sortField: "title",
    exportValue: (r) => r.title,
    hideable: false,
  },
  { id: "type", header: "Jenis", cell: (r) => r.document_type_name, sortField: "document_type_name", exportValue: (r) => r.document_type_name },
  {
    id: "number",
    header: "No. Dokumen",
    cell: (r) => <span className="whitespace-nowrap font-mono text-xs">{dash(r.document_number)}</span>,
    sortField: "document_number",
    exportValue: (r) => r.document_number,
  },
  {
    id: "license",
    header: "Izin",
    cell: (r) => (
      <Link
        to={`/perizinan/${r.license_id}`}
        onClick={(e) => e.stopPropagation()}
        className="whitespace-nowrap font-mono text-xs text-accent hover:underline"
      >
        {r.license_number ?? r.application_number}
      </Link>
    ),
    sortField: "application_number",
    exportValue: (r) => r.license_number ?? r.application_number,
  },
  { id: "applicant", header: "Pemohon", cell: (r) => r.applicant_name, exportValue: (r) => r.applicant_name },
  { id: "business", header: "Perusahaan", cell: (r) => dash(r.business_name), exportValue: (r) => r.business_name, defaultHidden: true },
  {
    id: "status",
    header: "Status",
    cell: (r) => <StatusBadge status={r.status} label={DOC_STATUS_LABEL[r.status]} />,
    sortField: "status",
    exportValue: (r) => DOC_STATUS_LABEL[r.status],
  },
  { id: "version", header: "Versi", cell: (r) => `v${r.version_no ?? "-"}`, exportValue: (r) => r.version_no },
  {
    id: "size",
    header: "Ukuran",
    cell: (r) => (
      <span className="whitespace-nowrap">
        {MIME_LABEL[r.mime_type ?? ""] ?? "-"} · {formatBytes(r.size_bytes)}
      </span>
    ),
    sortField: "size_bytes",
    exportValue: (r) => r.size_bytes,
  },
  {
    id: "class",
    header: "Klasifikasi",
    cell: (r) => (r.archive_class_code ? `${r.archive_class_code} — ${r.archive_class_name}` : "-"),
    exportValue: (r) => r.archive_class_code,
    defaultHidden: true,
  },
  {
    id: "document_date",
    header: "Tgl. Dokumen",
    cell: (r) => <span className="whitespace-nowrap">{formatDate(r.document_date)}</span>,
    sortField: "document_date",
    exportValue: (r) => r.document_date,
    defaultHidden: true,
  },
  {
    id: "uploaded_at",
    header: "Diunggah",
    cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.uploaded_at)}</span>,
    sortField: "uploaded_at",
    exportValue: (r) => r.uploaded_at,
  },
  { id: "year", header: "Tahun", cell: (r) => dash(r.year), sortField: "year", exportValue: (r) => r.year, defaultHidden: true },
  { id: "checksum", header: "SHA-256", cell: (r) => <span className="font-mono text-[11px]">{r.checksum_sha256?.slice(0, 16) ?? "-"}</span>, exportValue: (r) => r.checksum_sha256, defaultHidden: true },
];
