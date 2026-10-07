import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/shared/Modal";
import { Field, FormAlert } from "@/components/shared/Field";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { MIME_LABEL, formatBytes } from "@/lib/files";
import { cn } from "@/lib/utils";
import { listVersions, verifyDocument } from "@/services/versions";
import { formatDateTime } from "@/utils/format";
import { DOC_STATUS_LABEL, LICENSE_STATUS_LABEL, type DocumentRow } from "@/types/entities";
import { FilePreview } from "./FilePreview";

type Result = "TERVERIFIKASI" | "DITOLAK";

/** Periksa versi aktif dokumen lalu terima atau tolak (dengan alasan). */
export function VerifyDocumentDialog({ doc, onClose }: { doc: DocumentRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<Result | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const versions = useQuery({ queryKey: ["documents", "versions", doc.id], queryFn: () => listVersions(doc.id) });
  const earlier = (versions.data ?? []).filter((v) => !v.is_current && v.verifications.length);

  const submit = useMutation({
    mutationFn: () => verifyDocument(doc.version_id!, result!, note.trim() || null),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["documents"] }),
        qc.invalidateQueries({ queryKey: ["licenses"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      toast.success(result === "DITOLAK" ? "Dokumen ditolak. Pengunggah diberi tahu." : "Dokumen diverifikasi.");
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  function onSubmit() {
    setError(null);
    if (!result) return setError("Pilih hasil pemeriksaan: diterima atau ditolak.");
    if (result === "DITOLAK" && !note.trim()) return setError("Alasan penolakan wajib diisi agar pengunggah tahu apa yang harus diperbaiki.");
    submit.mutate();
  }

  return (
    <Modal open size="full" onClose={submit.isPending ? () => undefined : onClose} title={`Verifikasi — ${doc.title}`}>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="h-[45vh] min-h-0 shrink-0 bg-slate-100 lg:h-auto lg:flex-1">
          <FilePreview path={doc.storage_path} mime={doc.mime_type} title={doc.title} />
        </div>

        <aside className="flex min-h-0 w-full flex-col border-t lg:w-96 lg:border-l lg:border-t-0">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Izin</dt>
                <dd className="text-right font-mono text-xs">
                  {doc.license_number ?? doc.application_number}
                  <span className="ml-1 font-sans">({LICENSE_STATUS_LABEL[doc.license_status]})</span>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Pemohon</dt>
                <dd className="text-right">{doc.applicant_name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Jenis</dt>
                <dd className="text-right">{doc.document_type_name}</dd>
              </div>
              {doc.document_number ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Nomor</dt>
                  <dd className="text-right">{doc.document_number}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">File</dt>
                <dd className="min-w-0 truncate text-right" title={doc.file_name ?? ""}>
                  v{doc.version_no} · {MIME_LABEL[doc.mime_type ?? ""]} · {formatBytes(doc.size_bytes)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge status={doc.status} label={DOC_STATUS_LABEL[doc.status]} />
                </dd>
              </div>
            </dl>

            {earlier.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-medium">Catatan pemeriksaan versi sebelumnya</p>
                <ul className="mt-1.5 space-y-1.5">
                  {earlier.map((v) => (
                    <li key={v.id}>
                      <span className="font-medium">v{v.version_no}</span>:{" "}
                      {v.verifications[0].result === "DITOLAK" ? "ditolak" : "diterima"}
                      {v.verifications[0].note ? ` — ${v.verifications[0].note}` : ""}
                      <span className="block text-amber-700">{formatDateTime(v.verifications[0].verified_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Hasil pemeriksaan</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {(
                  [
                    ["TERVERIFIKASI", "Terima", CheckCircle2, "border-emerald-500 bg-emerald-50 text-emerald-800"],
                    ["DITOLAK", "Tolak", XCircle, "border-red-500 bg-red-50 text-red-800"],
                  ] as const
                ).map(([value, label, Icon, active]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={result === value}
                    onClick={() => {
                      setResult(value);
                      setError(null);
                    }}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium",
                      result === value ? active : "border-slate-200 text-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden /> {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <Field
              label={result === "DITOLAK" ? "Alasan penolakan" : "Catatan (opsional)"}
              required={result === "DITOLAK"}
              hint={result === "DITOLAK" ? "Dikirim ke pengunggah sebagai notifikasi." : undefined}
            >
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={1000} />
            </Field>
            <FormAlert message={error} />
          </div>

          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <Button variant="outline" onClick={onClose} disabled={submit.isPending}>
              Batal
            </Button>
            <Button variant={result === "DITOLAK" ? "danger" : "default"} onClick={onSubmit} disabled={submit.isPending}>
              {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Simpan hasil
            </Button>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
