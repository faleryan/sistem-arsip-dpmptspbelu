import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Info, ShieldCheck, X } from "lucide-react";
import { DataTable, FilterSelect, useTableState, type Column } from "@/components/data-table";
import { FilterDate } from "@/components/data-table/FilterDate";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { fetchAll, fetchPage } from "@/services/listQuery";
import { listStaffNames } from "@/services/licenses";
import { AUDIT_ACTION_LABEL, AUDIT_ACTION_TONE, AUDIT_MODULE_LABEL, auditSpec, type AuditRow } from "@/services/audit";
import { formatDateTime } from "@/utils/format";
import { todayWita } from "@/utils/date";
import { ROLE_LABEL, type AppRole } from "@/types/domain";
import { AuditDetailDialog } from "./AuditDetailDialog";

const columns: Column<AuditRow>[] = [
  {
    id: "created_at",
    header: "Waktu",
    cell: (r) => <span className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</span>,
    sortField: "created_at",
    exportValue: (r) => r.created_at,
    hideable: false,
  },
  {
    id: "user",
    header: "Pengguna",
    cell: (r) => (
      <span className="whitespace-nowrap">
        <span className="block font-medium">{r.user_name ?? "Sistem"}</span>
        {r.user_role ? <span className="text-xs text-muted-foreground">{ROLE_LABEL[r.user_role as AppRole] ?? r.user_role}</span> : null}
      </span>
    ),
    sortField: "user_name",
    exportValue: (r) => r.user_name ?? "Sistem",
  },
  {
    id: "action",
    header: "Aksi",
    cell: (r) => <StatusBadge status={AUDIT_ACTION_TONE[r.action] ?? "DRAFT"} label={AUDIT_ACTION_LABEL[r.action] ?? r.action} />,
    sortField: "action",
    exportValue: (r) => AUDIT_ACTION_LABEL[r.action] ?? r.action,
  },
  {
    id: "module",
    header: "Modul",
    cell: (r) => <span className="whitespace-nowrap">{AUDIT_MODULE_LABEL[r.module] ?? r.module}</span>,
    sortField: "module",
    exportValue: (r) => AUDIT_MODULE_LABEL[r.module] ?? r.module,
  },
  {
    id: "description",
    header: "Keterangan",
    cell: (r) => <span className="line-clamp-2 min-w-[260px]">{r.description ?? "-"}</span>,
    exportValue: (r) => r.description,
  },
  { id: "ip", header: "Alamat IP", cell: (r) => <span className="font-mono text-xs">{r.ip_address ?? "-"}</span>, exportValue: (r) => r.ip_address, defaultHidden: true },
  { id: "record", header: "ID data", cell: (r) => <span className="font-mono text-[11px]">{r.record_id ?? "-"}</span>, exportValue: (r) => r.record_id, defaultHidden: true },
];

export default function AuditLogPage() {
  const table = useTableState();
  const [openId, setOpenId] = useState<number | null>(null);
  const staff = useQuery({ queryKey: ["staff-names"], queryFn: listStaffNames, staleTime: 5 * 60 * 1000 });
  const f = table.params.filters;

  const list = useQuery({
    queryKey: ["audit", "list", table.params],
    queryFn: () => fetchPage<AuditRow>(auditSpec, table.params),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Semua perubahan data dicatat otomatis oleh database dan tidak dapat diubah atau dihapus dari aplikasi."
      />
      {f.record ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <span className="flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0" aria-hidden />
            Menampilkan jejak audit untuk satu data.
          </span>
          <Button variant="ghost" size="sm" className="h-7" onClick={() => table.setFilter("record", "")}>
            <X className="h-4 w-4" aria-hidden /> Semua aktivitas
          </Button>
        </div>
      ) : null}
      <DataTable
        tableId="audit"
        exportName="audit_log"
        columns={columns}
        rows={list.data?.rows}
        total={list.data?.total ?? 0}
        loading={list.isLoading}
        fetching={list.isFetching}
        error={list.error}
        onRetry={() => list.refetch()}
        state={table}
        getRowId={(r) => String(r.id)}
        onRowClick={(r) => setOpenId(r.id)}
        searchPlaceholder="Cari keterangan, nama pengguna, ID data…"
        exportAll={() => fetchAll<AuditRow>(auditSpec, table.params, 20000)}
        filters={
          <>
            <FilterSelect
              label="Aksi"
              value={f.action}
              onChange={(v) => table.setFilter("action", v)}
              options={Object.entries(AUDIT_ACTION_LABEL).map(([value, label]) => ({ value, label }))}
            />
            <FilterSelect
              label="Modul"
              value={f.module}
              onChange={(v) => table.setFilter("module", v)}
              options={Object.entries(AUDIT_MODULE_LABEL).map(([value, label]) => ({ value, label }))}
            />
            <FilterSelect
              label="Pengguna"
              value={f.user}
              onChange={(v) => table.setFilter("user", v)}
              options={[...(staff.data ?? new Map<string, string>())]
                .map(([value, label]) => ({ value, label }))
                .sort((a, b) => a.label.localeCompare(b.label))}
            />
            <FilterDate label="Dari" value={f.from} max={f.to || todayWita()} onChange={(v) => table.setFilter("from", v)} />
            <FilterDate label="Sampai" value={f.to} min={f.from} max={todayWita()} onChange={(v) => table.setFilter("to", v)} />
          </>
        }
        empty={{ icon: ShieldCheck, title: "Belum ada aktivitas tercatat" }}
      />
      {openId !== null ? <AuditDetailDialog id={openId} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}
