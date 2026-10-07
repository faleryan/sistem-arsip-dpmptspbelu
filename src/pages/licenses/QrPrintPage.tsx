import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { qrSvgDataUrl } from "@/lib/qr";
import { getLicense } from "@/services/licenses";
import { publicVerifyUrl } from "@/services/publicVerify";
import { formatDate } from "@/utils/format";
import { useAgency } from "@/hooks/useSettings";
import { QR_STATUSES } from "./QrCard";

/** Label QR siap cetak (sekitar 9 × 13 cm) untuk ditempel atau disisipkan pada surat izin. */
export default function QrPrintPage() {
  const { id = "" } = useParams();
  const agency = useAgency();
  const lic = useQuery({ queryKey: ["licenses", "detail", id], queryFn: () => getLicense(id) });
  const l = lic.data;
  const url = l ? publicVerifyUrl(l.verification_code) : "";
  const svg = useQuery({ queryKey: ["qr", url], queryFn: () => qrSvgDataUrl(url), enabled: !!url, staleTime: Infinity });

  if (lic.isLoading) return <Skeleton className="m-8 h-96 w-80" />;
  if (lic.isError || !l) return <p className="p-8 text-sm text-red-600">{errorMessage(lic.error)}</p>;
  if (!QR_STATUSES.includes(l.status)) {
    return <p className="p-8 text-sm">QR verifikasi hanya tersedia untuk izin yang sudah diterbitkan.</p>;
  }

  const holder = l.business?.name ?? l.summary?.business_name ?? l.applicant?.full_name ?? l.summary?.applicant_name ?? "-";

  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-100 p-6 print:bg-white print:p-0">
      <div className="mb-4 flex gap-2 print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden /> Cetak
        </Button>
        <Button variant="outline" onClick={() => window.close()}>
          Tutup
        </Button>
      </div>

      <article className="w-[9cm] rounded-lg border-2 border-navy-900 bg-white p-[0.5cm] text-center text-navy-900 print:rounded-none">
        <p className="text-[9pt] font-semibold uppercase leading-tight">{agency.name}</p>
        <p className="mt-1 text-[8pt] text-slate-600">Verifikasi keaslian izin</p>
        {svg.data ? <img src={svg.data} alt="QR verifikasi" className="mx-auto mt-2 h-[5.5cm] w-[5.5cm]" /> : <Skeleton className="mx-auto mt-2 h-[5.5cm] w-[5.5cm]" />}
        <p className="mt-1 font-mono text-[11pt] font-bold tracking-[0.2em]">{l.verification_code}</p>
        <dl className="mt-2 space-y-0.5 border-t pt-2 text-left text-[8pt]">
          <Row k="No. izin" v={l.license_number ?? "-"} />
          <Row k="Jenis" v={l.license_type?.name ?? l.summary?.license_type_name ?? "-"} />
          <Row k="Pemegang" v={holder} />
          <Row k="Terbit" v={formatDate(l.issue_date)} />
        </dl>
        <p className="mt-2 break-all text-[7pt] text-slate-600">Pindai QR atau buka {url}</p>
      </article>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[2cm_1fr] gap-1">
      <dt className="text-slate-600">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
