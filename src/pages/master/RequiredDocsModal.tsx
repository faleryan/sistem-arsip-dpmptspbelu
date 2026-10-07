import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/shared/Modal";
import { FormAlert } from "@/components/shared/Field";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTypes, REF_KEY } from "@/hooks/useReference";
import { errorMessage } from "@/lib/errors";
import { listRequiredDocs, saveRequiredDocs } from "@/services/reference";

/** Atur dokumen wajib per jenis izin (tabel license_type_documents). */
export function RequiredDocsModal({
  licenseType,
  readOnly,
  onClose,
}: {
  licenseType: { id: string; name: string };
  readOnly: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const docTypes = useDocumentTypes();
  const current = useQuery({
    queryKey: [...REF_KEY, "required_docs", licenseType.id],
    queryFn: () => listRequiredDocs(licenseType.id),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (current.data) setSelected(new Set(current.data));
  }, [current.data]);

  const save = useMutation({
    mutationFn: () => saveRequiredDocs(licenseType.id, [...selected]),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: REF_KEY });
      toast.success("Dokumen wajib disimpan.");
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const loading = docTypes.isLoading || current.isLoading;
  const list = (docTypes.data ?? []).filter((d) => d.is_active || selected.has(d.id));

  return (
    <Modal
      open
      onClose={save.isPending ? () => undefined : onClose}
      title={`Dokumen wajib — ${licenseType.name}`}
      footer={
        readOnly ? (
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={save.isPending}>
              Batal
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || loading}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Simpan
            </Button>
          </>
        )
      }
    >
      <div className="space-y-3">
        <FormAlert message={error ?? (current.isError ? errorMessage(current.error) : null)} />
        <p className="text-sm text-muted-foreground">
          Izin dengan jenis ini baru dapat <strong>Disetujui</strong> bila semua dokumen yang dicentang sudah terverifikasi.
        </p>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <ul className="divide-y rounded-lg border">
            {list.map((d) => (
              <li key={d.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-navy-800"
                    disabled={readOnly}
                    checked={selected.has(d.id)}
                    onChange={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (n.has(d.id)) n.delete(d.id);
                        else n.add(d.id);
                        return n;
                      })
                    }
                  />
                  <span className="flex-1">{d.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{d.code}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
