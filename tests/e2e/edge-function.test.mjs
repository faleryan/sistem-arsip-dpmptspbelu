// Uji Edge Function admin-create-user (Deno) terhadap gateway lokal: hak pemanggil, pembuatan akun,
// profil lewat service_role (melewati trigger penjaga profil), audit atas nama pemanggil, reset sandi, CORS.
// Prasyarat: stack uji berjalan; `deno` tersedia (DENO=/path/ke/deno). Pemakaian: node edge-function.test.mjs
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import pg from "pg";

const SECRET = "sipar-local-test-secret-0123456789abcdef";
const GW = "http://127.0.0.1:54321";
const FN = "http://127.0.0.1:8000"; // port bawaan Deno.serve
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (role) => {
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ role, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
};

const proc = spawn(process.env.DENO || "deno", ["run", "--allow-net", "--allow-env", "--allow-read",
  new URL("../../supabase/functions/admin-create-user/index.ts", import.meta.url).pathname], {
  env: {
    ...process.env, SUPABASE_URL: GW, SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: jwt("service_role"), ALLOWED_ORIGINS: "http://localhost:4174",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
proc.stdout.on("data", (d) => (log += d));
proc.stderr.on("data", (d) => (log += d));
for (let i = 0; i < 120 && !/Listening/i.test(log); i++) await new Promise((r) => setTimeout(r, 500));
if (!/Listening/i.test(log)) { console.log(log); proc.kill(); process.exit(2); }

const db = new pg.Pool({ host: process.env.PGHOST || "/tmp", port: Number(process.env.PGPORT || 54329), user: "postgres", database: "sipar", max: 1 });
const login = async (email, password = "SiparBelu#Uji2026") => {
  const r = await fetch(`${GW}/auth/v1/token?grant_type=password`, { method: "POST", body: JSON.stringify({ email, password }) });
  return r.ok ? (await r.json()).access_token : null;
};
const call = (token, body, origin = "http://localhost:4174") =>
  fetch(FN, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin }, body: JSON.stringify(body) });

let pass = 0;
const fails = [];
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); } catch (e) { fails.push(name); console.log(`  ✗ ${name}\n      ${e.message}`); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };

const sa = await login("superadmin@example.com");
const pt = await login("petugas@example.com");
const email = `baru-${Date.now()}@example.org`;
let newId = "";
console.log("Edge Function admin-create-user");

await t("menolak tanpa sesi, dan menolak selain Super Admin", async () => {
  ok((await fetch(FN, { method: "POST", body: "{}" })).status === 401, "tanpa sesi");
  const r = await call(pt, { action: "create", email, password: "KataSandi#12345", full_name: "X", role: "super_admin" });
  ok(r.status === 403, `petugas: ${r.status}`);
});

await t("Super Admin membuat akun; profil tersimpan lewat service_role; audit atas nama pemanggil", async () => {
  const r = await call(sa, { action: "create", email, password: "KataSandi#12345", full_name: "Pegawai Baru", role: "verifikator" });
  const body = await r.json();
  ok(r.status === 201, `${r.status} ${JSON.stringify(body)}`);
  newId = body.user.id;
  const p = (await db.query("select role, is_active, email from public.profiles where id = $1", [newId])).rows[0];
  ok(p?.role === "verifikator" && p.is_active && p.email === email, JSON.stringify(p));
  const a = (await db.query("select user_id, user_role, action from public.audit_logs where record_id = $1 and action = 'CREATE' and user_id is not null", [newId])).rows;
  ok(a.length === 1 && a[0].user_id === "11111111-1111-1111-1111-111111111101" && a[0].user_role === "super_admin", JSON.stringify(a));
  ok(await login(email, "KataSandi#12345"), "akun baru tidak dapat masuk");
});

await t("email ganda, role tak dikenal, dan sandi > 72 byte ditolak", async () => {
  ok((await call(sa, { action: "create", email, password: "KataSandi#12345", full_name: "X", role: "viewer" })).status === 409, "ganda");
  ok((await call(sa, { action: "create", email: "x@example.org", password: "KataSandi#12345", full_name: "X", role: "root" })).status === 400, "role");
  ok((await call(sa, { action: "create", email: "y@example.org", password: "é".repeat(40), full_name: "X", role: "viewer" })).status === 400, "72 byte");
});

await t("reset kata sandi: hanya akun ber-profil; tercatat di audit; sandi baru berlaku", async () => {
  ok((await call(sa, { action: "reset_password", user_id: crypto.randomUUID(), password: "SandiBaru#2026x" })).status === 404, "tanpa profil");
  const r = await call(sa, { action: "reset_password", user_id: newId, password: "SandiBaru#2026x" });
  ok(r.status === 200, `${r.status}`);
  const a = (await db.query("select count(*)::int c from public.audit_logs where record_id = $1 and action = 'RESET_PASSWORD'", [newId])).rows[0].c;
  ok(a === 1, `audit ${a}`);
  ok(await login(email, "SandiBaru#2026x"), "sandi baru tidak berlaku");
});

await t("profil tidak dapat dibuat/dihapus langsung oleh pengguna, termasuk Super Admin lewat API", async () => {
  const ins = await fetch(`${GW}/rest/v1/profiles`, {
    method: "POST", headers: { authorization: `Bearer ${sa}`, "content-type": "application/json" },
    body: JSON.stringify({ id: crypto.randomUUID(), full_name: "x", role: "viewer" }),
  });
  ok(ins.status === 401 || ins.status === 403, `insert ${ins.status}`);
  const vw = await login("viewer@example.com");
  const del = await fetch(`${GW}/rest/v1/v_staff?id=eq.11111111-1111-1111-1111-111111111106`, { method: "DELETE", headers: { authorization: `Bearer ${vw}` } });
  ok(del.status === 401 || del.status === 403, `delete v_staff ${del.status}`);
  const post = await fetch(`${GW}/rest/v1/v_staff`, {
    method: "POST", headers: { authorization: `Bearer ${vw}`, "content-type": "application/json" },
    body: JSON.stringify({ id: crypto.randomUUID(), full_name: "x", role: "super_admin" }),
  });
  ok(post.status === 401 || post.status === 403, `insert v_staff ${post.status}`);
});

await t("CORS: origin terdaftar dipantulkan, origin lain tidak", async () => {
  const a = await fetch(FN, { method: "OPTIONS", headers: { origin: "http://localhost:4174" } });
  ok(a.headers.get("access-control-allow-origin") === "http://localhost:4174", "terdaftar");
  const b = await fetch(FN, { method: "OPTIONS", headers: { origin: "https://jahat.example" } });
  ok(b.headers.get("access-control-allow-origin") !== "https://jahat.example", "origin asing diterima");
});

proc.kill();
await db.end();
console.log(`\n${pass} lulus, ${fails.length} gagal`);
process.exit(fails.length ? 1 : 0);
