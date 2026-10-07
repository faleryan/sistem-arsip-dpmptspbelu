import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, Clock, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { listRequiredDocs } from "@/services/reference";
import { listDocumentStates } from "@/services/licenses";
import { useDocumentTypes, REF_KEY } from "@/hooks/useReference";

const STATE_LABEL = {
  verified: "Terverifikasi",
  pending: "Menunggu verifikasi",
  rejected: "Ditolak, perlu diganti",
  missing: "Belum ada",
} as const;

/** Daftar dokumen wajib jenis izin ini beserta status unggah/verifikasinya. */
export function CompletenessCard({ licenseId, licenseTypeId }: { licenseId: string; licenseTypeId: string }) {
  const docTypes = useDocumentTypes();
  const required = useQuery({ queryKey: [...REF_KEY, "required_docs", licenseTypeId], queryFn: () => listRequiredDocs(licenseTypeId) });
  const docs = useQuery({ queryKey: ["licenses", "doc-states", licenseId], queryFn: () => listDocumentStates(licenseId) });

  const loading = docTypes.isLoading || required.isLoading || docs.isLoading;
  const error = docTypes.error ?? required.error ?? docs.error;
  const names = new Map((docTypes.data ?? []).map((d) => [d.id, d.name]));
  const items = (required.data ?? []).map((typeId) => {
    const ofType = (docs.data ?? []).filter((d) => d.document_type_id === typeId);
    const state: keyof typeof STATE_LABEL = ofType.some((d) => d.status === "TERVERIFIKASI")
      ? "verified"
      : ofType.some((d) => d.status === "MENUNGGU_VERIFIKASI")
        ? "pending"
        : ofType.length
          ? "rejected"
          : "missing";
    return { typeId, name: names.get(typeId) ?? "Dokumen", state };
  });
  const done = items.filter((i) => i.state === "verified").length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kelengkapan dokumen</CardTitle>
        <CardDescription>
          {items.length ? `${done} dari ${items.length} dokumen wajib terverifikasi.` : "Jenis izin ini belum memiliki daftar dokumen wajib."}
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
            <ul className="space-y-2">
              {items.map((i) => (
                <li key={i.typeId} className="flex items-center gap-2 text-sm">
                  {i.state === "verified" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  ) : i.state === "pending" ? (
                    <Clock className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                  ) : i.state === "rejected" ? (
                    <XCircle className="h-4 w-4 shrink-0 text-red-500" aria-hidden />
                  ) : (
                    <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="flex-1">{i.name}</span>
                  <span className="text-xs text-muted-foreground">{STATE_LABEL[i.state]}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
