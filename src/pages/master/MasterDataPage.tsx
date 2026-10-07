import { useMemo, useState } from "react";
import { NavLink, Navigate, useParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DataTable, FilterSelect, useTableState, type RowAction } from "@/components/data-table";
import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useDistricts, REF_KEY } from "@/hooks/useReference";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { fetchAll, fetchPage } from "@/services/listQuery";
import { deleteMaster, masterSpec } from "@/services/master";
import { MASTER_ENTITIES, findEntity, type MasterEntity, type MasterRow } from "./entities";
import { MasterFormModal } from "./MasterFormModal";
import { RequiredDocsModal } from "./RequiredDocsModal";

export default function MasterDataPage() {
  const { slug } = useParams();
  const entity = findEntity(slug);
  if (!entity) return <Navigate to={`/master/${MASTER_ENTITIES[0].slug}`} replace />;
  // key: reset status tabel saat berpindah entitas.
  return <MasterTable key={entity.slug} entity={entity} />;
}

function MasterTable({ entity }: { entity: MasterEntity }) {
  const { hasRole } = useAuth();
  const canWrite = hasRole("super_admin");
  const qc = useQueryClient();
  const table = useTableState();
  const spec = useMemo(() => masterSpec(entity), [entity]);
  const districts = useDistricts();

  const [editing, setEditing] = useState<MasterRow | null | "new">(null);
  const [deleting, setDeleting] = useState<MasterRow | null>(null);
  const [docsFor, setDocsFor] = useState<MasterRow | null>(null);

  const list = useQuery({
    queryKey: ["master", entity.slug, table.params],
    queryFn: () => fetchPage<MasterRow>(spec, table.params),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (row: MasterRow) => deleteMaster(entity, row.id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["master", entity.slug] }),
        qc.invalidateQueries({ queryKey: REF_KEY }),
      ]);
      toast.success("Data dihapus.");
      setDeleting(null);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setDeleting(null);
    },
  });

  const actions: RowAction<MasterRow>[] = [
    ...(entity.requiredDocs
      ? [{ label: canWrite ? "Atur dokumen wajib" : "Lihat dokumen wajib", icon: FileCheck2, onSelect: (r: MasterRow) => setDocsFor(r) }]
      : []),
    ...(canWrite
      ? [
          { label: "Ubah", icon: Pencil, onSelect: (r: MasterRow) => setEditing(r) },
          { label: "Hapus", icon: Trash2, danger: true, onSelect: (r: MasterRow) => setDeleting(r) },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Master Data"
        description="Data rujukan yang dipakai di seluruh aplikasi."
        actions={
          canWrite ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" aria-hidden />
              Tambah {entity.singular}
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Jenis master data" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {MASTER_ENTITIES.map((e) => {
            const Icon = e.icon;
            return (
              <NavLink
                key={e.slug}
                to={`/master/${e.slug}`}
                className={({ isActive }) =>
                  cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                    isActive ? "bg-navy-800 text-white" : "text-muted-foreground hover:bg-white hover:text-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4" aria-hidden />
                {e.title}
              </NavLink>
            );
          })}
        </nav>

        <section aria-labelledby="master-title" className="min-w-0">
          <div className="mb-3">
            <h3 id="master-title" className="text-base font-semibold text-navy-900">
              {entity.title}
            </h3>
            <p className="text-sm text-muted-foreground">{entity.description}</p>
          </div>
          {!canWrite ? (
            <p className="mb-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              <Info className="h-4 w-4 shrink-0" aria-hidden />
              Hanya Super Admin yang dapat mengubah master data.
            </p>
          ) : null}
          <DataTable
            tableId={`master-${entity.slug}`}
            exportName={`master_${entity.slug}`}
            columns={entity.columns}
            rows={list.data?.rows}
            total={list.data?.total ?? 0}
            loading={list.isLoading}
            fetching={list.isFetching}
            error={list.error}
            onRetry={() => list.refetch()}
            state={table}
            getRowId={(r) => r.id}
            rowActions={actions}
            onRowClick={canWrite ? (r) => setEditing(r) : entity.requiredDocs ? (r) => setDocsFor(r) : undefined}
            searchPlaceholder={`Cari ${entity.singular}…`}
            exportAll={() => fetchAll<MasterRow>(spec, table.params)}
            filters={
              entity.filterDistrict ? (
                <FilterSelect
                  label="Kecamatan"
                  value={table.params.filters.district}
                  onChange={(v) => table.setFilter("district", v)}
                  options={(districts.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
                />
              ) : null
            }
            empty={{
              icon: entity.icon,
              title: `Belum ada data ${entity.singular}`,
              description: canWrite ? "Tambahkan data pertama dengan tombol Tambah." : undefined,
            }}
          />
        </section>
      </div>

      {editing ? (
        <MasterFormModal entity={entity} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
      {docsFor ? (
        <RequiredDocsModal
          licenseType={{ id: docsFor.id, name: String(docsFor.name) }}
          readOnly={!canWrite}
          onClose={() => setDocsFor(null)}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleting}
        danger
        busy={remove.isPending}
        title={`Hapus ${entity.singular}?`}
        message={
          entity.hasActive
            ? `"${String(deleting?.name ?? "")}" akan dihapus permanen. Bila sudah dipakai data lain, penghapusan ditolak — nonaktifkan saja melalui menu Ubah.`
            : `"${String(deleting?.name ?? "")}" akan dihapus permanen. Bila sudah dipakai data lain, penghapusan ditolak.`
        }
        confirmLabel="Hapus"
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
