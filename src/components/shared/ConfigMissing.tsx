import { AlertTriangle } from "lucide-react";

export function ConfigMissing() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-xl border bg-white p-6 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-amber-700">
          <AlertTriangle className="h-5 w-5" aria-hidden />
          <h1 className="text-base font-semibold">Konfigurasi belum lengkap</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Variabel lingkungan <code className="rounded bg-muted px-1">VITE_SUPABASE_URL</code> dan{" "}
          <code className="rounded bg-muted px-1">VITE_SUPABASE_ANON_KEY</code> belum diisi. Isi
          keduanya di file <code className="rounded bg-muted px-1">.env</code> (lokal) atau di
          Environment Variables Vercel, lalu build ulang.
        </p>
      </div>
    </div>
  );
}
