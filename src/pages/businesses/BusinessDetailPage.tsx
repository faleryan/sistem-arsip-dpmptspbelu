import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { getBusiness, softDeleteBusiness } from "@/services/businesses";
import { formatDateTime } from "@/utils/format";
import { LicenseTable } from "@/pages/licenses/LicenseTable";
import { BusinessFormModal } from "./BusinessFormModal";

export default function BusinessDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const canWrite = hasRole("super_admin", "admin_arsip", "petugas");
  const canDelete = hasRole("super_admin");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const q = useQuery({ queryKey: ["businesses", "detail", id], queryFn: () => getBusiness(id) });

  const remove = useMutation({
    mutationFn: () => softDeleteBusiness(id),
    onSuccess: async () => {
      // Buang cache detail dulu agar tidak dimuat ulang (barisnya sudah terhapus).
      qc.removeQueries({ queryKey: ["businesses", "detail", id] });
      await qc.invalidateQueries({ queryKey: ["businesses"] });
      toast.success("Perusahaan dihapus.");
      navigate("/perusahaan", { replace: true });
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
        <BackLink to="/perusahaan">Kembali ke daftar perusahaan</BackLink>
        <EmptyState icon={Building2} title="Perusahaan tidak ditemukan" description={errorMessage(q.error)} />
      </>
    );
  }
  const b = q.data;

  return (
    <>
      <BackLink to="/perusahaan">Kembali ke daftar perusahaan</BackLink>
      <PageHeader
        title={b.name}
        description={b.entity_type ? `Detail perusahaan · ${b.entity_type}` : "Detail perusahaan"}
        actions={
          <>
            <AuditTrailButton recordId={b.id} />
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
              ["NIB", b.nib ? <span className="font-mono">{b.nib}</span> : null],
              ["NPWP", b.npwp ? <span className="font-mono">{b.npwp}</span> : null],
              ["Penanggung jawab", b.person_in_charge],
              ["Telepon", b.phone],
              ["Email", b.email],
              ["Kecamatan", b.district?.name],
              ["Desa/Kelurahan", b.village?.name],
              ["Alamat", b.address],
              ["Terakhir diubah", formatDateTime(b.updated_at)],
            ]}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Perizinan perusahaan</CardTitle>
          {canWrite ? (
            <Button size="sm" onClick={() => navigate(`/perizinan/baru?perusahaan=${b.id}`)}>
              <Plus className="h-4 w-4" aria-hidden /> Izin baru
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <LicenseTable tableId="business-licenses" base={{ business: b.id }} urlSync={false} showFilters={false} hideColumns={["business", "nib"]} />
        </CardContent>
      </Card>

      {editing ? <BusinessFormModal business={b} onClose={() => setEditing(false)} /> : null}
      <ConfirmDialog
        open={deleting}
        danger
        busy={remove.isPending}
        title="Hapus perusahaan?"
        message={`"${b.name}" akan dihapus dari daftar. Ini hapus lunak: data tetap tersimpan dan dapat dipulihkan dari menu Data Terhapus. Data izin yang sudah ada tidak terhapus.`}
        confirmLabel="Hapus"
        onConfirm={() => remove.mutate()}
        onClose={() => setDeleting(false)}
      />
    </>
  );
}
