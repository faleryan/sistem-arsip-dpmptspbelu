import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Archive, Download, ExternalLink, Eye, History } from "lucide-react";
import { toast } from "sonner";
import { DataTable, FilterSelect, useTableState } from "@/components/data-table";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useArchiveClasses, useDocumentTypes } from "@/hooks/useReference";
import { errorMessage } from "@/lib/errors";
import { MIME_LABEL } from "@/lib/files";
import { documentSpec } from "@/services/documents";
import { fetchAll, fetchPage } from "@/services/listQuery";
import { yearOptions } from "@/services/licenses";
import { downloadObject } from "@/services/storage";
import { DOC_STATUSES, DOC_STATUS_LABEL, type DocumentRow } from "@/types/entities";
import { DocumentDialogs, type DocDialog } from "./DocumentDialogs";
import { documentColumns } from "./documentColumns";


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
        columns={documentColumns}
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
