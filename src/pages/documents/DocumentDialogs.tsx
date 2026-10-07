import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { errorMessage } from "@/lib/errors";
import { softDeleteDocument } from "@/services/documents";
import type { DocumentRow } from "@/types/entities";
import { DocumentMetaDialog } from "./DocumentMetaDialog";
import { DocumentPreviewDialog } from "./DocumentPreviewDialog";
import { UploadDocumentDialog, type UploadMode, type UploadTarget } from "./UploadDocumentDialog";

/** Dialog dokumen yang sedang terbuka (satu pada satu waktu). */
export type DocDialog =
  | { kind: "upload"; target: UploadTarget; mode: UploadMode }
  | { kind: "preview"; doc: DocumentRow }
  | { kind: "meta"; doc: DocumentRow }
  | { kind: "delete"; doc: DocumentRow }
  | null;

export function DocumentDialogs({ dialog, onClose }: { dialog: DocDialog; onClose: () => void }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => softDeleteDocument(id),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["documents"] }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
      toast.success("Dokumen dihapus dari arsip.");
      onClose();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      onClose();
    },
  });

  if (!dialog) return null;
  switch (dialog.kind) {
    case "upload":
      return <UploadDocumentDialog target={dialog.target} mode={dialog.mode} onClose={onClose} />;
    case "preview":
      return <DocumentPreviewDialog doc={dialog.doc} onClose={onClose} />;
    case "meta":
      return <DocumentMetaDialog doc={dialog.doc} onClose={onClose} />;
    case "delete":
      return (
        <ConfirmDialog
          open
          danger
          busy={remove.isPending}
          title="Hapus dokumen?"
          message={`"${dialog.doc.title}" akan dihapus dari daftar arsip. Ini hapus lunak: file dan seluruh versinya tetap tersimpan dan tercatat di audit log.`}
          confirmLabel="Hapus"
          onConfirm={() => remove.mutate(dialog.doc.id)}
          onClose={onClose}
        />
      );
  }
}
