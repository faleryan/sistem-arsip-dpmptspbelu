import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Building2, Eye, Pencil, Plus } from "lucide-react";
import { DataTable, FilterSelect, useTableState, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useDistricts } from "@/hooks/useReference";
import { fetchAll, fetchPage } from "@/services/listQuery";
import { ENTITY_TYPES, businessSpec } from "@/services/businesses";
import { formatDate } from "@/utils/format";
import type { Business } from "@/types/entities";
import { BusinessFormModal } from "./BusinessFormModal";

const dash = (v: string | null | undefined) => v || "-";

const columns: Column<Business>[] = [
  {
    id: "name",
    header: "Nama Perusahaan",
    cell: (r) => <span className="font-medium text-navy-900">{r.name}</span>,
    sortField: "name",
    exportValue: (r) => r.name,
    hideable: false,
  },
  { id: "entity_type", header: "Bentuk", cell: (r) => dash(r.entity_type), sortField: "entity_type", exportValue: (r) => r.entity_type },
  { id: "nib", header: "NIB", cell: (r) => <span className="font-mono text-xs">{dash(r.nib)}</span>, sortField: "nib", exportValue: (r) => r.nib },
  { id: "npwp", header: "NPWP", cell: (r) => <span className="font-mono text-xs">{dash(r.npwp)}</span>, exportValue: (r) => r.npwp, defaultHidden: true },
  { id: "pic", header: "Penanggung Jawab", cell: (r) => dash(r.person_in_charge), exportValue: (r) => r.person_in_charge },
  { id: "phone", header: "Telepon", cell: (r) => dash(r.phone), exportValue: (r) => r.phone, defaultHidden: true },
  { id: "email", header: "Email", cell: (r) => dash(r.email), exportValue: (r) => r.email, defaultHidden: true },
  { id: "district", header: "Kecamatan", cell: (r) => dash(r.district?.name), exportValue: (r) => r.district?.name },
  { id: "address", header: "Alamat", cell: (r) => <span className="line-clamp-1 max-w-xs">{dash(r.address)}</span>, exportValue: (r) => r.address, defaultHidden: true },
  {
    id: "created_at",
    header: "Dibuat",
    cell: (r) => <span className="whitespace-nowrap">{formatDate(r.created_at)}</span>,
    sortField: "created_at",
    exportValue: (r) => r.created_at.slice(0, 10),
    defaultHidden: true,
  },
];

export default function BusinessesPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canWrite = hasRole("super_admin", "admin_arsip", "petugas");
  const table = useTableState();
  const districts = useDistricts();
  const [editing, setEditing] = useState<Business | null | "new">(null);

  const list = useQuery({
    queryKey: ["businesses", "list", table.params],
    queryFn: () => fetchPage<Business>(businessSpec, table.params),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Perusahaan"
        description="Badan usaha atau usaha perorangan pemegang izin."
        actions={
          canWrite ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" aria-hidden /> Tambah perusahaan
            </Button>
          ) : null
        }
      />
      <DataTable
        tableId="businesses"
        exportName="data_perusahaan"
        columns={columns}
        rows={list.data?.rows}
        total={list.data?.total ?? 0}
        loading={list.isLoading}
        fetching={list.isFetching}
        error={list.error}
        onRetry={() => list.refetch()}
        state={table}
        getRowId={(r) => r.id}
        onRowClick={(r) => navigate(`/perusahaan/${r.id}`)}
        rowActions={[
          { label: "Lihat detail", icon: Eye, onSelect: (r) => navigate(`/perusahaan/${r.id}`) },
          ...(canWrite ? [{ label: "Ubah", icon: Pencil, onSelect: (r: Business) => setEditing(r) }] : []),
        ]}
        searchPlaceholder="Cari nama, NIB, NPWP, penanggung jawab…"
        exportAll={() => fetchAll<Business>(businessSpec, table.params)}
        filters={
          <>
            <FilterSelect
              label="Bentuk usaha"
              value={table.params.filters.entity_type}
              onChange={(v) => table.setFilter("entity_type", v)}
              options={ENTITY_TYPES.map((t) => ({ value: t, label: t }))}
            />
            <FilterSelect
              label="Kecamatan"
              value={table.params.filters.district}
              onChange={(v) => table.setFilter("district", v)}
              options={(districts.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
            />
          </>
        }
        empty={{
          icon: Building2,
          title: "Belum ada perusahaan",
          description: canWrite ? "Tambahkan perusahaan baru, atau langsung dari form perizinan." : undefined,
        }}
      />
      {editing ? (
        <BusinessFormModal
          business={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(row) => editing === "new" && navigate(`/perusahaan/${row.id}`)}
        />
      ) : null}
    </>
  );
}
