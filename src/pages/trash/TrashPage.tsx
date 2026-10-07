import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, Building2, ClipboardList, FileText, Trash2, UserSquare2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { DataTable, useTableState, type Column, type RowAction } from "@/components/data-table";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { fetchAll, fetchPage } from "@/services/listQuery";
import { TRASH_SPECS, restoreRow, type TrashKind } from "@/services/trash";
import { formatDateTime } from "@/utils/format";
import { DOC_STATUS_LABEL, LICENSE_STATUS_LABEL, type DocStatus, type LicenseStatus } from "@/types/entities";

type Row = { id: string; deleted_at: string } & Record<string, unknown>;
const name = (o: unknown, k: string) => ((o as Record<string, unknown> | null)?.[k] as string | undefined) ?? "-";
const deletedCol: Column<Row> = {
  id: "deleted_at",
  header: "Dihapus",
  cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.deleted_at)}</span>,
  sortField: "deleted_at",
  exportValue: (r) => r.deleted_at,
};

const TABS: { kind: TrashKind; label: string; icon: LucideIcon; columns: Column<Row>[]; title: (r: Row) => string }[] = [
  {
    kind: "licenses",
    label: "Perizinan",
    icon: ClipboardList,
    title: (r) => String(r.license_number ?? r.application_number),
    columns: [
      { id: "no", header: "No. Permohonan / Izin", cell: (r) => <span className="font-mono text-xs">{String(r.license_number ?? r.application_number)}</span>, sortField: "application_number", exportValue: (r) => String(r.license_number ?? r.application_number), hideable: false },
      { id: "type", header: "Jenis izin", cell: (r) => name(r.license_type, "name"), exportValue: (r) => name(r.license_type, "name") },
      { id: "applicant", header: "Pemohon", cell: (r) => name(r.applicant, "full_name"), exportValue: (r) => name(r.applicant, "full_name") },
      { id: "status", header: "Status terakhir", cell: (r) => <StatusBadge status={String(r.status)} label={LICENSE_STATUS_LABEL[r.status as LicenseStatus]} />, exportValue: (r) => String(r.status) },
      deletedCol,
    ],
  },
  {
    kind: "applicants",
    label: "Pemohon",
    icon: UserSquare2,
    title: (r) => String(r.full_name),
    columns: [
      { id: "name", header: "Nama", cell: (r) => <span className="font-medium">{String(r.full_name)}</span>, sortField: "full_name", exportValue: (r) => String(r.full_name), hideable: false },
      { id: "nik", header: "NIK", cell: (r) => <span className="font-mono text-xs">{(r.nik as string) ?? "-"}</span>, exportValue: (r) => r.nik as string },
      { id: "phone", header: "Telepon", cell: (r) => (r.phone as string) ?? "-", exportValue: (r) => r.phone as string },
      deletedCol,
    ],
  },
  {
    kind: "businesses",
    label: "Perusahaan",
    icon: Building2,
    title: (r) => String(r.name),
    columns: [
      { id: "name", header: "Nama", cell: (r) => <span className="font-medium">{String(r.name)}</span>, sortField: "name", exportValue: (r) => String(r.name), hideable: false },
      { id: "nib", header: "NIB", cell: (r) => <span className="font-mono text-xs">{(r.nib as string) ?? "-"}</span>, exportValue: (r) => r.nib as string },
      { id: "entity", header: "Bentuk", cell: (r) => (r.entity_type as string) ?? "-", exportValue: (r) => r.entity_type as string },
      deletedCol,
    ],
  },
  {
    kind: "documents",
    label: "Dokumen",
    icon: FileText,
    title: (r) => String(r.title),
    columns: [
      { id: "title", header: "Judul", cell: (r) => <span className="font-medium">{String(r.title)}</span>, sortField: "title", exportValue: (r) => String(r.title), hideable: false },
      { id: "type", header: "Jenis", cell: (r) => name(r.document_type, "name"), exportValue: (r) => name(r.document_type, "name") },
      {
        id: "license",
        header: "Izin",
        cell: (r) => {
          const l = r.license as { license_number?: string; application_number?: string; deleted_at?: string | null } | null;
          return (
            <span className="font-mono text-xs">
              {l?.license_number ?? l?.application_number ?? "-"}
              {l?.deleted_at ? <span className="ml-1 font-sans text-red-600">(izin terhapus)</span> : null}
            </span>
          );
        },
        exportValue: (r) => name(r.license, "application_number"),
      },
      { id: "status", header: "Status", cell: (r) => <StatusBadge status={String(r.status)} label={DOC_STATUS_LABEL[r.status as DocStatus]} />, exportValue: (r) => String(r.status) },
      deletedCol,
    ],
  },
];

