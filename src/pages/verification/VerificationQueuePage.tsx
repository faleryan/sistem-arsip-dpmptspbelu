import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ClipboardCheck, ExternalLink, FileText, History, ImageIcon } from "lucide-react";
import { DataTable, FilterSelect, useTableState, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useDocumentTypes } from "@/hooks/useReference";
import { documentSpec } from "@/services/documents";
import { fetchAll, fetchPage } from "@/services/listQuery";
import { formatDateTime } from "@/utils/format";
import { LICENSE_STATUS_LABEL, type DocumentRow } from "@/types/entities";
import { DocumentDialogs, type DocDialog } from "@/pages/documents/DocumentDialogs";

/** Dokumen versi aktif yang menunggu pemeriksaan, pada izin yang sedang dalam tahap verifikasi. */
const QUEUE = { status: "MENUNGGU_VERIFIKASI", license_status: "DIAJUKAN,VERIFIKASI" };

const columns: Column<DocumentRow>[] = [
  {
    id: "title",
    header: "Dokumen",
    cell: (r) => {
      const Icon = r.mime_type === "application/pdf" ? FileText : ImageIcon;
      return (
        <span className="flex min-w-[200px] items-center gap-2.5">
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
    id: "license",
    header: "Izin",
    cell: (r) => (
      <Link to={`/perizinan/${r.license_id}`} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap font-mono text-xs text-accent hover:underline">
        {r.license_number ?? r.application_number}
      </Link>
    ),
    sortField: "application_number",
    exportValue: (r) => r.license_number ?? r.application_number,
  },
  { id: "applicant", header: "Pemohon", cell: (r) => r.applicant_name, exportValue: (r) => r.applicant_name },
  {
    id: "license_status",
    header: "Status izin",
    cell: (r) => <StatusBadge status={r.license_status} label={LICENSE_STATUS_LABEL[r.license_status]} />,
    exportValue: (r) => LICENSE_STATUS_LABEL[r.license_status],
  },
  {
    id: "version",
    header: "Versi",
    cell: (r) =>
      (r.version_no ?? 1) > 1 ? (
        <span className="whitespace-nowrap text-amber-700" title="Unggahan ulang setelah ditolak atau diganti">
          v{r.version_no} (ulang)
        </span>
      ) : (
        `v${r.version_no ?? 1}`
      ),
    exportValue: (r) => r.version_no,
  },
  {
    id: "uploaded_at",
    header: "Diunggah",
    cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.uploaded_at)}</span>,
    sortField: "uploaded_at",
    exportValue: (r) => r.uploaded_at,
  },
];

export default function VerificationQueuePage() {
  const navigate = useNavigate();
  const table = useTableState();
  // Antrean: yang paling lama menunggu tampil lebih dulu.
  const spec = useMemo(() => documentSpec(QUEUE, { field: "uploaded_at", asc: true }), []);
  const types = useDocumentTypes();
  const [dialog, setDialog] = useState<DocDialog>(null);

  const list = useQuery({
    queryKey: ["documents", "queue", table.params],
    queryFn: () => fetchPage<DocumentRow>(spec, table.params),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Antrean Verifikasi"
        description="Dokumen yang menunggu diperiksa, dari permohonan berstatus Diajukan atau Verifikasi. Yang paling lama menunggu tampil lebih dulu."
      />
      <DataTable
        tableId="verification-queue"
        exportName="antrean_verifikasi"
        columns={columns}
        rows={list.data?.rows}
        total={list.data?.total ?? 0}
        loading={list.isLoading}
        fetching={list.isFetching}
        error={list.error}
        onRetry={() => list.refetch()}
        state={table}
        getRowId={(r) => r.id}
        onRowClick={(r) => setDialog({ kind: "verify", doc: r })}
        rowActions={[
          { label: "Periksa", icon: ClipboardCheck, onSelect: (r) => setDialog({ kind: "verify", doc: r }) },
          { label: "Riwayat versi", icon: History, onSelect: (r) => setDialog({ kind: "versions", doc: r }) },
          { label: "Buka izin", icon: ExternalLink, onSelect: (r) => navigate(`/perizinan/${r.license_id}`) },
        ]}
        searchPlaceholder="Cari dokumen, no. permohonan, pemohon…"
        exportAll={() => fetchAll<DocumentRow>(spec, table.params)}
        filters={
          <FilterSelect
            label="Jenis dokumen"
            value={table.params.filters.type}
            onChange={(v) => table.setFilter("type", v)}
            options={(types.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          />
        }
        empty={{
          icon: ClipboardCheck,
          title: "Tidak ada dokumen yang menunggu",
          description: "Semua dokumen pada permohonan yang diajukan sudah diperiksa.",
        }}
      />
      <DocumentDialogs dialog={dialog} onClose={() => setDialog(null)} onOpen={setDialog} />
    </>
  );
}
