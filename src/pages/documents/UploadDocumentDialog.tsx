import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Modal } from "@/components/shared/Modal";
import { Field, FormAlert } from "@/components/shared/Field";
import { FileDropzone } from "@/components/shared/FileDropzone";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useZodForm } from "@/hooks/useZodForm";
import { useArchiveClasses, useDocumentTypes } from "@/hooks/useReference";
import { errorMessage } from "@/lib/errors";
import { HARD_MAX_BYTES } from "@/lib/files";
import { optDate, optId, optText, reqId, reqText } from "@/lib/validation";
import {
  getMaxUploadBytes,
  uploadNewDocument,
  uploadNewVersion,
  type UploadProgress,
} from "@/services/documents";
import { todayWita } from "@/utils/date";
import { DOC_STATUS_LABEL, type DocumentRow, type LicenseStatus } from "@/types/entities";

export type UploadTarget = {
  licenseId: string;
  year: number | null;
  licenseStatus: LicenseStatus;
  label: string;
};

export type UploadMode = { kind: "new"; presetTypeId?: string } | { kind: "version"; document: DocumentRow };

const ARCHIVE_STAGE: LicenseStatus[] = ["DISETUJUI", "DITERBITKAN", "AKTIF", "BERAKHIR", "DICABUT", "DIBATALKAN"];

const schema = z.object({
  document_type_id: reqId("Jenis dokumen"),
  title: reqText("Judul dokumen", 300),
  document_number: optText(100),
  document_date: optDate.refine((v) => !v || v <= todayWita(), "Tanggal dokumen tidak boleh di masa depan."),
  archive_class_id: optId,
});

const PHASE_LABEL: Record<UploadProgress["phase"], string> = {
  validating: "Memeriksa file…",
  hashing: "Menghitung checksum…",
  uploading: "Mengunggah",
  saving: "Menyimpan data…",
};

