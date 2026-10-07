import { useEffect, useState } from "react";
import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { AlertTriangle, Home, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isChunkLoadError, reloadOnceForNewVersion } from "@/lib/chunkReload";
import { errorMessage } from "@/lib/errors";

/**
 * Batas galat untuk rute. Menangani:
 * - versi aplikasi berganti (file halaman lama hilang) → muat ulang otomatis sekali;
 * - galat tak terduga saat menampilkan halaman → pesan ramah + tombol muat ulang,
 *   tanpa membuat seluruh aplikasi menjadi layar kosong.
 */
export default function RouteErrorPage() {
  const error = useRouteError();
  const chunk = isChunkLoadError(error);
  const [reloading] = useState(() => chunk && reloadOnceForNewVersion());

  useEffect(() => {
    if (!chunk) console.error(error);
  }, [chunk, error]);

  if (reloading) {
    return (
      <Shell>
        <Loader2 className="h-8 w-8 animate-spin text-navy-700" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-navy-900">Memuat versi terbaru aplikasi…</h1>
      </Shell>
    );
  }

  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <Shell>
      <AlertTriangle className="h-10 w-10 text-amber-500" aria-hidden />
      <h1 className="mt-4 text-lg font-semibold text-navy-900">
        {notFound ? "Halaman tidak ditemukan" : chunk ? "Aplikasi baru saja diperbarui" : "Terjadi kesalahan saat menampilkan halaman"}
      </h1>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {notFound
          ? "Alamat yang Anda tuju tidak tersedia."
          : chunk
            ? "Sebagian file aplikasi tidak dapat dimuat. Periksa koneksi internet, lalu muat ulang halaman."
            : "Data Anda tidak terpengaruh. Muat ulang halaman; bila masalah berlanjut, laporkan ke Super Admin beserta waktu kejadian."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Muat ulang
        </Button>
        <Button variant="outline" asChild>
          <Link to="/" reloadDocument>
            <Home className="h-4 w-4" aria-hidden /> Ke Dashboard
          </Link>
        </Button>
      </div>
      {!notFound && !chunk ? (
        <details className="mt-6 max-w-lg text-left text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Detail teknis</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted p-3">{errorMessage(error)}</pre>
        </details>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-10 text-center">
      {children}
    </div>
  );
}
