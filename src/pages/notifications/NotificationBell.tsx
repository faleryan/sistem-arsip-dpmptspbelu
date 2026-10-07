import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { NOTIF_KEY, useNotificationActions, useUnreadCount } from "@/hooks/useNotifications";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { listNotifications, type Notification } from "@/services/notifications";
import { formatRelative } from "@/utils/format";
import { NotifIcon } from "./NotifIcon";

/** Lonceng di topbar: jumlah belum dibaca + panel 8 notifikasi terbaru. */
export function NotificationBell() {
  const unread = useUnreadCount();
  const n = unread.data ?? 0;
  const label = n ? `Notifikasi, ${n} belum dibaca` : "Notifikasi";

  return (
    <Dropdown
      label="Notifikasi terbaru"
      width={360}
      trigger={(p) => (
        <Button variant="ghost" size="icon" className="relative" aria-label={label} {...p}>
          <Bell className="h-5 w-5" aria-hidden />
          {n > 0 ? (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white"
              aria-hidden
            >
              {n > 99 ? "99+" : n}
            </span>
          ) : null}
        </Button>
      )}
    >
      {(close) => <Panel close={close} unread={n} />}
    </Dropdown>
  );
}

function Panel({ close, unread }: { close: () => void; unread: number }) {
  const navigate = useNavigate();
  const list = useQuery({ queryKey: [...NOTIF_KEY, "latest"], queryFn: () => listNotifications({ limit: 8 }) });
  const { read, readAll } = useNotificationActions();

  function open(item: Notification) {
    if (!item.is_read) read.mutate({ id: item.id, isRead: true });
    close();
    if (item.link) navigate(item.link);
  }

  return (
    <div className="-m-1">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <p className="text-sm font-semibold">Notifikasi</p>
        {unread > 0 ? (
          <button
            type="button"
            onClick={() => readAll.mutate()}
            className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            disabled={readAll.isPending}
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Tandai semua dibaca
          </button>
        ) : null}
      </div>
      {list.isLoading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <p role="alert" className="p-4 text-sm text-red-600">
          {errorMessage(list.error)}
        </p>
      ) : !list.data?.rows.length ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Belum ada notifikasi.</p>
      ) : (
        <ul className="max-h-[50vh] divide-y overflow-y-auto">
          {list.data.rows.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="menuitem"
                onClick={() => open(item)}
                className={cn("flex w-full gap-3 px-3 py-2.5 text-left hover:bg-muted", !item.is_read && "bg-blue-50/50")}
              >
                <NotifIcon type={item.type} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", item.is_read ? "text-foreground" : "font-semibold text-navy-900")}>{item.title}</span>
                  {item.body ? <span className="line-clamp-2 block text-xs text-muted-foreground">{item.body}</span> : null}
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{formatRelative(item.created_at)}</span>
                </span>
                {!item.is_read ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="belum dibaca" /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t p-1.5">
        <button
          type="button"
          onClick={() => {
            close();
            navigate("/notifikasi");
          }}
          className="w-full rounded-md px-3 py-2 text-center text-sm font-medium text-accent hover:bg-muted"
        >
          Lihat semua notifikasi
        </button>
      </div>
    </div>
  );
}
