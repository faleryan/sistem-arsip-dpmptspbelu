import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generatePassword, resetUserPassword, type UserRow } from "@/services/users";

export function ResetPasswordModal({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: () => resetUserPassword(user.id, password),
    onSuccess: () => {
      toast.success(`Kata sandi ${user.full_name} berhasil diatur ulang.`);
      onClose();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Terjadi kesalahan."),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10) {
      setError("Kata sandi minimal 10 karakter.");
      return;
    }
    setError(null);
    reset.mutate();
  }

  return (
    <Modal
      open
      onClose={reset.isPending ? () => undefined : onClose}
      title={`Atur ulang kata sandi — ${user.full_name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={reset.isPending}>
            Batal
          </Button>
          <Button type="submit" form="reset-form" disabled={reset.isPending}>
            {reset.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Simpan
          </Button>
        </>
      }
    >
      <form id="reset-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="r-pass">Kata sandi baru</Label>
          <div className="flex gap-2">
            <Input
              id="r-pass"
              type="text"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="button" variant="outline" className="shrink-0" onClick={() => setPassword(generatePassword())}>
              <Wand2 className="h-4 w-4" aria-hidden /> Buat otomatis
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Salin dan sampaikan ke pengguna lewat jalur aman. Kata sandi tidak disimpan di aplikasi.
          </p>
        </div>
      </form>
    </Modal>
  );
}
