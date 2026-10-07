import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { BackLink, DetailList } from "@/components/shared/DetailList";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/errors";
import { getLicense, listStaffNames, listTransitions, softDeleteLicense } from "@/services/licenses";
import { formatDate } from "@/utils/format";
import { LICENSE_STATUS_LABEL, type StatusTransition } from "@/types/entities";
import { licensePermissions } from "./permissions";
import { ACTION_LABEL, DANGER_TARGETS } from "./status";
import { StatusChangeDialog } from "./StatusChangeDialog";
import { StatusHistoryCard } from "./StatusHistoryCard";
import { CompletenessCard } from "./CompletenessCard";

export default function LicenseDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const internal = profile?.role !== "viewer";
  const [action, setAction] = useState<StatusTransition | null>(null);
  const [deleting, setDeleting] = useState(false);

  const q = useQuery({ queryKey: ["licenses", "detail", id], queryFn: () => getLicense(id) });
  const status = q.data?.status;
  const transitions = useQuery({
    queryKey: ["licenses", "transitions", status],
    queryFn: () => listTransitions(status!),
    enabled: !!status && internal,
    staleTime: 5 * 60 * 1000,
  });
  const staff = useQuery({ queryKey: ["staff-names"], queryFn: listStaffNames, staleTime: 5 * 60 * 1000 });

  const remove = useMutation({
    mutationFn: () => softDeleteLicense(id),
    onSuccess: async () => {
      // Buang cache detail dulu agar tidak dimuat ulang (barisnya sudah terhapus).
      qc.removeQueries({ queryKey: ["licenses", "detail", id] });
      await qc.invalidateQueries({ queryKey: ["licenses"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Data perizinan dihapus.");
      navigate("/perizinan", { replace: true });
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setDeleting(false);
    },
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }
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
  const title = l.license_number ?? l.application_number;
  const applicantName = l.applicant?.full_name ?? l.summary?.applicant_name;
  const businessName = l.business?.name ?? l.summary?.business_name;

  // Aksi status yang boleh dijalankan role ini (Petugas hanya untuk izin miliknya).
  const actions = (transitions.data ?? []).filter(
    (t) => profile && t.allowed_roles.includes(profile.role) && (profile.role !== "petugas" || perms.isOwner),
  );
  const blockerFor = (t: StatusTransition) =>
    t.to_status === "DITERBITKAN" && (!l.license_number || !l.issue_date)
      ? "Nomor izin dan tanggal terbit belum diisi. Lengkapi melalui tombol Ubah terlebih dahulu."
      : null;

  return (
    <>
      <BackLink to="/perizinan">Kembali ke data perizinan</BackLink>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-all text-xl font-semibold text-navy-900">{title}</h2>
            <StatusBadge status={l.status} label={LICENSE_STATUS_LABEL[l.status]} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {l.license_type?.name ?? l.summary?.license_type_name} · {applicantName ?? "-"}
            {businessName ? ` · ${businessName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {perms.canDelete ? (
            <Button variant="outline" onClick={() => setDeleting(true)} className="text-red-600">
              <Trash2 className="h-4 w-4" aria-hidden /> Hapus
            </Button>
          ) : null}
          {perms.canEdit ? (
            <Button variant="outline" onClick={() => navigate(`/perizinan/${l.id}/ubah`)}>
              <Pencil className="h-4 w-4" aria-hidden /> Ubah
            </Button>
          ) : null}
          {actions.map((t) => (
            <Button
              key={t.to_status}
              variant={DANGER_TARGETS.includes(t.to_status) ? "outline" : "default"}
              className={DANGER_TARGETS.includes(t.to_status) ? "text-red-600" : undefined}
              onClick={() => setAction(t)}
            >
              {ACTION_LABEL[t.to_status]}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Data izin</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  ["No. permohonan", <span className="font-mono">{l.application_number}</span>],
                  ["No. izin", l.license_number ? <span className="font-mono">{l.license_number}</span> : null],
                  ["Jenis izin", l.license_type ? `${l.license_type.name} (${l.license_type.code})` : l.summary?.license_type_name],
                  ["Kecamatan", l.district?.name],
                  ["Tanggal permohonan", formatDate(l.application_date)],
                  ["Tanggal terbit", formatDate(l.issue_date)],
                  ["Berlaku sampai", l.expiry_date ? formatDate(l.expiry_date) : l.issue_date ? "Tanpa batas" : "-"],
                  ["Tahun arsip", l.year],
                  ["Petugas", l.officer_id ? (staff.data?.get(l.officer_id) ?? "-") : "-"],
                  ...(internal
                    ? ([["Kode verifikasi QR", <span className="font-mono tracking-wider">{l.verification_code}</span>]] as [string, React.ReactNode][])
                    : []),
                  ["Catatan", l.notes ? <span className="whitespace-pre-line">{l.notes}</span> : null],
                ]}
              />
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Pemohon</CardTitle>
              </CardHeader>
              <CardContent>
                {l.applicant ? (
                  <DetailList
                    className="sm:grid-cols-1"
                    items={[
                      ["Nama", <Link to={`/pemohon/${l.applicant.id}`} className="font-medium text-accent hover:underline">{l.applicant.full_name}</Link>],
                      ["NIK", l.applicant.nik ? <span className="font-mono">{l.applicant.nik}</span> : null],
                      ["Telepon", l.applicant.phone],
                    ]}
                  />
                ) : (
                  <DetailList className="sm:grid-cols-1" items={[["Nama", applicantName]]} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Perusahaan</CardTitle>
              </CardHeader>
              <CardContent>
                {l.business ? (
                  <DetailList
                    className="sm:grid-cols-1"
                    items={[
                      ["Nama", <Link to={`/perusahaan/${l.business.id}`} className="font-medium text-accent hover:underline">{l.business.name}</Link>],
                      ["NIB", l.nib ? <span className="font-mono">{l.nib}</span> : null],
                      ["Bentuk", l.business.entity_type],
                    ]}
                  />
                ) : businessName ? (
                  <DetailList className="sm:grid-cols-1" items={[["Nama", businessName], ["NIB", l.nib]]} />
                ) : (
                  <p className="text-sm text-muted-foreground">Izin perorangan (tanpa perusahaan).</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          {internal ? <CompletenessCard licenseId={l.id} licenseTypeId={l.license_type_id} /> : null}
          {internal ? <StatusHistoryCard licenseId={l.id} staff={staff.data} /> : null}
        </div>
      </div>

      {action ? (
        <StatusChangeDialog
          licenseId={l.id}
          label={title}
          transition={action}
          blocker={blockerFor(action)}
          onClose={() => setAction(null)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting}
        danger
        busy={remove.isPending}
        title="Hapus data perizinan?"
        message={`${title} akan dihapus dari daftar. Ini hapus lunak: data, dokumen, dan riwayatnya tetap tersimpan dan tercatat di audit log.`}
        confirmLabel="Hapus"
        onConfirm={() => remove.mutate()}
        onClose={() => setDeleting(false)}
      />
    </>
  );
}
