import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createUser, generatePassword, updateUser, type Unit, type UserRow } from "@/services/users";
import { APP_ROLES, ROLE_LABEL, type AppRole } from "@/types/domain";

const base = {
  full_name: z.string().trim().min(2, "Nama lengkap wajib diisi.").max(120),
  role: z.enum(APP_ROLES),
  nip: z.string().trim().max(40).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{6,20}$/, "Nomor telepon tidak valid.")
    .optional()
    .or(z.literal("")),
  unit_id: z.string().optional(),
};
const createSchema = z.object({
  ...base,
  email: z.string().trim().email("Format email tidak valid."),
  password: z.string().min(10, "Kata sandi minimal 10 karakter.").max(72),
});
const editSchema = z.object(base);

type Props = {
  mode: "create" | "edit";
  user?: UserRow;
  units: Unit[];
  isSelf?: boolean;
  onClose: () => void;
};

export function UserFormModal({ mode, user, units, isSelf = false, onClose }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    email: user?.email ?? "",
    password: "",
    full_name: user?.full_name ?? "",
    role: (user?.role ?? "petugas") as AppRole,
    nip: user?.nip ?? "",
    phone: user?.phone ?? "",
    unit_id: user?.unit_id ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => setError(null), [form]);

  const save = useMutation({
    mutationFn: async () => {
      if (mode === "create") {
        const parsed = createSchema.parse(form);
        await createUser({
          email: parsed.email,
          password: parsed.password,
          full_name: parsed.full_name,
          role: parsed.role,
          nip: parsed.nip || undefined,
          phone: parsed.phone || undefined,
          unit_id: parsed.unit_id || undefined,
        });
      } else if (user) {
        const parsed = editSchema.parse(form);
        await updateUser(user.id, {
          full_name: parsed.full_name,
          role: parsed.role,
          nip: parsed.nip || null,
          phone: parsed.phone || null,
          unit_id: parsed.unit_id || null,
        });
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(mode === "create" ? "Pengguna berhasil dibuat." : "Perubahan disimpan.");
      onClose();
    },
    onError: (e: unknown) => {
      if (e instanceof z.ZodError) setError(e.issues[0]?.message ?? "Data tidak valid.");
      else setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal
      open
      onClose={save.isPending ? () => undefined : onClose}
      title={mode === "create" ? "Tambah pengguna" : "Ubah pengguna"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Batal
          </Button>
          <Button type="submit" form="user-form" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Simpan
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="u-name">Nama lengkap</Label>
          <Input id="u-name" value={form.full_name} onChange={set("full_name")} required />
        </div>

        {mode === "create" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input id="u-email" type="email" value={form.email} onChange={set("email")} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-pass">Kata sandi awal</Label>
              <div className="flex gap-2">
                <Input
                  id="u-pass"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={set("password")}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    setForm((f) => ({ ...f, password: generatePassword() }));
                    setShowPassword(true);
                  }}
                >
                  <Wand2 className="h-4 w-4" aria-hidden /> Buat otomatis
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Minimal 10 karakter. Sampaikan ke pengguna lewat jalur aman; mereka dapat menggantinya lewat “Lupa kata sandi”.
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email ?? "-"} disabled />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="u-role">Role</Label>
            <Select id="u-role" value={form.role} onChange={set("role")} disabled={isSelf}>
              {APP_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
            {isSelf ? <p className="text-xs text-muted-foreground">Anda tidak dapat mengubah role sendiri.</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-unit">Unit/Bidang</Label>
            <Select id="u-unit" value={form.unit_id} onChange={set("unit_id")}>
              <option value="">— Tidak ada —</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="u-nip">NIP (opsional)</Label>
            <Input id="u-nip" value={form.nip} onChange={set("nip")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-phone">Telepon (opsional)</Label>
            <Input id="u-phone" value={form.phone} onChange={set("phone")} inputMode="tel" />
          </div>
        </div>
      </form>
    </Modal>
  );
}
