import { useQuery } from "@tanstack/react-query";
import { Archive, CheckCircle2, CircleDashed, Clock, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { listRequiredDocs } from "@/services/reference";
import { useDocumentTypes, REF_KEY } from "@/hooks/useReference";
import type { DocumentRow } from "@/types/entities";

const STATE = {
  verified: { label: "Terverifikasi", icon: CheckCircle2, cls: "text-emerald-600" },
  archived: { label: "Diarsipkan", icon: Archive, cls: "text-emerald-600" },
  pending: { label: "Menunggu verifikasi", icon: Clock, cls: "text-amber-500" },
  rejected: { label: "Ditolak, perlu diganti", icon: XCircle, cls: "text-red-500" },
  missing: { label: "Belum ada", icon: CircleDashed, cls: "text-muted-foreground" },
} as const;
type State = keyof typeof STATE;

/** Dokumen wajib jenis izin ini beserta status unggah/verifikasinya. */
export function CompletenessCard({
  licenseTypeId,
  docs,
  docsLoading,
  docsError,
  onUpload,
  showReady,
}: {
  licenseTypeId: string;
  docs: DocumentRow[] | undefined;
  docsLoading: boolean;
  docsError: unknown;
  /** Bila diisi, item yang belum ada/ditolak menampilkan tombol unggah. */
  onUpload?: (documentTypeId: string, existing?: DocumentRow) => void;
  /** Tampilkan petunjuk "siap disetujui" bila semua dokumen wajib lengkap (untuk Verifikator). */
  showReady?: boolean;
}) {
  const docTypes = useDocumentTypes();
  const required = useQuery({ queryKey: [...REF_KEY, "required_docs", licenseTypeId], queryFn: () => listRequiredDocs(licenseTypeId) });

  const loading = docTypes.isLoading || required.isLoading || docsLoading;
  const error = docTypes.error ?? required.error ?? docsError;
  const names = new Map((docTypes.data ?? []).map((d) => [d.id, d.name]));
  const items = (required.data ?? []).map((typeId) => {
    const ofType = (docs ?? []).filter((d) => d.document_type_id === typeId);
    const state: State = ofType.some((d) => d.status === "TERVERIFIKASI")
      ? "verified"
      : ofType.some((d) => d.status === "DIARSIPKAN")
        ? "archived"
        : ofType.some((d) => d.status === "MENUNGGU_VERIFIKASI")
          ? "pending"
          : ofType.length
            ? "rejected"
            : "missing";
    return { typeId, name: names.get(typeId) ?? "Dokumen", state, rejectedDoc: state === "rejected" ? ofType[0] : undefined };
  });
  const done = items.filter((i) => i.state === "verified" || i.state === "archived").length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kelengkapan dokumen</CardTitle>
        <CardDescription>
          {items.length ? `${done} dari ${items.length} dokumen wajib lengkap.` : "Jenis izin ini belum memiliki daftar dokumen wajib."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage(error)}
          </p>
        ) : (
          <>
            {items.length ? (
              <div
                className="mb-4 h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Kelengkapan dokumen"
              >
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            ) : null}
            {showReady && items.length > 0 && done === items.length ? (
              <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Semua dokumen wajib sudah lengkap. Permohonan dapat <strong>disetujui</strong>.
              </p>
            ) : null}
            <ul className="space-y-2">
              {items.map((i) => {
                const s = STATE[i.state];
                const Icon = s.icon;
                const canAct = onUpload && (i.state === "missing" || i.state === "rejected");
                return (
                  <li key={i.typeId} className="flex items-center gap-2 text-sm">
                    <Icon className={`h-4 w-4 shrink-0 ${s.cls}`} aria-hidden />
                    <span className="min-w-0 flex-1">{i.name}</span>
                    {canAct ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-accent"
                        onClick={() => onUpload!(i.typeId, i.rejectedDoc)}
                        aria-label={`Unggah ${i.name}`}
                      >
                        <Upload className="h-3.5 w-3.5" aria-hidden /> {i.state === "rejected" ? "Ganti" : "Unggah"}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
