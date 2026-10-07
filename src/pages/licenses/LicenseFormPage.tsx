import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Lock } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { BackLink } from "@/components/shared/DetailList";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/errors";
import { getApplicant } from "@/services/applicants";
import { getBusiness } from "@/services/businesses";
import { getLicense } from "@/services/licenses";
import { LICENSE_STATUS_LABEL } from "@/types/entities";
import { LicenseForm, type LicenseFormValues } from "./LicenseForm";
import { canCreateLicense, licensePermissions } from "./permissions";

const EMPTY: LicenseFormValues = {
  license_type_id: "",
  applicant_id: "",
  applicant_label: "",
  business_id: "",
  business_label: "",
  district_id: "",
  application_date: "",
  notes: "",
  license_number: "",
  issue_date: "",
  expiry_date: "",
  status: "DRAFT",
};

const ISSUED = ["DITERBITKAN", "AKTIF", "BERAKHIR", "DICABUT"];

function FormSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

export function LicenseCreatePage() {
  const { profile } = useAuth();
  const [params] = useSearchParams();
  const applicantId = params.get("pemohon");
  const businessId = params.get("perusahaan");

  // Prefill bila dibuka dari halaman detail pemohon/perusahaan.
  const prefill = useQuery({
    queryKey: ["licenses", "prefill", applicantId, businessId],
    queryFn: async () => {
      const [a, b] = await Promise.all([
        applicantId ? getApplicant(applicantId).catch(() => null) : null,
        businessId ? getBusiness(businessId).catch(() => null) : null,
      ]);
      return {
        ...EMPTY,
        applicant_id: a?.id ?? "",
        applicant_label: a?.full_name ?? "",
        business_id: b?.id ?? "",
        business_label: b?.name ?? "",
        district_id: b?.district_id ?? a?.district_id ?? "",
      } satisfies LicenseFormValues;
    },
    enabled: !!(applicantId || businessId),
    staleTime: Infinity,
  });

  if (!canCreateLicense(profile)) {
    return <EmptyState icon={Lock} title="Tidak berwenang" description="Role Anda tidak dapat menambah data perizinan." />;
  }
  if ((applicantId || businessId) && prefill.isLoading) return <FormSkeleton />;

  const admin = profile?.role === "super_admin" || profile?.role === "admin_arsip";
  return (
    <>
      <BackLink to="/perizinan">Kembali ke data perizinan</BackLink>
      <PageHeader
        title="Tambah perizinan"
        description={admin ? "Permohonan baru atau digitalisasi arsip izin lama." : "Permohonan baru tersimpan sebagai Draft."}
      />
      <LicenseForm mode="create" initial={prefill.data ?? EMPTY} canEditIssuance={admin} />
    </>
  );
}

export function LicenseEditPage() {
  const { id = "" } = useParams();
  const { profile } = useAuth();
  const q = useQuery({ queryKey: ["licenses", "detail", id], queryFn: () => getLicense(id) });

  if (q.isLoading) return <FormSkeleton />;
  if (q.isError || !q.data) {
    return (
      <>
        <BackLink to="/perizinan">Kembali ke data perizinan</BackLink>
        <EmptyState icon={ClipboardList} title="Data perizinan tidak ditemukan" description={errorMessage(q.error)} />
      </>
    );
  }
  const l = q.data;
  const perms = licensePermissions(profile, l);
  if (!perms.canEdit) {
    return (
      <>
        <BackLink to={`/perizinan/${id}`}>Kembali ke detail</BackLink>
        <EmptyState
          icon={Lock}
          title="Data tidak dapat diubah"
          description={`Izin berstatus ${LICENSE_STATUS_LABEL[l.status]} hanya dapat diubah oleh Admin Arsip, atau oleh Petugas pemiliknya selama berstatus Draft/Diajukan.`}
        />
      </>
    );
  }

  const initial: LicenseFormValues = {
    license_type_id: l.license_type_id,
    applicant_id: l.applicant_id,
    applicant_label: l.applicant?.full_name ?? l.summary?.applicant_name ?? "",
    business_id: l.business_id ?? "",
    business_label: l.business?.name ?? l.summary?.business_name ?? "",
    district_id: l.district_id ?? "",
    application_date: l.application_date ?? "",
    notes: l.notes ?? "",
    license_number: l.license_number ?? "",
    issue_date: l.issue_date ?? "",
    expiry_date: l.expiry_date ?? "",
    status: ISSUED.includes(l.status) ? "AKTIF" : "DRAFT",
  };

  return (
    <>
      <BackLink to={`/perizinan/${id}`}>Kembali ke detail</BackLink>
      <PageHeader title="Ubah perizinan" description={`${l.application_number} · ${LICENSE_STATUS_LABEL[l.status]}`} />
      <LicenseForm
        mode="edit"
        licenseId={id}
        initial={initial}
        canEditIssuance={perms.canEditIssuance}
        lockedType={!["DRAFT", "DIAJUKAN", "DITOLAK"].includes(l.status)}
      />
    </>
  );
}
