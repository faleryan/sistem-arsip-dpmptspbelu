import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/types/domain";

export type UserRow = {
  id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  is_active: boolean;
  nip: string | null;
  phone: string | null;
  unit_id: string | null;
  created_at: string;
};

export type Unit = { id: string; name: string };

export type RolePermissionMatrix = {
  roles: { code: string; label: string }[];
  permissions: { code: string; module: string; label: string }[];
  granted: Set<string>; // "role|permission"
};

export type CreateUserInput = {
  email: string;
  password: string;
  full_name: string;
  role: AppRole;
  nip?: string;
  phone?: string;
  unit_id?: string;
};

export type UpdateUserInput = Partial<Pick<UserRow, "full_name" | "role" | "is_active" | "nip" | "phone" | "unit_id">>;

/** Ambil pesan galat dari respons Edge Function (body JSON {error}). */
async function functionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: unknown };
      if (typeof body.error === "string") return body.error;
    } catch {
      /* abaikan */
    }
  }
  return "Terjadi kesalahan. Coba lagi.";
}

export async function listUsers(): Promise<UserRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active, nip, phone, unit_id, created_at")
    .order("full_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as UserRow[];
}

export async function listUnits(): Promise<Unit[]> {
  const { data, error } = await supabase.from("units").select("id, name").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Unit[];
}

export async function updateUser(id: string, patch: UpdateUserInput): Promise<void> {
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  // Pesan dari trigger database (mis. Super Admin terakhir) sudah berbahasa Indonesia.
  if (error) throw new Error(error.message);
}

export async function createUser(input: CreateUserInput): Promise<void> {
  const { error } = await supabase.functions.invoke("admin-create-user", {
    body: { action: "create", ...input },
  });
  if (error) throw new Error(await functionError(error));
}

export async function resetUserPassword(userId: string, password: string): Promise<void> {
  const { error } = await supabase.functions.invoke("admin-create-user", {
    body: { action: "reset_password", user_id: userId, password },
  });
  if (error) throw new Error(await functionError(error));
}

export async function fetchRoleMatrix(): Promise<RolePermissionMatrix> {
  const [roles, perms, rp] = await Promise.all([
    supabase.from("roles").select("code, label"),
    supabase.from("permissions").select("code, module, label").order("module").order("code"),
    supabase.from("role_permissions").select("role_code, permission_code"),
  ]);
  const err = roles.error ?? perms.error ?? rp.error;
  if (err) throw new Error(err.message);
  const order = ["super_admin", "admin_arsip", "petugas", "verifikator", "pimpinan", "viewer"];
  const roleList = ((roles.data ?? []) as { code: string; label: string }[]).sort(
    (a, b) => order.indexOf(a.code) - order.indexOf(b.code),
  );
  return {
    roles: roleList,
    permissions: (perms.data ?? []) as { code: string; module: string; label: string }[],
    granted: new Set(
      ((rp.data ?? []) as { role_code: string; permission_code: string }[]).map(
        (r) => `${r.role_code}|${r.permission_code}`,
      ),
    ),
  };
}

/** Kata sandi acak 14 karakter (tanpa karakter yang mudah tertukar). */
export function generatePassword(length = 14): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}
