// Edge Function: admin-create-user
//
// Satu-satunya jalur pembuatan akun SIPAR-BELU. Hanya Super Admin yang boleh memanggil.
// Service role key hanya ada di sini (secret server Supabase) — TIDAK PERNAH di frontend.
//
// Aksi (body JSON):
//   { action: "create", email, password, full_name, role, nip?, phone?, unit_id? }
//   { action: "reset_password", user_id, password }
//
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY disediakan otomatis oleh Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";

const ROLES = ["super_admin", "admin_arsip", "petugas", "verifikator", "pimpinan", "viewer"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const str = (v: unknown, max = 200) =>
  typeof v === "string" && v.trim() !== "" && v.length <= max ? v.trim() : null;

function validPassword(p: unknown): p is string {
  return typeof p === "string" && p.length >= 10 && p.length <= 72;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Metode tidak didukung." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Konfigurasi server belum lengkap." }, 500);

  // 1) Identifikasi pemanggil dari JWT-nya.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Tidak terautentikasi." }, 401);
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Sesi tidak valid." }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  // 2) Pemanggil harus Super Admin aktif (dicek di database, bukan dari klaim JWT).
  const { data: me } = await admin
    .from("profiles").select("role, is_active").eq("id", userData.user.id).maybeSingle();
  if (!me || !me.is_active || me.role !== "super_admin") {
    return json({ error: "Hanya Super Admin yang dapat mengelola akun." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body bukan JSON yang valid." }, 400);
  }

  // ── reset_password ────────────────────────────────────────────────────────
  if (body.action === "reset_password") {
    const userId = typeof body.user_id === "string" && UUID_RE.test(body.user_id) ? body.user_id : null;
    if (!userId) return json({ error: "user_id tidak valid." }, 400);
    if (!validPassword(body.password)) return json({ error: "Kata sandi minimal 10 karakter." }, 400);
    const { error } = await admin.auth.admin.updateUserById(userId, { password: body.password });
    if (error) return json({ error: "Gagal mengubah kata sandi." }, 400);
    return json({ ok: true });
  }

  // ── create ────────────────────────────────────────────────────────────────
  if (body.action !== "create") return json({ error: "Aksi tidak dikenal." }, 400);

  const email = str(body.email, 254)?.toLowerCase() ?? null;
  const fullName = str(body.full_name, 120);
  const role = typeof body.role === "string" && (ROLES as readonly string[]).includes(body.role) ? body.role : null;
  const nip = body.nip == null || body.nip === "" ? null : str(body.nip, 40);
  const phone = body.phone == null || body.phone === "" ? null : str(body.phone, 30);
  const unitId = body.unit_id == null || body.unit_id === ""
    ? null : (typeof body.unit_id === "string" && UUID_RE.test(body.unit_id) ? body.unit_id : undefined);

  if (!email || !EMAIL_RE.test(email)) return json({ error: "Email tidak valid." }, 400);
  if (!fullName) return json({ error: "Nama lengkap wajib diisi." }, 400);
  if (!role) return json({ error: "Role tidak valid." }, 400);
  if (!validPassword(body.password)) return json({ error: "Kata sandi minimal 10 karakter." }, 400);
  if (unitId === undefined) return json({ error: "Unit tidak valid." }, 400);
  if (body.nip != null && body.nip !== "" && nip === null) return json({ error: "NIP tidak valid." }, 400);
  if (body.phone != null && body.phone !== "" && phone === null) return json({ error: "Nomor telepon tidak valid." }, 400);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) {
    const dup = /already|registered|exists/i.test(createErr?.message ?? "");
    return json({ error: dup ? "Email sudah terdaftar." : "Gagal membuat akun." }, dup ? 409 : 400);
  }

  const { error: profErr } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: fullName,
    role,
    email,
    nip,
    phone,
    unit_id: unitId,
    is_active: true,
  });
  if (profErr) {
    // Jangan tinggalkan akun login tanpa profil.
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "Gagal menyimpan profil pengguna." }, 500);
  }

  return json({ ok: true, user: { id: created.user.id, email, full_name: fullName, role } }, 201);
});
