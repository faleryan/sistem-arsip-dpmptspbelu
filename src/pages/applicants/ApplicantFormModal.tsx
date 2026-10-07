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
import { Textarea } from "@/components/ui/textarea";
import { useZodForm } from "@/hooks/useZodForm";
import { AppError, errorMessage } from "@/lib/errors";
import { optDigits, optEmail, optId, optNpwp, optPhone, optText, reqText } from "@/lib/validation";
import { findApplicantByNik, saveApplicant } from "@/services/applicants";
import type { Applicant } from "@/types/entities";

const schema = z.object({
  full_name: reqText("Nama lengkap", 150),
  nik: optDigits("NIK", 16),
  npwp: optNpwp,
  phone: optPhone,
  email: optEmail,
  address: optText(500),
  district_id: optId,
  village_id: optId,
});

export function ApplicantFormModal({
  applicant,
  onClose,
  onSaved,
}: {
  applicant?: Applicant | null;
  onClose: () => void;
  onSaved?: (row: Applicant) => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; full_name: string } | null>(null);
  const form = useZodForm(schema, {
    full_name: applicant?.full_name ?? "",
    nik: applicant?.nik ?? "",
    npwp: applicant?.npwp ?? "",
    phone: applicant?.phone ?? "",
    email: applicant?.email ?? "",
    address: applicant?.address ?? "",
    district_id: applicant?.district_id ?? "",
    village_id: applicant?.village_id ?? "",
  });

  const save = useMutation({
    mutationFn: async (input: z.output<typeof schema>) => {
      if (input.nik) {
        const dup = await findApplicantByNik(input.nik, applicant?.id);
        if (dup) {
          setDuplicate(dup);
          throw new AppError(`NIK ini sudah terdaftar atas nama ${dup.full_name}.`);
        }
      }
      return saveApplicant(applicant?.id ?? null, input);
    },
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: ["applicants"] });
      toast.success(applicant ? "Data pemohon diperbarui." : "Pemohon ditambahkan.");
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

  return (
    <Modal
      open
      size="lg"
      onClose={save.isPending ? () => undefined : onClose}
      title={applicant ? "Ubah pemohon" : "Tambah pemohon"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Batal
          </Button>
          <Button type="submit" form="applicant-form" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Simpan
          </Button>
        </>
      }
    >
      <form id="applicant-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={error} />
        {duplicate ? (
          <p className="text-sm">
            <Link to={`/pemohon/${duplicate.id}`} className="font-medium text-accent underline" onClick={onClose}>
              Buka data pemohon yang sudah ada
            </Link>
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama lengkap" required error={form.errors.full_name} className="sm:col-span-2">
            <Input {...form.bind("full_name")} autoComplete="off" />
          </Field>
          <Field label="NIK" error={form.errors.nik} hint="16 digit sesuai KTP.">
            <Input {...form.bind("nik")} inputMode="numeric" maxLength={20} autoComplete="off" />
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
