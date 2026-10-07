import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye, Pencil, Plus, UserSquare2 } from "lucide-react";
import { DataTable, FilterSelect, useTableState, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useDistricts } from "@/hooks/useReference";
import { fetchAll, fetchPage } from "@/services/listQuery";
import { applicantSpec } from "@/services/applicants";
import { formatDate } from "@/utils/format";
import type { Applicant } from "@/types/entities";
import { ApplicantFormModal } from "./ApplicantFormModal";

const dash = (v: string | null | undefined) => v || "-";

const columns: Column<Applicant>[] = [
  {
    id: "full_name",
    header: "Nama",
    cell: (r) => <span className="font-medium text-navy-900">{r.full_name}</span>,
    sortField: "full_name",
    exportValue: (r) => r.full_name,
    hideable: false,
  },
  { id: "nik", header: "NIK", cell: (r) => <span className="font-mono text-xs">{dash(r.nik)}</span>, sortField: "nik", exportValue: (r) => r.nik },
  { id: "npwp", header: "NPWP", cell: (r) => <span className="font-mono text-xs">{dash(r.npwp)}</span>, exportValue: (r) => r.npwp, defaultHidden: true },
  { id: "phone", header: "Telepon", cell: (r) => dash(r.phone), exportValue: (r) => r.phone },
  { id: "email", header: "Email", cell: (r) => dash(r.email), exportValue: (r) => r.email, defaultHidden: true },
  { id: "district", header: "Kecamatan", cell: (r) => dash(r.district?.name), exportValue: (r) => r.district?.name },
  { id: "village", header: "Desa/Kel.", cell: (r) => dash(r.village?.name), exportValue: (r) => r.village?.name, defaultHidden: true },
  { id: "address", header: "Alamat", cell: (r) => <span className="line-clamp-1 max-w-xs">{dash(r.address)}</span>, exportValue: (r) => r.address, defaultHidden: true },
  {
    id: "created_at",
    header: "Dibuat",
    cell: (r) => <span className="whitespace-nowrap">{formatDate(r.created_at)}</span>,
    sortField: "created_at",
    exportValue: (r) => r.created_at.slice(0, 10),
  },
];

export default function ApplicantsPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canWrite = hasRole("super_admin", "admin_arsip", "petugas");
  const table = useTableState();
  const districts = useDistricts();
  const [editing, setEditing] = useState<Applicant | null | "new">(null);

  const list = useQuery({
    queryKey: ["applicants", "list", table.params],
    queryFn: () => fetchPage<Applicant>(applicantSpec, table.params),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Pemohon"
        description="Data perorangan yang mengajukan perizinan."
        actions={
          canWrite ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" aria-hidden /> Tambah pemohon
            </Button>
          ) : null
        }
      />
      <DataTable
        tableId="applicants"
        exportName="data_pemohon"
        columns={columns}
        rows={list.data?.rows}
        total={list.data?.total ?? 0}
        loading={list.isLoading}
        fetching={list.isFetching}
        error={list.error}
        onRetry={() => list.refetch()}
        state={table}
        getRowId={(r) => r.id}
        onRowClick={(r) => navigate(`/pemohon/${r.id}`)}
        rowActions={[
          { label: "Lihat detail", icon: Eye, onSelect: (r) => navigate(`/pemohon/${r.id}`) },
          ...(canWrite ? [{ label: "Ubah", icon: Pencil, onSelect: (r: Applicant) => setEditing(r) }] : []),
        ]}
        searchPlaceholder="Cari nama, NIK, NPWP, telepon, email…"
        exportAll={() => fetchAll<Applicant>(applicantSpec, table.params)}
        filters={
          <FilterSelect
            label="Kecamatan"
            value={table.params.filters.district}
            onChange={(v) => table.setFilter("district", v)}
            options={(districts.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          />
        }
        empty={{
          icon: UserSquare2,
          title: "Belum ada pemohon",
          description: canWrite ? "Tambahkan pemohon baru, atau langsung dari form perizinan." : undefined,
        }}
      />
      {editing ? (
        <ApplicantFormModal
          applicant={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(row) => editing === "new" && navigate(`/pemohon/${row.id}`)}
        />
      ) : null}
    </>
  );
}
