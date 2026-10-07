import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { MIME_LABEL, formatBytes } from "@/lib/files";
import { cn } from "@/lib/utils";
import { listStaffNames } from "@/services/licenses";
import { downloadObject } from "@/services/storage";
import { listVersions, type VersionRow } from "@/services/versions";
import { formatDateTime } from "@/utils/format";
import type { DocumentRow } from "@/types/entities";
import { FilePreview } from "./FilePreview";

/** Semua versi dokumen (terbaru di atas), hasil verifikasi tiap versi, dan pratinjau versi terpilih. */
export function VersionHistoryDialog({ doc, onClose }: { doc: DocumentRow; onClose: () => void }) {
  const versions = useQuery({ queryKey: ["documents", "versions", doc.id], queryFn: () => listVersions(doc.id) });
  const staff = useQuery({ queryKey: ["staff-names"], queryFn: listStaffNames, staleTime: 5 * 60 * 1000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const list = versions.data ?? [];
  const selected = list.find((v) => v.id === selectedId) ?? list[0];
  const who = (id: string | null) => (id ? (staff.data?.get(id) ?? "Pengguna") : "Sistem");

  async function download(v: VersionRow) {
    setDownloading(v.id);
    try {
      await downloadObject(v.storage_path, v.file_name);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Modal open size="full" onClose={onClose} title={`Riwayat versi — ${doc.title}`}>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="max-h-[40vh] shrink-0 overflow-y-auto border-b lg:max-h-none lg:w-96 lg:border-b-0 lg:border-r">
          {versions.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : versions.isError ? (
            <p role="alert" className="p-4 text-sm text-red-600">
              {errorMessage(versions.error)}
            </p>
          ) : (
            <ol className="divide-y" aria-label="Daftar versi">
              {list.map((v) => {
                const last = v.verifications[0];
                const active = selected?.id === v.id;
                return (
                  <li key={v.id} className={cn("p-4", active && "bg-navy-50")}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      aria-current={active ? "true" : undefined}
                      className="w-full text-left"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-navy-900">Versi {v.version_no}</span>
                        {v.is_current ? (
                          <span className="rounded-full bg-navy-800 px-2 py-0.5 text-[11px] font-medium text-white">Aktif</span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={v.file_name}>
                        {v.file_name} · {MIME_LABEL[v.mime_type]} {formatBytes(v.size_bytes)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Diunggah {who(v.uploaded_by)} · {formatDateTime(v.uploaded_at)}
                      </span>
                    </button>
                    {v.verifications.map((r) => (
                      <p
                        key={r.id}
                        className={cn(
                          "mt-2 flex gap-1.5 rounded-md px-2 py-1.5 text-xs",
                          r.result === "DITOLAK" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800",
                        )}
                      >
                        {r.result === "DITOLAK" ? (
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        ) : (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                        <span>
                          {r.result === "DITOLAK" ? "Ditolak" : "Diterima"} oleh {who(r.verified_by)} · {formatDateTime(r.verified_at)}
                          {r.note ? <span className="mt-0.5 block whitespace-pre-line">"{r.note}"</span> : null}
                        </span>
                      </p>
                    ))}
                    {!last && v.is_current && doc.status === "MENUNGGU_VERIFIKASI" ? (
                      <p className="mt-2 text-xs text-amber-700">Menunggu verifikasi</p>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-7 px-2"
                      onClick={() => download(v)}
                      disabled={downloading === v.id}
                      aria-label={`Unduh versi ${v.version_no}`}
                    >
                      {downloading === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
                      Unduh
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}
        </aside>
        <div className="min-h-[45vh] flex-1 bg-slate-100 lg:min-h-0">
          {selected ? <FilePreview path={selected.storage_path} mime={selected.mime_type} title={`${doc.title} v${selected.version_no}`} /> : null}
        </div>
      </div>
    </Modal>
  );
}
