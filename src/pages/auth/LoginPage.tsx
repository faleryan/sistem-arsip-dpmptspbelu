import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { setRememberSession } from "@/lib/supabase";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_FULL_NAME, APP_NAME, AGENCY_NAME } from "@/types/domain";

const schema = z.object({
  email: z.string().trim().email("Format email tidak valid."),
  password: z.string().min(1, "Kata sandi wajib diisi."),
});

export default function LoginPage() {
  const { signIn, accessError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Data tidak valid.");
      return;
    }
    setSubmitting(true);
    // "Ingat sesi": bila tidak dicentang, sesi hanya disimpan selama tab terbuka.
    setRememberSession(remember);
    const { error: err } = await signIn(parsed.data.email, parsed.data.password);
    if (err) setError(err);
    setSubmitting(false);
  }

  const message = error ?? accessError;

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-navy-900">Masuk</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {APP_NAME} · {APP_FULL_NAME}
      </p>
      <p className="text-xs text-muted-foreground">{AGENCY_NAME}</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        {message ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {message}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="nama@instansi.go.id"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Kata sandi</Label>
          <div className="relative">
            <Input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            >
              {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border"
            />
            Ingat sesi saya
          </label>
          <Link to="/lupa-password" className="text-sm font-medium text-accent hover:underline">
            Lupa kata sandi?
          </Link>
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Masuk
        </Button>
      </form>
    </AuthLayout>
  );
}
