import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { CheckCircle2, Download, HardDrive, Info, Loader2, RefreshCw, Save, SearchCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Field, FormAlert } from "@/components/shared/Field";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadText, timestampedName, toCsv } from "@/components/data-table/csv";
import { useZodForm } from "@/hooks/useZodForm";
import { SETTINGS_KEY, useSettings } from "@/hooks/useSettings";
import { errorMessage } from "@/lib/errors";
import { formatBytes } from "@/lib/files";
import { SUPABASE_URL } from "@/lib/supabase";
import { deleteOrphans, saveSettings, storageIntegrityReport, type IntegrityRow, type Settings } from "@/services/settings";
import { formatDateTime } from "@/utils/format";

const int = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} harus bilangan bulat`)
    .transform(Number)
    .refine((n) => n >= min && n <= max, `${label} harus ${min}–${max}`);

const schema = z.object({
  agency_name: z.string().trim().min(5, "Minimal 5 karakter").max(200, "Maksimal 200 karakter"),
  agency_short_name: z.string().trim().min(2, "Minimal 2 karakter").max(80, "Maksimal 80 karakter"),
  max_upload_mb: int("Batas unggah", 1, 10),
  expiry_warning_days: int("Jumlah hari", 1, 365),
});

type FormValues = { agency_name: string; agency_short_name: string; max_upload_mb: string; expiry_warning_days: string };
const toForm = (s: Settings): FormValues => ({
  agency_name: s.agency_name,
  agency_short_name: s.agency_short_name,
  max_upload_mb: String(s.max_upload_mb),
  expiry_warning_days: String(s.expiry_warning_days),
});

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Pengaturan" description="Pengaturan sistem yang berlaku untuk seluruh pengguna. Setiap perubahan tercatat di Audit Log." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SettingsForm />
        <SystemInfo />
      </div>
      <div className="mt-4">
        <StorageIntegrity />
      </div>
    </>
  );
}

function SettingsForm() {
  const qc = useQueryClient();
  const settings = useSettings();
  const form = useZodForm(schema, toForm(settings.data?.values ?? { agency_name: "", agency_short_name: "", max_upload_mb: 10, expiry_warning_days: 30 }));
  const [formError, setFormError] = useState<string | null>(null);
  const loaded = settings.data?.values;
  const { setValues } = form;
  useEffect(() => {
    if (loaded) setValues(toForm(loaded));
  }, [loaded, setValues]);

  const save = useMutation({
    mutationFn: async () => {
      const v = form.validate();
      if (!v || !loaded) return null;
      const changes = Object.fromEntries(
        (Object.keys(v) as (keyof Settings)[]).filter((k) => v[k] !== loaded[k]).map((k) => [k, v[k]]),
      ) as Partial<Settings>;
      return saveSettings(changes);
    },
    onMutate: () => setFormError(null),
    onSuccess: (n) => {
      if (n === null) return;
      toast.success(n ? `${n} pengaturan disimpan.` : "Tidak ada perubahan.");
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  const dirty = !!loaded && JSON.stringify(form.values) !== JSON.stringify(toForm(loaded));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pengaturan umum</CardTitle>
        <CardDescription>Nama instansi dipakai pada kop laporan, label QR, dan halaman verifikasi publik.</CardDescription>
      </CardHeader>
      <CardContent>
        {settings.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : settings.isError ? (
          <FormAlert message={errorMessage(settings.error)} />
        ) : (
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <FormAlert message={formError} />
            <Field label="Nama instansi" required error={form.errors.agency_name}>
              <Input {...form.bind("agency_name")} maxLength={200} />
            </Field>
            <Field label="Nama singkat instansi" required error={form.errors.agency_short_name}>
              <Input {...form.bind("agency_short_name")} maxLength={80} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Batas ukuran unggah (MB)" required error={form.errors.max_upload_mb} hint="1–10 MB. Batas keras bucket Storage 10 MB.">
                <Input {...form.bind("max_upload_mb")} inputMode="numeric" />
              </Field>
              <Field
                label="Peringatan masa berlaku (hari)"
                required
                error={form.errors.expiry_warning_days}
                hint="Notifikasi “izin akan berakhir” dibuat sekian hari sebelumnya."
              >
                <Input {...form.bind("expiry_warning_days")} inputMode="numeric" />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2">
              {dirty ? (
                <Button type="button" variant="ghost" onClick={() => loaded && form.setValues(toForm(loaded))} disabled={save.isPending}>
                  Batalkan perubahan
                </Button>
              ) : null}
              <Button type="submit" disabled={save.isPending || !dirty}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                Simpan
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function SystemInfo() {
  const rows: [string, ReactNode][] = [
    ["Versi aplikasi", __APP_VERSION__],
    ["Waktu build", formatDateTime(__BUILD_TIME__)],
    ["Proyek Supabase", safeHost(SUPABASE_URL)],
    ["Bucket dokumen", "perizinan-documents (privat)"],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" aria-hidden /> Informasi sistem
        </CardTitle>
        <CardDescription>Untuk pelaporan masalah dan pengecekan setelah deploy.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-2 py-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0 break-all font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Akun dan role dikelola di halaman{" "}
          <Link to="/pengguna" className="font-medium text-navy-800 underline-offset-2 hover:underline">
            Pengguna
          </Link>
          . Audit keamanan basis data: jalankan <code className="rounded bg-muted px-1">supabase/audit/security_audit.sql</code> di SQL Editor.
        </p>
      </CardContent>
    </Card>
  );
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "-";
  }
}

const KIND_LABEL: Record<IntegrityRow["kind"], string> = {
  FILE_YATIM: "File tanpa catatan dokumen",
  FILE_HILANG: "Versi dokumen tanpa file",
};

function StorageIntegrity() {
  const [started, setStarted] = useState(false);
  const report = useQuery({ queryKey: ["storage-integrity"], queryFn: storageIntegrityReport, enabled: started, staleTime: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const rows = useMemo(() => report.data ?? [], [report.data]);
  const deletable = rows.filter((r) => r.deletable);
  const missing = rows.filter((r) => r.kind === "FILE_HILANG");

  useEffect(() => setSelected(new Set()), [report.data]);

  const remove = useMutation({
    mutationFn: () => deleteOrphans([...selected]),
    onSuccess: ({ deleted, skipped }) => {
      toast.success(`${deleted} file dihapus${skipped ? `, ${skipped} dilewati (bukan file yatim atau belum berumur 1 jam)` : ""}.`);
      setConfirm(false);
      report.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function exportCsv() {
    const csv = toCsv(rows, [
      { header: "Jenis", value: (r) => KIND_LABEL[r.kind] },
      { header: "Lokasi file", value: (r) => r.storage_path },
      { header: "Izin", value: (r) => r.license_label ?? "" },
      { header: "Ukuran (byte)", value: (r) => r.size_bytes },
      { header: "Format", value: (r) => r.mime_type ?? "" },
      { header: "Waktu", value: (r) => formatDateTime(r.created_at) },
    ]);
    downloadText(timestampedName("integritas_penyimpanan"), csv);
  }

  const allSelected = deletable.length > 0 && deletable.every((r) => selected.has(r.storage_path));

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-muted-foreground" aria-hidden /> Integritas penyimpanan
          </CardTitle>
          <CardDescription className="max-w-2xl">
            Mencocokkan file di bucket dengan catatan versi dokumen. File tanpa catatan biasanya sisa unggahan yang gagal disimpan;
            file tersebut dapat dihapus setelah berumur 1 jam. File yang sudah tercatat sebagai versi dokumen tidak dapat dihapus.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          {rows.length ? (
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4" aria-hidden /> CSV
            </Button>
          ) : null}
          <Button size="sm" variant={started ? "outline" : "default"} onClick={() => (started ? report.refetch() : setStarted(true))} disabled={report.isFetching}>
            {report.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : started ? (
              <RefreshCw className="h-4 w-4" aria-hidden />
            ) : (
              <SearchCheck className="h-4 w-4" aria-hidden />
            )}
            {started ? "Periksa ulang" : "Periksa sekarang"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!started ? null : report.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : report.isError ? (
          <FormAlert message={errorMessage(report.error)} />
        ) : !rows.length ? (
          <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Semua file dan catatan versi dokumen cocok.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm" role="status">
              {rows.length - missing.length} file tanpa catatan dokumen · {missing.length} versi dokumen tanpa file
              {missing.length ? " (unggah ulang sebagai versi baru dari halaman detail izin)" : ""}.
            </p>
            <div className="relative overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-navy-800"
                        aria-label="Pilih semua file yang dapat dihapus"
                        checked={allSelected}
                        disabled={!deletable.length}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(deletable.map((r) => r.storage_path)))}
                      />
                    </th>
                    <th className="px-3 py-2">Jenis</th>
                    <th className="px-3 py-2">Lokasi file</th>
                    <th className="px-3 py-2">Izin</th>
                    <th className="px-3 py-2 text-right">Ukuran</th>
                    <th className="px-3 py-2">Waktu</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={`${r.kind}:${r.storage_path}`}>
                      <td className="px-3 py-2">
                        {r.deletable ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-navy-800"
                            aria-label={`Pilih ${r.storage_path}`}
                            checked={selected.has(r.storage_path)}
                            onChange={() =>
                              setSelected((s) => {
                                const n = new Set(s);
                                if (n.has(r.storage_path)) n.delete(r.storage_path);
                                else n.add(r.storage_path);
                                return n;
                              })
                            }
                          />
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className={r.kind === "FILE_HILANG" ? "text-red-700" : "text-amber-700"}>{KIND_LABEL[r.kind]}</span>
                        {r.kind === "FILE_YATIM" && !r.deletable ? <span className="block text-xs text-muted-foreground">baru diunggah (&lt; 1 jam)</span> : null}
                      </td>
                      <td className="max-w-[360px] break-all px-3 py-2 font-mono text-xs">{r.storage_path}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {r.license_id ? (
                          <Link to={`/perizinan/${r.license_id}`} className="text-navy-800 hover:underline">
                            {r.license_label ?? "Buka izin"}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatBytes(r.size_bytes)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{formatDateTime(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <Button variant="danger" size="sm" disabled={!selected.size || remove.isPending} onClick={() => setConfirm(true)}>
                <Trash2 className="h-4 w-4" aria-hidden /> Hapus {selected.size || ""} file terpilih
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirm}
        danger
        busy={remove.isPending}
        title="Hapus file yatim?"
        message={`${selected.size} file akan dihapus permanen dari penyimpanan. File ini tidak tercatat sebagai dokumen mana pun. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus permanen"
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirm(false)}
      />
    </Card>
  );
}
