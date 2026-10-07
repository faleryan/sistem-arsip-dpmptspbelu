import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Modal } from "@/components/shared/Modal";
import { Field, FormAlert } from "@/components/shared/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useZodForm } from "@/hooks/useZodForm";
import { useArchiveClasses } from "@/hooks/useReference";
import { errorMessage } from "@/lib/errors";
import { optDate, optId, optText, reqText } from "@/lib/validation";
import { updateDocumentMeta } from "@/services/documents";
import { todayWita } from "@/utils/date";
import type { DocumentRow } from "@/types/entities";

const schema = z.object({
  title: reqText("Judul dokumen", 300),
  document_number: optText(100),
  document_date: optDate.refine((v) => !v || v <= todayWita(), "Tanggal dokumen tidak boleh di masa depan."),
  archive_class_id: optId,
});

/** Ubah info (metadata) dokumen. Jenis dokumen dan file tidak dapat diubah di sini. */
export function DocumentMetaDialog({ doc, onClose }: { doc: DocumentRow; onClose: () => void }) {
  const qc = useQueryClient();
  const classes = useArchiveClasses();
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(schema, {
    title: doc.title,
    document_number: doc.document_number ?? "",
    document_date: doc.document_date ?? "",
    archive_class_id: doc.archive_class_id ?? "",
  });
  const classOptions = useMemo(
    () => (classes.data ?? []).filter((c) => c.is_active || c.id === doc.archive_class_id),
    [classes.data, doc.archive_class_id],
  );

  const save = useMutation({
    mutationFn: (data: z.output<typeof schema>) => updateDocumentMeta(doc.id, data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Info dokumen disimpan.");
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const data = form.validate();
    if (data) save.mutate(data);
  }

  return (
    <Modal
      open
      size="lg"
      onClose={save.isPending ? () => undefined : onClose}
      title="Ubah info dokumen"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Batal
          </Button>
          <Button type="submit" form="doc-meta-form" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Simpan
          </Button>
        </>
      }
    >
      <form id="doc-meta-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={error} />
        <p className="text-sm text-muted-foreground">
          {doc.document_type_name} · {doc.file_name}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Judul dokumen" required error={form.errors.title} className="sm:col-span-2">
            <Input {...form.bind("title")} />
          </Field>
          <Field label="Nomor dokumen" error={form.errors.document_number}>
            <Input {...form.bind("document_number")} autoComplete="off" />
          </Field>
          <Field label="Tanggal dokumen" error={form.errors.document_date}>
            <Input type="date" {...form.bind("document_date")} max={todayWita()} />
          </Field>
          <Field label="Klasifikasi arsip" error={form.errors.archive_class_id} className="sm:col-span-2">
            <Select {...form.bind("archive_class_id")}>
              <option value="">— Tanpa klasifikasi —</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}
