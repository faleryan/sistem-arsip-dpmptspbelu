import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/shared/Modal";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { MIME_LABEL, formatBytes } from "@/lib/files";
import { downloadObject, signedUrl } from "@/services/storage";
import { formatDateTime } from "@/utils/format";
import { DOC_STATUS_LABEL, type DocumentRow } from "@/types/entities";

/**
 * Pratinjau versi aktif dokumen. File dibuka lewat signed URL 5 menit; PDF di iframe
 * (penampil PDF bawaan browser), gambar sebagai <img>. Selalu ada tombol unduh/tab baru.
 */
export function DocumentPreviewDialog({ doc, onClose }: { doc: DocumentRow; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const url = useQuery({
    queryKey: ["documents", "signed", doc.storage_path],
    queryFn: () => signedUrl(doc.storage_path!, { expiresIn: 300 }),
    enabled: !!doc.storage_path,
    staleTime: 4 * 60 * 1000, // sedikit di bawah umur URL
    gcTime: 4 * 60 * 1000,
  });

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

  const isPdf = doc.mime_type === "application/pdf";

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
        <span className="ml-auto flex gap-2">
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
        {!doc.storage_path ? (
          <Centered>
            <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />
            <p className="text-sm">Dokumen ini belum memiliki file.</p>
          </Centered>
        ) : url.isLoading ? (
          <Centered>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Memuat pratinjau" />
          </Centered>
        ) : url.isError || !url.data ? (
          <Centered>
            <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />
            <p className="max-w-sm text-center text-sm">{errorMessage(url.error)}</p>
          </Centered>
        ) : isPdf ? (
          <iframe src={url.data} title={`Pratinjau ${doc.file_name}`} className="h-full w-full border-0 bg-white" />
        ) : (
          <div className="flex h-full items-center justify-center overflow-auto p-4">
            <img src={url.data} alt={doc.title} className="max-h-full max-w-full rounded shadow" />
          </div>
        )}
      </div>
    </Modal>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-muted-foreground">{children}</div>;
}
