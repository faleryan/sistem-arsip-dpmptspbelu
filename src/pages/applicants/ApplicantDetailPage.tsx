import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, UserSquare2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { AuditTrailButton } from "@/components/shared/AuditTrailButton";
import { BackLink, DetailList } from "@/components/shared/DetailList";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/errors";
import { getApplicant, softDeleteApplicant } from "@/services/applicants";
import { formatDateTime } from "@/utils/format";
import { LicenseTable } from "@/pages/licenses/LicenseTable";
import { ApplicantFormModal } from "./ApplicantFormModal";

export default function ApplicantDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const canWrite = hasRole("super_admin", "admin_arsip", "petugas");
  const canDelete = hasRole("super_admin");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const q = useQuery({ queryKey: ["applicants", "detail", id], queryFn: () => getApplicant(id) });

  const remove = useMutation({
    mutationFn: () => softDeleteApplicant(id),
    onSuccess: async () => {
      // Buang cache detail dulu agar tidak dimuat ulang (barisnya sudah terhapus).
      qc.removeQueries({ queryKey: ["applicants", "detail", id] });
      await qc.invalidateQueries({ queryKey: ["applicants"] });
      toast.success("Pemohon dihapus.");
      navigate("/pemohon", { replace: true });
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setDeleting(false);
    },
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <>
        <BackLink to="/pemohon">Kembali ke daftar pemohon</BackLink>
        <EmptyState icon={UserSquare2} title="Pemohon tidak ditemukan" description={errorMessage(q.error)} />
      </>
    );
  }
  const a = q.data;

  return (
    <>
      <BackLink to="/pemohon">Kembali ke daftar pemohon</BackLink>
      <PageHeader
        title={a.full_name}
        description="Detail pemohon"
        actions={
          <>
            <AuditTrailButton recordId={a.id} />
            {canDelete ? (
              <Button variant="outline" onClick={() => setDeleting(true)} className="text-red-600">
                <Trash2 className="h-4 w-4" aria-hidden /> Hapus
              </Button>
            ) : null}
            {canWrite ? (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" aria-hidden /> Ubah
              </Button>
            ) : null}
          </>
        }
      />
      <Card>
        <CardContent className="pt-5">
          <DetailList
            items={[
              ["NIK", a.nik ? <span className="font-mono">{a.nik}</span> : null],
              ["NPWP", a.npwp ? <span className="font-mono">{a.npwp}</span> : null],
              ["Telepon", a.phone],
              ["Email", a.email],
              ["Kecamatan", a.district?.name],
              ["Desa/Kelurahan", a.village?.name],
              ["Alamat", a.address],
              ["Terakhir diubah", formatDateTime(a.updated_at)],
            ]}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Perizinan milik pemohon</CardTitle>
          {canWrite ? (
            <Button size="sm" onClick={() => navigate(`/perizinan/baru?pemohon=${a.id}`)}>
              <Plus className="h-4 w-4" aria-hidden /> Izin baru
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <LicenseTable tableId="applicant-licenses" base={{ applicant: a.id }} urlSync={false} showFilters={false} hideColumns={["applicant", "nik"]} />
        </CardContent>
      </Card>

      {editing ? <ApplicantFormModal applicant={a} onClose={() => setEditing(false)} /> : null}
      <ConfirmDialog
        open={deleting}
        danger
        busy={remove.isPending}
        title="Hapus pemohon?"
        message={`"${a.full_name}" akan dihapus dari daftar. Ini hapus lunak: data tetap tersimpan dan dapat dipulihkan dari menu Data Terhapus. Data izin yang sudah ada tidak terhapus.`}
        confirmLabel="Hapus"
        onConfirm={() => remove.mutate()}
        onClose={() => setDeleting(false)}
      />
    </>
  );
}
