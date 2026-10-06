import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/layouts/AuthLayout";
import { FullPageSpinner } from "@/components/shared/FullPageSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z
  .object({
    password: z.string().min(10, "Kata sandi minimal 10 karakter."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Konfirmasi kata sandi tidak sama.",
    path: ["confirm"],
  });

/** Halaman tujuan tautan email pemulihan; sesi pemulihan dibuat otomatis oleh Supabase. */
export default function ResetPasswordPage() {
  const { session, loading, updatePassword, signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <FullPageSpinner />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ password, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Data tidak valid.");
      return;
    }
    setSubmitting(true);
    const { error: err } = await updatePassword(parsed.data.password);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    toast.success("Kata sandi berhasil diubah. Silakan masuk kembali.");
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-navy-900">Atur kata sandi baru</h1>
      {!session ? (
        <p role="alert" className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Tautan pemulihan tidak valid atau sudah kedaluwarsa. Minta tautan baru dari halaman “Lupa kata sandi”.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          {error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="password">Kata sandi baru</Label>
            <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Ulangi kata sandi</Label>
            <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Simpan kata sandi
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
