import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Bell, CheckCheck, ExternalLink, Loader2, MailOpen, Mail, Trash2 } from "lucide-react";
import { FilterSelect } from "@/components/data-table";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NOTIF_KEY, useNotificationActions, useUnreadCount } from "@/hooks/useNotifications";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { NOTIF_TYPE_LABEL, listNotifications } from "@/services/notifications";
import { formatDateTime, formatRelative } from "@/utils/format";
import { NotifIcon } from "./NotifIcon";

const PAGE = 20;

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [type, setType] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const unread = useUnreadCount();
  const { read, readAll, remove } = useNotificationActions();

  const list = useQuery({
    queryKey: [...NOTIF_KEY, "page", { onlyUnread, type, limit }],
    queryFn: () => listNotifications({ limit, onlyUnread, type: type || undefined }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Notifikasi"
        description="Pemberitahuan otomatis dari alur perizinan: pengajuan, verifikasi dokumen, persetujuan, penerbitan, dan masa berlaku."
        actions={
          (unread.data ?? 0) > 0 ? (
            <Button variant="outline" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
              <CheckCheck className="h-4 w-4" aria-hidden /> Tandai semua dibaca
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-white p-1" role="tablist" aria-label="Saring notifikasi">
          {(
            [
              [false, "Semua"],
              [true, `Belum dibaca${unread.data ? ` (${unread.data})` : ""}`],
            ] as const
          ).map(([v, label]) => (
            <button
              key={String(v)}
              role="tab"
              aria-selected={onlyUnread === v}
              onClick={() => {
                setOnlyUnread(v);
                setLimit(PAGE);
              }}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium",
                onlyUnread === v ? "bg-navy-800 text-white" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <FilterSelect
          label="Jenis"
          value={type}
          onChange={(v) => {
            setType(v);
            setLimit(PAGE);
          }}
          options={Object.entries(NOTIF_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
          allLabel="Semua jenis"
        />
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        {list.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : list.isError ? (
          <p role="alert" className="p-6 text-sm text-red-600">
            {errorMessage(list.error)}
          </p>
        ) : !rows.length ? (
          <div className="p-4">
            <EmptyState
              icon={Bell}
              title={onlyUnread ? "Semua notifikasi sudah dibaca" : "Belum ada notifikasi"}
              description="Notifikasi muncul otomatis saat ada perubahan pada permohonan yang terkait dengan Anda."
            />
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((n) => (
              <li key={n.id} className={cn("flex gap-3 px-4 py-3", !n.is_read && "bg-blue-50/40")}>
                <NotifIcon type={n.type} />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", n.is_read ? "" : "font-semibold text-navy-900")}>
                    {n.title}
                    {!n.is_read ? <span className="sr-only"> (belum dibaca)</span> : null}
                  </p>
                  {n.body ? <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    <time dateTime={n.created_at} title={formatDateTime(n.created_at)}>
                      {formatRelative(n.created_at)}
                    </time>
                    {" · "}
                    {NOTIF_TYPE_LABEL[n.type] ?? n.type}
                  </p>
                </div>
                <div className="flex shrink-0 items-start gap-1">
                  {n.link ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Buka: ${n.title}`}
                      onClick={() => {
                        if (!n.is_read) read.mutate({ id: n.id, isRead: true });
                        navigate(n.link!);
                      }}
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={n.is_read ? `Tandai belum dibaca: ${n.title}` : `Tandai dibaca: ${n.title}`}
                    onClick={() => read.mutate({ id: n.id, isRead: !n.is_read })}
                  >
                    {n.is_read ? <Mail className="h-4 w-4" aria-hidden /> : <MailOpen className="h-4 w-4" aria-hidden />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-red-600"
                    aria-label={`Hapus notifikasi: ${n.title}`}
                    onClick={() => remove.mutate(n.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {rows.length < total ? (
          <div className="border-t p-3 text-center">
            <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)} disabled={list.isFetching}>
              {list.isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Muat lebih banyak ({total - rows.length} lagi)
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
