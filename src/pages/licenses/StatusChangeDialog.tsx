import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/shared/Modal";
import { Field, FormAlert } from "@/components/shared/Field";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { changeLicenseStatus } from "@/services/licenses";
import { LICENSE_STATUS_LABEL, type LicenseStatus, type StatusTransition } from "@/types/entities";
import { ACTION_HINT, ACTION_LABEL, DANGER_TARGETS } from "./status";

export function StatusChangeDialog({
  licenseId,
  label,
  transition,
  blocker,
  onClose,
}: {
  licenseId: string;
  label: string;
  transition: StatusTransition;
  /** Pesan bila prasyarat di sisi klien belum terpenuhi (mis. nomor izin kosong). */
  blocker?: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const to = transition.to_status as LicenseStatus;
  const danger = DANGER_TARGETS.includes(to);

  const run = useMutation({
    mutationFn: () => changeLicenseStatus(licenseId, to, note.trim() || null),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["licenses"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      toast.success(`Status diubah menjadi ${LICENSE_STATUS_LABEL[to]}.`);
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  function submit() {
    setError(null);
    if (transition.requires_note && !note.trim()) {
      setError("Catatan/alasan wajib diisi untuk perubahan status ini.");
      return;
    }
    run.mutate();
  }

  return (
    <Modal
      open
      onClose={run.isPending ? () => undefined : onClose}
      title={`${ACTION_LABEL[to]} — ${label}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={run.isPending}>
            Batal
          </Button>
          <Button variant={danger ? "danger" : "default"} onClick={submit} disabled={run.isPending || !!blocker}>
            {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {ACTION_LABEL[to]}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <StatusBadge status={transition.from_status} label={LICENSE_STATUS_LABEL[transition.from_status]} />
          <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          <StatusBadge status={to} label={LICENSE_STATUS_LABEL[to]} />
        </div>
        {ACTION_HINT[to] ? <p className="text-sm text-muted-foreground">{ACTION_HINT[to]}</p> : null}
        {blocker ? (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {blocker}
          </div>
        ) : null}
        <FormAlert message={error} />
        <Field label={transition.requires_note ? "Catatan/alasan" : "Catatan (opsional)"} required={transition.requires_note}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
        </Field>
      </div>
    </Modal>
  );
}
