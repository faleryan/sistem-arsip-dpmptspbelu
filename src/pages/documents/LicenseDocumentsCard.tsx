import { useState } from "react";
import { ClipboardCheck, Download, Eye, FileText, FolderOpen, History, ImageIcon, Loader2, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { MIME_LABEL, formatBytes } from "@/lib/files";
import { downloadObject } from "@/services/storage";
import { formatDate } from "@/utils/format";
import { DOC_STATUS_LABEL, type DocumentRow } from "@/types/entities";
import type { DocPerms } from "./permissions";

/** Daftar dokumen arsip sebuah izin (versi aktif masing-masing). */
export function LicenseDocumentsCard({
  docs,
  loading,
  error,
  onRetry,
  perms,
  onUpload,
  onPreview,
  onNewVersion,
  onEditMeta,
  onDelete,
  onVersions,
  onVerify,
}: {
  docs: DocumentRow[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  perms: DocPerms;
  onUpload: () => void;
  onPreview: (d: DocumentRow) => void;
  onNewVersion: (d: DocumentRow) => void;
  onEditMeta: (d: DocumentRow) => void;
  onDelete: (d: DocumentRow) => void;
  onVersions: (d: DocumentRow) => void;
  onVerify: (d: DocumentRow) => void;
}) {
  const [downloading, setDownloading] = useState<string | null>(null);

  async function download(d: DocumentRow) {
    if (!d.storage_path || !d.file_name) return;
    setDownloading(d.id);
    try {
      await downloadObject(d.storage_path, d.file_name);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Dokumen arsip</CardTitle>
          <CardDescription>
            {docs?.length ? `${docs.length} dokumen · versi aktif ditampilkan` : "Berkas digital izin ini (PDF/JPG/PNG)."}
          </CardDescription>
        </div>
        {perms.canUpload ? (
          <Button size="sm" onClick={onUpload}>
            <Upload className="h-4 w-4" aria-hidden /> Unggah dokumen
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>{errorMessage(error)}</span>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Coba lagi
            </Button>
          </div>
        ) : !docs?.length ? (
          <EmptyState
            icon={FolderOpen}
            title="Belum ada dokumen"
            description={perms.canUpload ? "Unggah KTP, NIB, surat permohonan, atau berkas lain untuk izin ini." : undefined}
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {docs.map((d) => {
              const isPdf = d.mime_type === "application/pdf";
              const Icon = isPdf ? FileText : ImageIcon;
              return (
                <li key={d.id} className="flex items-center gap-3 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => onPreview(d)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-label={`Lihat ${d.title}`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${isPdf ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-navy-900 hover:underline">{d.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {d.document_type_name}
                        {d.document_number ? ` · No. ${d.document_number}` : ""} · v{d.version_no} ·{" "}
                        {MIME_LABEL[d.mime_type ?? ""] ?? "-"} {formatBytes(d.size_bytes)} · {formatDate(d.uploaded_at)}
                      </span>
                    </span>
                  </button>
                  <span className="hidden sm:block">
                    <StatusBadge status={d.status} label={DOC_STATUS_LABEL[d.status]} />
                  </span>
                  {perms.canVerify(d) ? (
                    <Button size="sm" className="h-8 shrink-0" onClick={() => onVerify(d)} aria-label={`Periksa ${d.title}`}>
                      <ClipboardCheck className="h-4 w-4" aria-hidden />
                      <span className="hidden sm:inline">Periksa</span>
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => download(d)}
                    disabled={downloading === d.id}
                    aria-label={`Unduh ${d.title}`}
                  >
                    {downloading === d.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
                  </Button>
                  <Dropdown
                    label={`Aksi ${d.title}`}
                    width={200}
                    trigger={(p) => (
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Aksi lain ${d.title}`} {...p}>
                        <MoreHorizontal className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                  >
                    {(close) => (
                      <>
                        <MenuItem icon={<Eye className="h-4 w-4" aria-hidden />} onSelect={() => { close(); onPreview(d); }}>
                          Lihat
                        </MenuItem>
                        <MenuItem icon={<History className="h-4 w-4" aria-hidden />} onSelect={() => { close(); onVersions(d); }}>
                          Riwayat versi
                        </MenuItem>
                        {perms.canUpload ? (
                          <MenuItem icon={<Upload className="h-4 w-4" aria-hidden />} onSelect={() => { close(); onNewVersion(d); }}>
                            Unggah versi baru
                          </MenuItem>
                        ) : null}
                        {perms.canEditMeta ? (
                          <MenuItem icon={<Pencil className="h-4 w-4" aria-hidden />} onSelect={() => { close(); onEditMeta(d); }}>
                            Ubah info
                          </MenuItem>
                        ) : null}
                        {perms.canDelete ? (
                          <MenuItem danger icon={<Trash2 className="h-4 w-4" aria-hidden />} onSelect={() => { close(); onDelete(d); }}>
                            Hapus
                          </MenuItem>
                        ) : null}
                      </>
                    )}
                  </Dropdown>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
