import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus, Power, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { listUnits, listUsers, updateUser, type UserRow } from "@/services/users";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/types/domain";
import { UserFormModal } from "./UserFormModal";
import { ResetPasswordModal } from "./ResetPasswordModal";
import { RoleMatrix } from "./RoleMatrix";

type Tab = "users" | "roles";

export default function UsersPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("users");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<{ mode: "create" | "edit"; user?: UserRow } | null>(null);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [toggleFor, setToggleFor] = useState<UserRow | null>(null);

  const users = useQuery({ queryKey: ["users"], queryFn: listUsers });
  const units = useQuery({ queryKey: ["units"], queryFn: listUnits });

  const unitName = useMemo(() => new Map((units.data ?? []).map((u) => [u.id, u.name])), [units.data]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return users.data ?? [];
    return (users.data ?? []).filter((u) =>
      [u.full_name, u.email ?? "", ROLE_LABEL[u.role], u.nip ?? ""].some((v) => v.toLowerCase().includes(s)),
    );
  }, [users.data, search]);

  const toggle = useMutation({
    mutationFn: (u: UserRow) => updateUser(u.id, { is_active: !u.is_active }),
    onSuccess: async (_d, u) => {
      await qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(u.is_active ? "Pengguna dinonaktifkan." : "Pengguna diaktifkan.");
      setToggleFor(null);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Gagal mengubah status.");
      setToggleFor(null);
    },
  });

  return (
    <>
      <PageHeader
        title="Pengguna & Role"
        description="Akun dibuat oleh Super Admin. Tidak ada pendaftaran mandiri."
        actions={
          tab === "users" ? (
            <Button variant="accent" onClick={() => setForm({ mode: "create" })}>
              <Plus className="h-4 w-4" aria-hidden /> Tambah pengguna
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 inline-flex rounded-lg border bg-white p-1" role="tablist">
        {(
          [
            ["users", "Pengguna"],
            ["roles", "Hak akses role"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium",
              tab === key ? "bg-navy-800 text-white" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "roles" ? (
        <RoleMatrix />
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, email, role, NIP…"
              className="pl-9"
              aria-label="Cari pengguna"
            />
          </div>

          {users.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : users.isError ? (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Daftar pengguna belum dapat dimuat. Pastikan migrasi database sudah dijalankan.
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Users} title="Tidak ada pengguna" description="Ubah kata kunci pencarian atau tambahkan pengguna baru." />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Nama</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Unit/Bidang</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const isSelf = u.id === profile?.id;
                    return (
                      <tr key={u.id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {u.full_name} {isSelf ? <span className="text-xs font-normal text-muted-foreground">(Anda)</span> : null}
                          </div>
                          <div className="text-xs text-muted-foreground">{u.email ?? "-"}</div>
                        </td>
                        <td className="px-4 py-3">{ROLE_LABEL[u.role]}</td>
                        <td className="px-4 py-3 text-muted-foreground">{(u.unit_id && unitName.get(u.unit_id)) || "-"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                              u.is_active
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                : "bg-slate-100 text-slate-600 ring-slate-200",
                            )}
                          >
                            {u.is_active ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" aria-label={`Ubah ${u.full_name}`} onClick={() => setForm({ mode: "edit", user: u })}>
                              <Pencil className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label={`Atur ulang kata sandi ${u.full_name}`} onClick={() => setResetFor(u)}>
                              <KeyRound className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isSelf}
                              aria-label={u.is_active ? `Nonaktifkan ${u.full_name}` : `Aktifkan ${u.full_name}`}
                              title={isSelf ? "Anda tidak dapat menonaktifkan akun sendiri" : undefined}
                              onClick={() => setToggleFor(u)}
                            >
                              <Power className={cn("h-4 w-4", u.is_active ? "text-red-600" : "text-emerald-600")} aria-hidden />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {form ? (
        <UserFormModal
          mode={form.mode}
          user={form.user}
          units={units.data ?? []}
          isSelf={form.user?.id === profile?.id}
          onClose={() => setForm(null)}
        />
      ) : null}
      {resetFor ? <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} /> : null}
      <ConfirmDialog
        open={toggleFor !== null}
        title={toggleFor?.is_active ? "Nonaktifkan pengguna?" : "Aktifkan pengguna?"}
        message={
          toggleFor?.is_active
            ? `${toggleFor.full_name} tidak akan dapat mengakses aplikasi sampai diaktifkan kembali. Data dan riwayatnya tetap tersimpan.`
            : `${toggleFor?.full_name ?? ""} akan dapat masuk kembali ke aplikasi.`
        }
        danger={toggleFor?.is_active}
        confirmLabel={toggleFor?.is_active ? "Nonaktifkan" : "Aktifkan"}
        busy={toggle.isPending}
        onConfirm={() => toggleFor && toggle.mutate(toggleFor)}
        onClose={() => setToggleFor(null)}
      />
    </>
  );
}
