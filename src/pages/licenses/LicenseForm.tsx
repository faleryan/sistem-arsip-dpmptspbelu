import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Combobox } from "@/components/shared/Combobox";
import { Field, FormAlert } from "@/components/shared/Field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useZodForm } from "@/hooks/useZodForm";
import { useDistricts, useLicenseTypes } from "@/hooks/useReference";
import { errorMessage } from "@/lib/errors";
import { optDate, optId, optText, reqId } from "@/lib/validation";
import { searchApplicants } from "@/services/applicants";
import { searchBusinesses } from "@/services/businesses";
import { createLicense, updateLicense, type LicenseInput } from "@/services/licenses";
import { addMonths, todayWita } from "@/utils/date";
import { formatDate } from "@/utils/format";
import { LICENSE_STATUS_LABEL } from "@/types/entities";
import { ApplicantFormModal } from "@/pages/applicants/ApplicantFormModal";
import { BusinessFormModal } from "@/pages/businesses/BusinessFormModal";

/** Status awal yang boleh dipilih Admin saat mendigitalkan arsip izin lama. */
const INITIAL_STATUSES = ["DRAFT", "AKTIF", "BERAKHIR"] as const;

const schema = z
  .object({
    license_type_id: reqId("Jenis izin"),
    applicant_id: reqId("Pemohon"),
    applicant_label: z.string(),
    business_id: optId,
    business_label: z.string(),
    district_id: optId,
    application_date: optDate,
    notes: optText(2000),
    license_number: optText(100),
    issue_date: optDate,
    expiry_date: optDate,
    status: z.enum(INITIAL_STATUSES),
  })
  .superRefine((v, ctx) => {
    if (v.status !== "DRAFT") {
      if (!v.license_number) ctx.addIssue({ code: "custom", path: ["license_number"], message: "Nomor izin wajib untuk izin yang sudah terbit." });
      if (!v.issue_date) ctx.addIssue({ code: "custom", path: ["issue_date"], message: "Tanggal terbit wajib untuk izin yang sudah terbit." });
    }
    if (v.issue_date && v.expiry_date && v.expiry_date < v.issue_date) {
      ctx.addIssue({ code: "custom", path: ["expiry_date"], message: "Tanggal berakhir tidak boleh sebelum tanggal terbit." });
    }
    if (v.application_date && v.application_date > todayWita()) {
      ctx.addIssue({ code: "custom", path: ["application_date"], message: "Tanggal permohonan tidak boleh di masa depan." });
    }
  });

export type LicenseFormValues = {
  license_type_id: string;
  applicant_id: string;
  applicant_label: string;
  business_id: string;
  business_label: string;
  district_id: string;
  application_date: string;
  notes: string;
  license_number: string;
  issue_date: string;
  expiry_date: string;
  status: (typeof INITIAL_STATUSES)[number];
};