export function UploadDocumentDialog({
  target,
  mode,
  onClose,
}: {
  target: UploadTarget;
  mode: UploadMode;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const docTypes = useDocumentTypes(true);
  const classes = useArchiveClasses();
  const maxBytes = useQuery({ queryKey: ["settings", "max_upload"], queryFn: getMaxUploadBytes, staleTime: 10 * 60 * 1000 });
  const limit = maxBytes.data ?? HARD_MAX_BYTES;

  const isVersion = mode.kind === "version";
  const presetType = mode.kind === "new" ? mode.presetTypeId : mode.document.document_type_id;
  const presetName = docTypes.data?.find((t) => t.id === presetType)?.name ?? "";

  const form = useZodForm(schema, {
    document_type_id: presetType ?? "",
    title: isVersion ? mode.document.title : presetName,
    document_number: "",
    document_date: "",
    archive_class_id: "",
  });
  const titleTouched = useRef(isVersion);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const abort = useRef<AbortController | null>(null);

  const typeOptions = docTypes.data ?? [];
  const selectedType = typeOptions.find((t) => t.id === form.values.document_type_id);
  const willArchive = ARCHIVE_STAGE.includes(target.licenseStatus);

  // Judul otomatis mengikuti jenis dokumen sampai pengguna mengetik sendiri.
  const typeName = selectedType?.name;
  const { setValues } = form;
  useEffect(() => {
    if (!isVersion && !titleTouched.current && typeName) setValues((v) => ({ ...v, title: typeName }));
  }, [isVersion, typeName, setValues]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Pilih file terlebih dahulu.");
      abort.current = new AbortController();
      const base = { licenseId: target.licenseId, year: target.year ?? new Date().getFullYear(), file, maxBytes: limit };
      if (mode.kind === "version") {
        await uploadNewVersion({ ...base, folder: mode.document.storage_folder, documentId: mode.document.id }, setProgress, abort.current.signal);
        return;
      }
      const data = form.validate();
      if (!data) throw new Error("Periksa kembali isian yang ditandai.");
      const type = typeOptions.find((t) => t.id === data.document_type_id);
      if (!type) throw new Error("Jenis dokumen tidak ditemukan.");
      await uploadNewDocument(
        {
          ...base,
          folder: type.storage_folder,
          documentTypeId: type.id,
          meta: {
            title: data.title,
            document_number: data.document_number,
            document_date: data.document_date,
            archive_class_id: data.archive_class_id,
          },
        },
        setProgress,
        abort.current.signal,
      );
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["documents"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      toast.success(isVersion ? "Versi baru diunggah." : "Dokumen diunggah.");
      onClose();
    },
    onError: (e) => {
      setProgress(null);
      const msg = errorMessage(e);
      if (/^(Format file|Ukuran file|Isi file|File kosong|Nama file)/.test(msg)) setFileError(msg);
      else setError(msg);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFileError(null);
    if (!isVersion && !form.validate()) return;
    if (!file) {
      setFileError("Pilih file yang akan diunggah.");
      return;
    }
    upload.mutate();
  }

  const busy = upload.isPending;
  const pct = progress?.phase === "uploading" ? Math.round(progress.fraction * 100) : null;
  const classOptions = useMemo(() => (classes.data ?? []).filter((c) => c.is_active), [classes.data]);

  return (
    <Modal
      open
      size="lg"
      onClose={busy ? () => undefined : onClose}
      title={isVersion ? `Unggah versi baru — ${mode.document.title}` : `Unggah dokumen — ${target.label}`}
      footer={
        busy ? (
          <Button variant="outline" onClick={() => abort.current?.abort()} disabled={progress?.phase !== "uploading"}>
            Batalkan unggahan
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" form="upload-form">
              Unggah
            </Button>
          </>
        )
      }
    >
      <form id="upload-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={error} />

        {isVersion ? (
          <div className="rounded-lg border bg-slate-50 p-3 text-sm">
            <p>
              <span className="text-muted-foreground">Versi aktif:</span> v{mode.document.version_no} · {mode.document.file_name}
            </p>
            <p className="mt-1 flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span>
              <StatusBadge status={mode.document.status} label={DOC_STATUS_LABEL[mode.document.status]} />
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Versi lama tetap tersimpan di arsip. Versi baru menjadi versi aktif
              {willArchive ? " dan langsung berstatus Diarsipkan." : " dan menunggu verifikasi ulang."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Jenis dokumen" required error={form.errors.document_type_id}>
              <Select {...form.bind("document_type_id")} disabled={busy}>
                <option value="">{docTypes.isLoading ? "Memuat…" : "— Pilih jenis dokumen —"}</option>
                {typeOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Klasifikasi arsip" error={form.errors.archive_class_id}>
              <Select {...form.bind("archive_class_id")} disabled={busy}>
                <option value="">— Tanpa klasifikasi —</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Judul dokumen" required error={form.errors.title} className="sm:col-span-2">
              <Input
                {...form.bind("title")}
                onChange={(e) => {
                  titleTouched.current = true;
                  form.set("title", e.target.value);
                }}
                disabled={busy}
              />
            </Field>
            <Field label="Nomor dokumen" error={form.errors.document_number}>
              <Input {...form.bind("document_number")} disabled={busy} autoComplete="off" />
            </Field>
            <Field label="Tanggal dokumen" error={form.errors.document_date}>
              <Input type="date" {...form.bind("document_date")} max={todayWita()} disabled={busy} />
            </Field>
            {selectedType?.viewer_visible ? (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Jenis dokumen ini dapat dilihat role Viewer setelah izin terbit.
              </p>
            ) : null}
          </div>
        )}

        <div className="space-y-1.5">
          <span className="text-sm font-medium">
            File<span className="ml-0.5 text-red-600" aria-hidden>*</span>
          </span>
          <FileDropzone
            file={file}
            onFile={(f) => {
              setFile(f);
              setFileError(null);
            }}
            maxBytes={limit}
            disabled={busy}
            error={fileError}
          />
          {fileError ? (
            <p role="alert" className="text-xs text-red-600">
              {fileError}
            </p>
          ) : null}
        </div>

        {!isVersion && willArchive ? (
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            Izin ini sudah melewati tahap verifikasi, sehingga dokumen langsung berstatus <strong>Diarsipkan</strong>.
          </p>
        ) : null}

        {progress ? (
          <div aria-live="polite" className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {PHASE_LABEL[progress.phase]}
                {pct !== null ? ` ${pct}%` : ""}
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Progres unggah"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct ?? (progress.phase === "saving" ? 100 : 0)}
            >
              <div
                className="h-full rounded-full bg-navy-500 transition-all"
                style={{ width: `${progress.phase === "saving" ? 100 : (pct ?? 3)}%` }}
              />
            </div>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
