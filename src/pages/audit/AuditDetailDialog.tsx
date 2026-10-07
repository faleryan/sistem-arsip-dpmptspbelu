import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Modal } from "@/components/shared/Modal";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DetailList } from "@/components/shared/DetailList";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import {
  AUDIT_ACTION_LABEL,
  AUDIT_ACTION_TONE,
  AUDIT_MODULE_LABEL,
  FIELD_LABEL,
  getAuditEntry,
  resolveRecordLink,
  type AuditDetail,
} from "@/services/audit";
import { formatDateTime } from "@/utils/format";
import { ROLE_LABEL, type AppRole } from "@/types/domain";

// Kolom teknis yang tidak informatif bagi pembaca audit.
const HIDDEN = new Set(["updated_at", "created_at", "id"]);

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Ya" : "Tidak";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

type Change = { key: string; before?: unknown; after?: unknown };

function changesOf(e: AuditDetail): { mode: "diff" | "after" | "before"; rows: Change[] } {
  const keys = (o: Record<string, unknown> | null) => Object.keys(o ?? {}).filter((k) => !HIDDEN.has(k));
  if (e.old_value && e.new_value) {
    return { mode: "diff", rows: keys(e.new_value).map((k) => ({ key: k, before: e.old_value?.[k], after: e.new_value?.[k] })) };
  }
  if (e.new_value) {
    return { mode: "after", rows: keys(e.new_value).filter((k) => e.new_value?.[k] !== null).map((k) => ({ key: k, after: e.new_value?.[k] })) };
  }
  return { mode: "before", rows: keys(e.old_value).map((k) => ({ key: k, before: e.old_value?.[k] })) };
}

export function AuditDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["audit", "entry", id], queryFn: () => getAuditEntry(id) });
  const link = useQuery({
    queryKey: ["audit", "link", q.data?.module, q.data?.record_id],
    queryFn: () => resolveRecordLink(q.data!.module, q.data!.record_id),
    enabled: !!q.data,
  });
  const e = q.data;

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title="Detail aktivitas"
      footer={
        <>
          {link.data ? (
            <Button
              variant="outline"
              onClick={() => {
                onClose();
                navigate(link.data!);
              }}
            >
              <ExternalLink className="h-4 w-4" aria-hidden /> Buka data
            </Button>
          ) : null}
          <Button onClick={onClose}>Tutup</Button>
        </>
      }
    >
      {q.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : q.isError || !e ? (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage(q.error)}
        </p>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={AUDIT_ACTION_TONE[e.action] ?? "DRAFT"} label={AUDIT_ACTION_LABEL[e.action] ?? e.action} />
              <span className="text-sm font-medium">{e.description}</span>
            </div>
            <DetailList
              items={[
                ["Waktu", formatDateTime(e.created_at)],
                ["Pengguna", e.user_name ? `${e.user_name}${e.user_role ? ` (${ROLE_LABEL[e.user_role as AppRole] ?? e.user_role})` : ""}` : "Sistem"],
                ["Modul", AUDIT_MODULE_LABEL[e.module] ?? e.module],
                ["ID data", e.record_id ? <span className="font-mono text-xs">{e.record_id}</span> : null],
                ["Alamat IP", e.ip_address],
                ["Perangkat", e.user_agent ? <span className="text-xs text-muted-foreground">{e.user_agent}</span> : null],
              ]}
            />
          </div>

          <ChangeTable entry={e} />
        </div>
      )}
    </Modal>
  );
}

function ChangeTable({ entry }: { entry: AuditDetail }) {
  const { mode, rows } = changesOf(entry);
  if (!rows.length) return <p className="text-sm text-muted-foreground">Tidak ada rincian perubahan.</p>;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">
        {mode === "diff" ? "Perubahan" : mode === "after" ? "Data yang dicatat" : "Data sebelum dihapus"}
      </h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2">Kolom</th>
              {mode === "diff" ? (
                <>
                  <th scope="col" className="px-3 py-2">Sebelum</th>
                  <th scope="col" className="w-6 px-1 py-2"><span className="sr-only">menjadi</span></th>
                  <th scope="col" className="px-3 py-2">Sesudah</th>
                </>
              ) : (
                <th scope="col" className="px-3 py-2">Nilai</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.key} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 font-medium">
                  {FIELD_LABEL[r.key] ?? r.key}
                  {FIELD_LABEL[r.key] ? <span className="block font-mono text-[11px] font-normal text-muted-foreground">{r.key}</span> : null}
                </td>
                {mode === "diff" ? (
                  <>
                    <td className="break-all px-3 py-2 text-red-700">{show(r.before)}</td>
                    <td className="px-1 py-2 text-muted-foreground">
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </td>
                    <td className="break-all px-3 py-2 text-emerald-700">{show(r.after)}</td>
                  </>
                ) : (
                  <td className="break-all px-3 py-2">{show(mode === "after" ? r.after : r.before)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
