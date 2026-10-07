import { useEffect, useState } from "react";
import { useNavigation } from "react-router-dom";
import { WifiOff } from "lucide-react";

/** Spanduk saat perangkat kehilangan koneksi internet. */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      Tidak ada koneksi internet. Perubahan belum dapat disimpan; data yang tampil mungkin belum terbaru.
    </div>
  );
}

/** Garis progres tipis saat berpindah ke halaman yang sedang dimuat. */
export function NavigationProgress() {
  const nav = useNavigation();
  if (nav.state === "idle") return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-navy-100" role="progressbar" aria-label="Memuat halaman">
      <div className="h-full w-1/3 animate-[sipar-progress_1s_ease-in-out_infinite] bg-navy-700" />
    </div>
  );
}