export function LicenseForm({
  mode,
  licenseId,
  initial,
  canEditIssuance,
  lockedType,
}: {
  mode: "create" | "edit";
  licenseId?: string;
  initial: LicenseFormValues;
  /** Admin Arsip/Super Admin: boleh mengisi nomor izin & tanggal terbit/berakhir. */
  canEditIssuance: boolean;
  /** Jenis izin tidak boleh diganti setelah permohonan diproses. */
  lockedType?: boolean;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const form = useZodForm(schema, initial);
  const [error, setError] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState<"applicant" | "business" | null>(null);
  const types = useLicenseTypes();
  const districts = useDistricts();
  const v = form.values;

  const typeOptions = useMemo(
    () => (types.data ?? []).filter((t) => t.is_active || t.id === initial.license_type_id),
    [types.data, initial.license_type_id],
  );
  const selectedType = typeOptions.find((t) => t.id === v.license_type_id);
  const suggestedExpiry =
    selectedType?.validity_months && v.issue_date ? addMonths(v.issue_date, selectedType.validity_months) : null;
  // Izin yang sudah terbit (atau arsip izin lama) wajib punya nomor izin dan tanggal terbit.
  const requireIssuance = v.status !== "DRAFT";
  const legacy = mode === "create" && requireIssuance;

  const save = useMutation({
    mutationFn: async (data: z.output<typeof schema>) => {
      const payload: LicenseInput = {
        license_type_id: data.license_type_id,
        applicant_id: data.applicant_id,
        business_id: data.business_id,
        district_id: data.district_id,
        application_date: data.application_date,
        notes: data.notes,
      };
      if (canEditIssuance) {
        payload.license_number = data.license_number;
        payload.issue_date = data.issue_date;
        payload.expiry_date = data.expiry_date ?? (legacy ? suggestedExpiry : null);
      }
      if (mode === "create") {
        if (canEditIssuance) payload.status = data.status;
        return createLicense(payload);
      }
      await updateLicense(licenseId!, payload);
      return { id: licenseId! };
    },
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: ["licenses"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(mode === "create" ? "Data perizinan dibuat." : "Perubahan disimpan.");
      navigate(`/perizinan/${id}`, { replace: mode === "edit" });
    },
    onError: (e) => {
      setError(errorMessage(e));
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const data = form.validate();
    if (data) save.mutate(data);
    else setError("Periksa kembali isian yang ditandai.");
  }

  return (
    <>
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormAlert message={error} />

      <Card>
        <CardHeader>
          <CardTitle>Data permohonan</CardTitle>
          <CardDescription>Nomor permohonan dibuat otomatis oleh sistem.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Jenis izin"
            required
            error={form.errors.license_type_id}
            hint={lockedType ? "Jenis izin tidak dapat diganti setelah permohonan diproses." : selectedType?.description ?? undefined}
            className="sm:col-span-2"
          >
            <Select {...form.bind("license_type_id")} disabled={lockedType}>
              <option value="">{types.isLoading ? "Memuat…" : "— Pilih jenis izin —"}</option>
              {typeOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </option>
              ))}
            </Select>
          </Field>

          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-end justify-between gap-2">
              <label htmlFor="lic-applicant" className="text-sm font-medium leading-none">
                Pemohon<span className="ml-0.5 text-red-600" aria-hidden>*</span>
              </label>
              <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setQuickAdd("applicant")}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Pemohon baru
              </Button>
            </div>
            <Combobox
              id="lic-applicant"
              queryKey="applicants"
              value={v.applicant_id}
              label={v.applicant_label}
              invalid={!!form.errors.applicant_id}
              aria-describedby={form.errors.applicant_id ? "lic-applicant-err" : undefined}
              placeholder="Cari nama atau NIK pemohon…"
              search={async (t) => (await searchApplicants(t)).map((a) => ({ value: a.id, label: a.full_name, hint: a.nik }))}
              onChange={(o) => form.setValues((s) => ({ ...s, applicant_id: o?.value ?? "", applicant_label: o?.label ?? "" }))}
            />
            {form.errors.applicant_id ? (
              <p id="lic-applicant-err" className="text-xs text-red-600">
                {form.errors.applicant_id}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-end justify-between gap-2">
              <label htmlFor="lic-business" className="text-sm font-medium leading-none">
                Perusahaan <span className="font-normal text-muted-foreground">(opsional, kosongkan untuk izin perorangan)</span>
              </label>
              <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setQuickAdd("business")}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Perusahaan baru
              </Button>
            </div>
            <Combobox
              id="lic-business"
              queryKey="businesses"
              value={v.business_id}
              label={v.business_label}
              placeholder="Cari nama atau NIB perusahaan…"
              search={async (t) => (await searchBusinesses(t)).map((b) => ({ value: b.id, label: b.name, hint: b.nib }))}
              onChange={(o) => form.setValues((s) => ({ ...s, business_id: o?.value ?? "", business_label: o?.label ?? "" }))}
            />
          </div>

          <Field label="Kecamatan lokasi usaha/kegiatan" error={form.errors.district_id}>
            <Select {...form.bind("district_id")}>
              <option value="">— Pilih kecamatan —</option>
              {(districts.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tanggal permohonan" error={form.errors.application_date} hint="Kosongkan untuk memakai tanggal hari ini.">
            <Input type="date" {...form.bind("application_date")} max={todayWita()} />
          </Field>
          <Field label="Catatan" error={form.errors.notes} className="sm:col-span-2">
            <Textarea {...form.bind("notes")} rows={3} />
          </Field>
        </CardContent>
      </Card>

      {canEditIssuance ? (
        <Card>
          <CardHeader>
            <CardTitle>Data penerbitan</CardTitle>
            <CardDescription>
              Diisi Admin Arsip. Untuk permohonan baru, isi menjelang penerbitan. Untuk arsip izin lama yang sudah terbit, pilih
              status awal Aktif/Berakhir.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {mode === "create" ? (
              <Field
                label="Status awal"
                className="sm:col-span-2"
                hint={
                  legacy
                    ? "Arsip izin lama: data langsung tercatat sebagai izin terbit tanpa melalui alur verifikasi."
                    : "Permohonan baru mengikuti alur Draft → Diajukan → Verifikasi → Disetujui → Diterbitkan."
                }
              >
                <Select {...form.bind("status")}>
                  {INITIAL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s === "DRAFT" ? "Draft (permohonan baru)" : `${LICENSE_STATUS_LABEL[s]} (arsip izin lama)`}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Nomor izin" required={requireIssuance} error={form.errors.license_number} className="sm:col-span-2">
              <Input {...form.bind("license_number")} autoComplete="off" />
            </Field>
            <Field label="Tanggal terbit" required={requireIssuance} error={form.errors.issue_date}>
              <Input type="date" {...form.bind("issue_date")} />
            </Field>
            <Field
              label="Berlaku sampai"
              error={form.errors.expiry_date}
              hint={
                suggestedExpiry && !v.expiry_date
                  ? `Bila kosong: ${formatDate(suggestedExpiry)} (masa berlaku ${selectedType?.validity_months} bulan).`
                  : selectedType && !selectedType.validity_months
                    ? "Jenis izin ini berlaku tanpa batas waktu."
                    : undefined
              }
            >
              <Input type="date" {...form.bind("expiry_date")} min={v.issue_date || undefined} />
            </Field>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={save.isPending}>
          Batal
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {mode === "create" ? "Simpan permohonan" : "Simpan perubahan"}
        </Button>
      </div>
    </form>

      {/* Di luar <form> agar tidak terjadi form bersarang. */}
      {quickAdd === "applicant" ? (
        <ApplicantFormModal
          onClose={() => setQuickAdd(null)}
          onSaved={(a) => form.setValues((s) => ({ ...s, applicant_id: a.id, applicant_label: a.full_name }))}
        />
      ) : null}
      {quickAdd === "business" ? (
        <BusinessFormModal
          onClose={() => setQuickAdd(null)}
          onSaved={(b) =>
            form.setValues((s) => ({
              ...s,
              business_id: b.id,
              business_label: b.name,
              district_id: s.district_id || b.district_id || "",
            }))
          }
        />
      ) : null}
    </>
  );
}
