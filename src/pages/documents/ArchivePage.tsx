import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Archive, Download, ExternalLink, Eye, FileText, History, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { DataTable, FilterSelect, useTableState, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAuth } from "@/hooks/useAuth";
import { useArchiveClasses, useDocumentTypes } from "@/hooks/useReference";
import { errorMessage } from "@/lib/errors";
import { MIME_LABEL, formatBytes } from "@/lib/files";
import { documentSpec } from "@/services/documents";
import { fetchAll, fetchPage } from "@/services/listQuery";
import { yearOptions } from "@/services/licenses";
import { downloadObject } from "@/services/storage";
import { formatDate, formatDateTime } from "@/utils/format";
import { DOC_STATUSES, DOC_STATUS_LABEL, type DocumentRow } from "@/types/entities";
import { DocumentDialogs, type DocDialog } from "./DocumentDialogs";

const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "-" : v);

const columns: Column<DocumentRow>[] = [
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

export default function ArchivePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const viewer = profile?.role === "viewer";
  const table = useTableState();
  const spec = useMemo(() => documentSpec(), []);
  const types = useDocumentTypes();
  const classes = useArchiveClasses();
  const [dialog, setDialog] = useState<DocDialog>(null);
  const f = table.params.filters;

  const list = useQuery({
    queryKey: ["documents", "list", table.params],
    queryFn: () => fetchPage<DocumentRow>(spec, table.params),
    placeholderData: keepPreviousData,
  });

  async function download(d: DocumentRow) {
    if (!d.storage_path || !d.file_name) return;
    try {
      await downloadObject(d.storage_path, d.file_name);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Arsip Digital"
        description={
          viewer
            ? "Surat izin yang sudah terbit."
            : "Seluruh dokumen perizinan (versi aktif). Unggah dokumen dari halaman detail izin."
        }
      />
      <DataTable
        tableId="archive"
        exportName="arsip_dokumen"
        columns={columns}
        rows={list.data?.rows}
        total={list.data?.total ?? 0}
        loading={list.isLoading}
        fetching={list.isFetching}
        error={list.error}
        onRetry={() => list.refetch()}
        state={table}
        getRowId={(r) => r.id}
        onRowClick={(r) => setDialog({ kind: "preview", doc: r })}
        rowActions={[
          { label: "Lihat", icon: Eye, onSelect: (r) => setDialog({ kind: "preview", doc: r }) },
          { label: "Unduh", icon: Download, onSelect: download },
          { label: "Riwayat versi", icon: History, onSelect: (r) => setDialog({ kind: "versions", doc: r }) },
          { label: "Buka izin", icon: ExternalLink, onSelect: (r) => navigate(`/perizinan/${r.license_id}`) },
        ]}
        searchPlaceholder="Cari judul, nomor dokumen, nama file, no. izin, pemohon…"
        exportAll={() => fetchAll<DocumentRow>(spec, table.params)}
        filters={
          <>
            <FilterSelect
              label="Jenis dokumen"
              value={f.type}
              onChange={(v) => table.setFilter("type", v)}
              options={(types.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
            />
            {!viewer ? (
              <FilterSelect
                label="Status"
                value={f.status}
                onChange={(v) => table.setFilter("status", v)}
                options={DOC_STATUSES.map((s) => ({ value: s, label: DOC_STATUS_LABEL[s] }))}
              />
            ) : null}
            <FilterSelect
              label="Klasifikasi"
              value={f.class}
              onChange={(v) => table.setFilter("class", v)}
              options={(classes.data ?? []).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
            />
            <FilterSelect
              label="Format"
              value={f.mime}
              onChange={(v) => table.setFilter("mime", v)}
              options={Object.entries(MIME_LABEL).map(([value, label]) => ({ value, label }))}
            />
            <FilterSelect
              label="Tahun"
              value={f.year}
              onChange={(v) => table.setFilter("year", v)}
              options={yearOptions().map((y) => ({ value: y, label: y }))}
              allLabel="Semua tahun"
            />
          </>
        }
        empty={{
          icon: Archive,
          title: "Belum ada dokumen arsip",
          description: viewer ? undefined : "Dokumen diunggah dari halaman detail masing-masing izin.",
        }}
      />
      <DocumentDialogs dialog={dialog} onClose={() => setDialog(null)} onOpen={setDialog} />
    </>
  );
}
