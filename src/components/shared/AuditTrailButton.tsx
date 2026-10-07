import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

/** Tautan ke Audit Log yang disaring untuk satu data. Hanya untuk role yang boleh membaca audit. */
export function AuditTrailButton({ recordId }: { recordId: string }) {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  if (!hasRole("super_admin", "admin_arsip", "pimpinan")) return null;
  return (
    <Button variant="ghost" onClick={() => navigate(`/audit?f_record=${encodeURIComponent(recordId)}`)}>
      <ShieldCheck className="h-4 w-4" aria-hidden /> Jejak audit
    </Button>
  );
}
