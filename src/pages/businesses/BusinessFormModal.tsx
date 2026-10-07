import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Modal } from "@/components/shared/Modal";
import { Field, FormAlert } from "@/components/shared/Field";
import { RegionFields } from "@/components/shared/RegionFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useZodForm } from "@/hooks/useZodForm";
import { AppError, errorMessage } from "@/lib/errors";
import { optDigits, optEmail, optId, optNpwp, optPhone, optText, reqText } from "@/lib/validation";
import { ENTITY_TYPES, findBusinessByNib, saveBusiness } from "@/services/businesses";
import type { Business } from "@/types/entities";

const schema = z.object({
  name: reqText("Nama perusahaan", 200),
  nib: optDigits("NIB", 13),
  npwp: optNpwp,
  entity_type: optText(40),
  person_in_charge: optText(150),
  phone: optPhone,
  email: optEmail,
  address: optText(500),
  district_id: optId,
  village_id: optId,
});

export function BusinessFormModal({
  business,
  onClose,
  onSaved,
}: {
  business?: Business | null;
  onClose: () => void;
  onSaved?: (row: Business) => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const form = useZodForm(schema, {
    name: business?.name ?? "",
    nib: business?.nib ?? "",
    npwp: business?.npwp ?? "",
    entity_type: business?.entity_type ?? "",
    person_in_charge: business?.person_in_charge ?? "",
    phone: business?.phone ?? "",
    email: business?.email ?? "",
    address: business?.address ?? "",
    district_id: business?.district_id ?? "",
    village_id: business?.village_id ?? "",
  });

  const save = useMutation({
    mutationFn: async (input: z.output<typeof schema>) => {
      if (input.nib) {
        const dup = await findBusinessByNib(input.nib, business?.id);
        if (dup) {
          setDuplicate(dup);
          throw new AppError(`NIB ini sudah terdaftar atas nama ${dup.name}.`);
        }
      }
      return saveBusiness(business?.id ?? null, input);
    },
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: ["businesses"] });
      toast.success(business ? "Data perusahaan diperbarui." : "Perusahaan ditambahkan.");
      onSaved?.(row);
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDuplicate(null);
    const data = form.validate();
    if (data) save.mutate(data);
  }

  const entityOptions = ENTITY_TYPES.includes(form.values.entity_type) || !form.values.entity_type
    ? ENTITY_TYPES
    : [form.values.entity_type, ...ENTITY_TYPES];

  return (
    <Modal
      open
      size="lg"
      onClose={save.isPending ? () => undefined : onClose}
      title={business ? "Ubah perusahaan" : "Tambah perusahaan"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Batal
          </Button>
          <Button type="submit" form="business-form" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Simpan
          </Button>
        </>
      }
    >
      <form id="business-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={error} />
        {duplicate ? (
          <p className="text-sm">
            <Link to={`/perusahaan/${duplicate.id}`} className="font-medium text-accent underline" onClick={onClose}>
              Buka data perusahaan yang sudah ada
            </Link>
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama perusahaan/usaha" required error={form.errors.name} className="sm:col-span-2">
            <Input {...form.bind("name")} autoComplete="off" />
          </Field>
          <Field label="Bentuk usaha" error={form.errors.entity_type}>
            <Select {...form.bind("entity_type")}>
              <option value="">— Pilih —</option>
              {entityOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Penanggung jawab" error={form.errors.person_in_charge}>
            <Input {...form.bind("person_in_charge")} autoComplete="off" />
          </Field>
          <Field label="NIB" error={form.errors.nib} hint="13 digit dari OSS.">
            <Input {...form.bind("nib")} inputMode="numeric" maxLength={16} autoComplete="off" />
          </Field>
          <Field label="NPWP" error={form.errors.npwp}>
            <Input {...form.bind("npwp")} maxLength={20} autoComplete="off" />
          </Field>
          <Field label="Nomor telepon" error={form.errors.phone}>
            <Input {...form.bind("phone")} inputMode="tel" autoComplete="off" />
          </Field>
          <Field label="Email" error={form.errors.email}>
            <Input {...form.bind("email")} type="email" autoComplete="off" />
          </Field>
          <RegionFields
            districtId={form.values.district_id}
            villageId={form.values.village_id}
            onChange={(r) => form.setValues((v) => ({ ...v, ...r }))}
          />
          <Field label="Alamat" error={form.errors.address} className="sm:col-span-2">
            <Textarea {...form.bind("address")} rows={2} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
