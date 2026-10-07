import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ClipboardList, Eye } from "lucide-react";
import type { ReactNode } from "react";
import { DataTable, FilterSelect, useTableState } from "@/components/data-table";
import { useDistricts, useLicenseTypes } from "@/hooks/useReference";
import { fetchAll, fetchPage } from "@/services/listQuery";
import { licenseSpec, yearOptions } from "@/services/licenses";
import { LICENSE_STATUSES, LICENSE_STATUS_LABEL, type LicenseRow } from "@/types/entities";
import { licenseColumns } from "./licenseColumns";

/**
 * Tabel izin yang dipakai di halaman Data Perizinan (lengkap dengan filter, tersimpan di URL)
 * dan di halaman detail pemohon/perusahaan (dibatasi `base`, status lokal).
 */
export function LicenseTable({
  tableId,
  base,
  urlSync = true,
  showFilters = true,
  emptyAction,
  hideColumns = [],
}: {
  tableId: string;
  base?: Record<string, string>;
  urlSync?: boolean;
  showFilters?: boolean;
  emptyAction?: ReactNode;
  hideColumns?: string[];
}) {
  const navigate = useNavigate();
  const table = useTableState({ urlSync, defaultPageSize: urlSync ? 25 : 10 });
  const spec = useMemo(() => licenseSpec(base), [base]);
  const types = useLicenseTypes();
  const districts = useDistricts();
  const columns = useMemo(() => licenseColumns.filter((c) => !hideColumns.includes(c.id)), [hideColumns]);

  const list = useQuery({
    queryKey: ["licenses", "list", tableId, base, table.params],
    queryFn: () => fetchPage<LicenseRow>(spec, table.params),
    placeholderData: keepPreviousData,
  });

  const f = table.params.filters;

  return (
    <DataTable
      tableId={tableId}
      exportName="data_perizinan"
      columns={columns}
      rows={list.data?.rows}
      total={list.data?.total ?? 0}
      loading={list.isLoading}
      fetching={list.isFetching}
      error={list.error}
      onRetry={() => list.refetch()}
      state={table}
      getRowId={(r) => r.id}
      onRowClick={(r) => navigate(`/perizinan/${r.id}`)}
      rowActions={[{ label: "Lihat detail", icon: Eye, onSelect: (r) => navigate(`/perizinan/${r.id}`) }]}
      searchPlaceholder="Cari no. permohonan/izin, pemohon, perusahaan, NIB, NIK…"
      exportAll={() => fetchAll<LicenseRow>(spec, table.params)}
      filters={
        showFilters ? (
          <>
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => table.setFilter("status", v)}
              options={LICENSE_STATUSES.map((s) => ({ value: s, label: LICENSE_STATUS_LABEL[s] }))}
            />
            <FilterSelect
              label="Jenis izin"
              value={f.type}
              onChange={(v) => table.setFilter("type", v)}
              options={(types.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
            />
            <FilterSelect
              label="Kecamatan"
              value={f.district}
              onChange={(v) => table.setFilter("district", v)}
              options={(districts.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
            />
            <FilterSelect
              label="Tahun"
              value={f.year}
              onChange={(v) => table.setFilter("year", v)}
              options={yearOptions().map((y) => ({ value: y, label: y }))}
              allLabel="Semua tahun"
            />
          </>
        ) : null
      }
      empty={{
        icon: ClipboardList,
        title: "Belum ada data perizinan",
        description: "Data izin yang Anda tambahkan akan tampil di sini.",
        action: emptyAction,
      }}
    />
  );
}