export default function TrashPage() {
  const { hasRole } = useAuth();
  const isSuper = hasRole("super_admin");
  const [kind, setKind] = useState<TrashKind>("licenses");
  const tab = TABS.find((t) => t.kind === kind)!;

  return (
    <>
      <PageHeader
        title="Data Terhapus"
        description="Data yang dihapus lunak tetap tersimpan dan dapat dipulihkan. Semua penghapusan dan pemulihan tercatat di Audit Log."
      />
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border bg-white p-1" role="tablist" aria-label="Jenis data">
        {TABS.map((t) => (
          <button
            key={t.kind}
            role="tab"
            aria-selected={kind === t.kind}
            onClick={() => setKind(t.kind)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium",
              kind === t.kind ? "bg-navy-800 text-white" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden /> {t.label}
          </button>
        ))}
      </div>
      {!isSuper ? (
        <p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Admin Arsip dapat memulihkan dokumen. Pemulihan perizinan, pemohon, dan perusahaan hanya oleh Super Admin.
        </p>
      ) : null}
      {/* key: status tabel (halaman, cari) direset saat berganti tab */}
      <TrashTable key={kind} kind={kind} columns={tab.columns} title={tab.title} canRestore={isSuper || kind === "documents"} />
    </>
  );
}

function TrashTable({ kind, columns, title, canRestore }: { kind: TrashKind; columns: Column<Row>[]; title: (r: Row) => string; canRestore: boolean }) {
  const qc = useQueryClient();
  const table = useTableState({ urlSync: false });
  const spec = useMemo(() => TRASH_SPECS[kind], [kind]);
  const [target, setTarget] = useState<Row | null>(null);

  const list = useQuery({
    queryKey: ["trash", kind, table.params],
    queryFn: () => fetchPage<Row>(spec, table.params),
    placeholderData: keepPreviousData,
  });

  const restore = useMutation({
    mutationFn: (r: Row) => restoreRow(kind, r.id),
    onSuccess: async () => {
      // Data kembali muncul di daftar utama, dashboard, dan arsip.
      await Promise.all(
        ["trash", "licenses", "applicants", "businesses", "documents", "dashboard"].map((k) => qc.invalidateQueries({ queryKey: [k] })),
      );
      toast.success("Data dipulihkan.");
      setTarget(null);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setTarget(null);
    },
  });

  const actions: RowAction<Row>[] = canRestore ? [{ label: "Pulihkan", icon: ArchiveRestore, onSelect: (r) => setTarget(r) }] : [];

  return (
    <>
      <DataTable
        tableId={`trash-${kind}`}
        exportName={`terhapus_${kind}`}
        columns={columns}
        rows={list.data?.rows}
        total={list.data?.total ?? 0}
        loading={list.isLoading}
        fetching={list.isFetching}
        error={list.error}
        onRetry={() => list.refetch()}
        state={table}
        getRowId={(r) => r.id}
        rowActions={actions}
        searchPlaceholder="Cari…"
        exportAll={() => fetchAll<Row>(spec, table.params)}
        empty={{ icon: Trash2, title: "Tidak ada data terhapus" }}
      />
      <ConfirmDialog
        open={!!target}
        busy={restore.isPending}
        title="Pulihkan data?"
        message={target ? `"${title(target)}" akan kembali muncul di daftar dan dapat dipakai lagi.` : ""}
        confirmLabel="Pulihkan"
        onConfirm={() => target && restore.mutate(target)}
        onClose={() => setTarget(null)}
      />
    </>
  );
}
