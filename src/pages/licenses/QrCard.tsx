import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, Printer, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { downloadDataUrl, qrPngDataUrl, qrSvgDataUrl } from "@/lib/qr";
import { publicVerifyUrl } from "@/services/publicVerify";

/** Status yang dikenali halaman verifikasi publik (sama dengan verify_license()). */
export const QR_STATUSES = ["DITERBITKAN", "AKTIF", "BERAKHIR", "DICABUT"];

export function QrCard({ licenseId, code, label }: { licenseId: string; code: string; label: string }) {
  const url = publicVerifyUrl(code);
  const svg = useQuery({ queryKey: ["qr", url], queryFn: () => qrSvgDataUrl(url), staleTime: Infinity });
  const [busy, setBusy] = useState(false);

  async function downloadPng() {
    setBusy(true);
    try {
      downloadDataUrl(await qrPngDataUrl(url), `QR_${label.replace(/[^A-Za-z0-9]+/g, "_")}.png`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-4 w-4" aria-hidden /> QR verifikasi
        </CardTitle>
        <CardDescription>Cetak pada surat izin. Siapa pun dapat memindainya untuk memeriksa keaslian izin tanpa login.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          {svg.data ? (
            <img src={svg.data} alt={`QR verifikasi izin ${label}`} className="h-40 w-40 rounded border bg-white p-1" />
          ) : (
            <Skeleton className="h-40 w-40" />
          )}
          <p className="mt-2 font-mono text-sm tracking-widest">{code}</p>
          <p className="mt-1 max-w-full break-all text-center text-[11px] text-muted-foreground">{url}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={downloadPng} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            Unduh PNG
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/cetak/qr/${licenseId}`} target="_blank" rel="noopener">
              <Printer className="h-4 w-4" aria-hidden /> Cetak label
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="col-span-2" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden /> Buka halaman verifikasi
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
