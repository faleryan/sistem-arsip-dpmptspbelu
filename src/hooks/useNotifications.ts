import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { countUnread, deleteNotification, markAllRead, setRead } from "@/services/notifications";

export const NOTIF_KEY = ["notifications"] as const;

/**
 * Jumlah belum dibaca. Diperbarui tiap 60 detik dan saat tab kembali aktif.
 * (Polling dipilih daripada Realtime agar tidak perlu mengaktifkan replikasi tabel; lihat dokumen desain.)
 */
export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: [...NOTIF_KEY, "unread"],
    queryFn: countUnread,
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}

export function useNotificationActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: NOTIF_KEY });
  const onError = (e: unknown) => toast.error(errorMessage(e));
  return {
    read: useMutation({ mutationFn: ({ id, isRead }: { id: string; isRead: boolean }) => setRead(id, isRead), onSuccess: refresh, onError }),
    readAll: useMutation({
      mutationFn: markAllRead,
      onSuccess: async () => {
        await refresh();
        toast.success("Semua notifikasi ditandai dibaca.");
      },
      onError,
    }),
    remove: useMutation({ mutationFn: deleteNotification, onSuccess: refresh, onError }),
  };
}
