import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/shared/Modal";
import { Field, FormAlert } from "@/components/shared/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useZodForm } from "@/hooks/useZodForm";
import { useDistricts, REF_KEY } from "@/hooks/useReference";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { saveMaster } from "@/services/master";
import { initialValues, type MasterEntity, type MasterRow } from "./entities";

export function MasterFormModal({
  entity,
  row,
  onClose,
}: {
  entity: MasterEntity;
  row: MasterRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const form = useZodForm(entity.schema, initialValues(entity, row));
  const [error, setError] = useState<string | null>(null);
  const districts = useDistricts();

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) => saveMaster(entity, row?.id ?? null, payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["master", entity.slug] }),
        qc.invalidateQueries({ queryKey: REF_KEY }),
      ]);
      toast.success(row ? "Perubahan disimpan." : `Data ${entity.singular} ditambahkan.`);
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

  const formId = `master-form-${entity.slug}`;

  return (
    <Modal
      open
      size="lg"
      onClose={save.isPending ? () => undefined : onClose}
      title={row ? `Ubah ${entity.singular}` : `Tambah ${entity.singular}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Batal
          </Button>
          <Button type="submit" form={formId} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Simpan
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          {entity.fields.map((f) => {
            const err = form.errors[f.key];
            if (f.type === "boolean") {
              return (
                <label key={f.key} className={cn("flex items-start gap-3 rounded-lg border p-3", f.wide && "sm:col-span-2")}>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-navy-800"
                    checked={Boolean(form.values[f.key])}
                    onChange={(e) => form.set(f.key, e.target.checked)}
                  />
                  <span>
                    <span className="text-sm font-medium">{f.label}</span>
                    {f.hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{f.hint}</span> : null}
                  </span>
                </label>
              );
            }
            const b = form.bind(f.key);
            let control;
            if (f.type === "textarea") control = <Textarea {...b} placeholder={f.placeholder} />;
            else if (f.type === "select") {
              const opts =
                f.source === "districts"
                  ? (districts.data ?? []).map((d) => ({ value: d.id, label: d.name }))
                  : (f.options ?? []);
              control = (
                <Select {...b}>
                  <option value="">— Pilih —</option>
                  {opts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              );
            } else {
              control = (
                <Input
                  {...b}
                  placeholder={f.placeholder}
                  onChange={(e) => form.set(f.key, f.uppercase ? e.target.value.toUpperCase() : e.target.value)}
                  inputMode={f.key === "validity_months" ? "numeric" : undefined}
                />
              );
            }
            return (
              <Field
                key={f.key}
                label={f.label}
                required={f.required}
                error={err}
                hint={f.hint}
                className={cn((f.wide || f.type === "textarea") && "sm:col-span-2")}
              >
                {control}
              </Field>
            );
          })}
        </div>
      </form>
    </Modal>
  );
}
