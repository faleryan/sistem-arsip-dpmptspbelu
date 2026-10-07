import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { listHistory } from "@/services/licenses";
import { formatDateTime } from "@/utils/format";
import { LICENSE_STATUS_LABEL } from "@/types/entities";

export function StatusHistoryCard({ licenseId, staff }: { licenseId: string; staff?: Map<string, string> }) {
  const q = useQuery({ queryKey: ["licenses", "history", licenseId], queryFn: () => listHistory(licenseId) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Riwayat status</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : q.isError ? (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage(q.error)}
          </p>
        ) : !q.data?.length ? (
          <p className="text-sm text-muted-foreground">Belum ada riwayat.</p>
        ) : (
          <ol className="relative space-y-5 border-l pl-5">
            {[...q.data].reverse().map((h) => (
              <li key={h.id} className="relative">
                <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-navy-500 ring-1 ring-navy-200" aria-hidden />
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={h.to_status} label={LICENSE_STATUS_LABEL[h.to_status]} />
                  {h.from_status ? (
                    <span className="text-xs text-muted-foreground">dari {LICENSE_STATUS_LABEL[h.from_status]}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">data dibuat</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  <time dateTime={h.changed_at}>{formatDateTime(h.changed_at)}</time>
                  {h.changed_by ? ` · ${staff?.get(h.changed_by) ?? "Pengguna"}` : " · Sistem"}
                </p>
                {h.note ? <p className="mt-1 whitespace-pre-line text-sm">{h.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
