import { useState } from "react";
import { Download, ExternalLink, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/shared/Modal";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { MIME_LABEL, formatBytes } from "@/lib/files";
import { downloadObject } from "@/services/storage";
import { formatDateTime } from "@/utils/format";
import { DOC_STATUS_LABEL, type DocumentRow } from "@/types/entities";
import { FilePreview, useSignedUrl } from "./FilePreview";

/**
 * Pratinjau versi aktif dokumen. File dibuka lewat signed URL 5 menit; selalu ada tombol
 * unduh dan tab baru sebagai cadangan bila penampil di dalam halaman tidak tersedia.
 */
export function DocumentPreviewDialog({
  doc,
  onClose,
  onHistory,
}: {
  doc: DocumentRow;
  onClose: () => void;
  onHistory?: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const url = useSignedUrl(doc.storage_path);

  async function download() {
    if (!doc.storage_path || !doc.file_name) return;
    setDownloading(true);
    try {
      await downloadObject(doc.storage_path, doc.file_name);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal open size="full" onClose={onClose} title={doc.title}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-3 text-xs text-muted-foreground">
        <StatusBadge status={doc.status} label={DOC_STATUS_LABEL[doc.status]} />
        <span>{doc.document_type_name}</span>
        {doc.document_number ? <span>No. {doc.document_number}</span> : null}
        <span>
          v{doc.version_no} · {MIME_LABEL[doc.mime_type ?? ""] ?? "-"} · {formatBytes(doc.size_bytes)}
        </span>
        <span>Diunggah {formatDateTime(doc.uploaded_at)}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          {onHistory && (doc.version_no ?? 0) > 0 ? (
            <Button variant="outline" size="sm" onClick={onHistory}>
              <History className="h-4 w-4" aria-hidden /> Riwayat versi
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={download} disabled={downloading || !doc.storage_path}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            Unduh
          </Button>
          {url.data ? (
            <Button variant="outline" size="sm" asChild>
              <a href={url.data} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden /> Tab baru
              </a>
            </Button>
          ) : null}
        </span>
      </div>
      <div className="relative min-h-0 flex-1 bg-slate-100">
        <FilePreview path={doc.storage_path} mime={doc.mime_type} title={doc.title} />
      </div>
    </Modal>
  );
}
