import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LicenseTable } from "./LicenseTable";
import { canCreateLicense } from "./permissions";

export default function LicensesPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canCreate = canCreateLicense(profile);
  const viewer = profile?.role === "viewer";

  const addButton = canCreate ? (
    <Button onClick={() => navigate("/perizinan/baru")}>
      <Plus className="h-4 w-4" aria-hidden /> Tambah perizinan
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="Data Perizinan"
        description={viewer ? "Izin yang sudah diterbitkan, aktif, atau berakhir." : "Seluruh permohonan dan izin beserta statusnya."}
        actions={addButton}
      />
      <LicenseTable tableId="licenses" emptyAction={addButton} />
    </>
  );
}
