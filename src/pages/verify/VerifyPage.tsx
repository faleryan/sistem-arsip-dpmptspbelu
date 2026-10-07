import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, Ban, CalendarX2, Loader2, Search, ShieldCheck, ShieldQuestion, type LucideIcon } from "lucide-react";
import { Brand } from "@/components/shared/Brand";
import { ConfigMissing } from "@/components/shared/ConfigMissing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { CODE_RE, normalizeCode, verifyCode, type PublicLicense } from "@/services/publicVerify";
import { formatDate, formatDateTime } from "@/utils/format";
import { AGENCY_NAME } from "@/types/domain";

type Verdict = { icon: LucideIcon; title: string; text: string; cls: string };

const VERDICT: Record<PublicLicense["status"], Verdict> = {
  AKTIF: {
    icon: ShieldCheck,
    title: "Izin sah dan berlaku",
    text: "Data izin ini tercatat resmi di arsip instansi penerbit.",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  DITERBITKAN: {
    icon: ShieldCheck,
    title: "Izin sah",
    text: "Izin telah diterbitkan dan berlaku mulai tanggal terbit.",
    cls: "border-blue-200 bg-blue-50 text-blue-900",
  },
  BERAKHIR: {
    icon: CalendarX2,
    title: "Izin sah, tetapi masa berlakunya telah habis",
    text: "Izin ini pernah diterbitkan secara resmi namun sudah tidak berlaku.",
    cls: "border-amber-200 bg-amber-50 text-amber-900",
  },
  DICABUT: {
    icon: Ban,
    title: "Izin telah dicabut",
    text: "Izin ini tidak berlaku lagi karena telah dicabut oleh instansi penerbit.",
    cls: "border-red-200 bg-red-50 text-red-900",
  },
};

/**
 * Halaman publik (tanpa login) untuk memeriksa keaslian izin dari QR code.
 * Hanya menampilkan kolom aman yang dikembalikan verify_license(): tanpa NIK/NPWP/alamat.
 */
export default function VerifyPage() {
  const { code: raw = "" } = useParams();
  const code = normalizeCode(raw);
  const valid = CODE_RE.test(code);

  const q = useQuery({
    queryKey: ["public-verify", code],
    queryFn: () => verifyCode(code),
    enabled: valid && isSupabaseConfigured,
    retry: 1,
  });

  if (!isSupabaseConfigured) return <ConfigMissing />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4">
          <Brand subtitle="Verifikasi Keaslian Izin" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-xl font-semibold text-navy-900">Verifikasi Izin</h1>
        <p className="mt-1 text-sm text-muted-foreground">{q.data?.agency || AGENCY_NAME}</p>

        <div className="mt-6">
          {!raw ? (
            <p className="text-sm text-muted-foreground">
              Pindai QR code pada surat izin, atau masukkan kode verifikasi 12 karakter di bawah ini.
            </p>
          ) : !valid ? (
            <NotFound code={raw} reason="Format kode tidak valid. Kode verifikasi terdiri dari 12 huruf/angka." />
          ) : q.isLoading ? (
            <div className="flex items-center gap-3 rounded-xl border bg-white p-6 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Memeriksa kode {code}…
            </div>
          ) : q.isError ? (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <div>
                <p className="font-medium">Pemeriksaan belum dapat dilakukan.</p>
                <p className="mt-1">{errorMessage(q.error)} Silakan coba beberapa saat lagi.</p>
              </div>
            </div>
          ) : q.data ? (
            <Result license={q.data} code={code} />
          ) : (
            <NotFound
              code={code}
              reason="Kode ini tidak terdaftar sebagai izin yang telah diterbitkan. Bila Anda memindai QR dari sebuah dokumen, dokumen tersebut patut diragukan keasliannya. Hubungi DPMPTSP Kabupaten Belu untuk konfirmasi."
            />
          )}
        </div>

        <CodeForm initial={valid ? "" : raw} />
      </main>
    </div>
  );
}

function Result({ license: l, code }: { license: PublicLicense; code: string }) {
  const v = VERDICT[l.status] ?? VERDICT.AKTIF;
  const Icon = v.icon;
  const rows: [string, string][] = [
    ["Nomor izin", l.license_number ?? "-"],
    ["Jenis izin", l.license_type],
    ["Pemegang izin", l.holder_name],
    ["Tanggal terbit", formatDate(l.issue_date)],
    ...(l.expiry_date !== undefined
      ? ([["Berlaku sampai", l.expiry_date ? formatDate(l.expiry_date) : "Tanpa batas waktu"]] as [string, string][])
      : []),
    ["Diterbitkan oleh", l.agency],
    ["Kode verifikasi", code],
  ];
  return (
    <section aria-live="polite">
      <div className={cn("flex items-start gap-3 rounded-xl border p-5", v.cls)}>
        <Icon className="h-7 w-7 shrink-0" aria-hidden />
        <div>
          <p className="text-base font-semibold">{v.title}</p>
          <p className="mt-0.5 text-sm">{v.text}</p>
        </div>
      </div>
      <dl className="mt-4 divide-y rounded-xl border bg-white">
        {rows.map(([k, val]) => (
          <div key={k} className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
            <dt className="text-sm text-muted-foreground">{k}</dt>
            <dd className={cn("text-sm font-medium text-navy-900", k === "Kode verifikasi" && "font-mono tracking-wider")}>{val}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">Diperiksa pada {formatDateTime(new Date())} WITA.</p>
    </section>
  );
}

function NotFound({ code, reason }: { code: string; reason: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
      <ShieldQuestion className="h-7 w-7 shrink-0" aria-hidden />
      <div>
        <p className="text-base font-semibold">Izin tidak ditemukan</p>
        <p className="mt-0.5 break-all text-sm font-mono">{code}</p>
        <p className="mt-2 text-sm">{reason}</p>
      </div>
    </div>
  );
}

function CodeForm({ initial }: { initial: string }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const c = normalizeCode(value);
    if (!CODE_RE.test(c)) {
      setError("Masukkan 12 huruf/angka sesuai kode di bawah QR.");
      return;
    }
    setError(null);
    setValue("");
    navigate(`/verify/${c}`);
  }

  return (
    <form onSubmit={submit} className="mt-8 rounded-xl border bg-white p-5" noValidate>
      <label htmlFor="verify-code" className="text-sm font-medium">
        Periksa kode lain
      </label>
      <div className="mt-2 flex gap-2">
        <Input
          id="verify-code"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="Contoh: A1B2C3D4E5F6"
          maxLength={20}
          autoComplete="off"
          className="font-mono uppercase tracking-wider"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "verify-code-err" : undefined}
        />
        <Button type="submit">
          <Search className="h-4 w-4" aria-hidden /> Periksa
        </Button>
      </div>
      {error ? (
        <p id="verify-code-err" className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}
