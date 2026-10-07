// Uji alat cadangan & pemulihan file (tools/backup/*.mjs) terhadap gateway lokal.
// Prasyarat: stack uji berjalan (lihat README) dan database berisi dokumen (mis. setelah `npm test`).
// Pemakaian: node backup.test.mjs
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

const SECRET = "sipar-local-test-secret-0123456789abcdef"; // sama dengan gateway.mjs / pgrst.conf
const URL_BASE = "http://127.0.0.1:54321";
const TOOLS = new URL("../../tools/backup/", import.meta.url).pathname;
const STORE = new URL("./.storage/perizinan-documents/", import.meta.url).pathname;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(role) {
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ role, iss: "supabase", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
}
const SERVICE = jwt("service_role");

function tool(name, args, key = SERVICE) {
  const r = spawnSync(process.execPath, [join(TOOLS, name), ...args], {
    env: { ...process.env, SUPABASE_URL: URL_BASE, SUPABASE_SERVICE_ROLE_KEY: key },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
const manifest = (dir) => JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));

const db = new pg.Pool({ host: process.env.PGHOST || "/tmp", port: Number(process.env.PGPORT || 54329), user: "postgres", database: "sipar", max: 1 });
let pass = 0;
const fails = [];
async function t(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fails.push(name);
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
const ok = (c, m) => {
  if (!c) throw new Error(m);
};

const versions = (await db.query("select storage_path, checksum_sha256 from public.document_versions")).rows;
const missing = new Set(
  (await db.query(`select v.storage_path from public.document_versions v
                    where not exists (select 1 from storage.objects o where o.bucket_id = 'perizinan-documents' and o.name = v.storage_path)`)).rows.map((r) => r.storage_path),
);
ok(versions.length > 0, "database belum berisi dokumen: jalankan `npm test` (E2E) terlebih dahulu");
const dir = mkdtempSync(join(tmpdir(), "sipar-backup-"));
console.log(`Cadangan & pemulihan (${versions.length} versi dokumen, ${missing.size} tanpa file)`);

await t("menolak kunci publik (anon) dan JWT pengguna biasa", async () => {
  ok(tool("backup-storage.mjs", ["--out", dir], jwt("anon")).code === 2, "anon diterima");
  ok(tool("backup-storage.mjs", ["--out", dir], jwt("authenticated")).code === 2, "authenticated diterima");
  ok(tool("backup-storage.mjs", ["--out", dir], "sb_publishable_abc").code === 2, "publishable diterima");
});

await t("cadangan penuh: setiap file diunduh dan checksum cocok; file hilang dilaporkan", async () => {
  const r = tool("backup-storage.mjs", ["--out", dir]);
  ok(r.code === (missing.size ? 1 : 0), `kode keluar ${r.code}\n${r.out}`);
  const m = manifest(dir);
  ok(m.summary.total === versions.length, "jumlah tidak sesuai");
  ok(m.summary.hilang === missing.size && m.summary.rusak === 0 && m.summary.gagal === 0, JSON.stringify(m.summary));
  for (const f of m.files) {
    if (missing.has(f.storage_path)) ok(f.status === "HILANG", `${f.storage_path} seharusnya HILANG`);
    else {
      ok(f.status.startsWith("OK"), `${f.storage_path}: ${f.status} ${f.note}`);
      const local = readFileSync(join(dir, "files", ...f.storage_path.split("/")));
      ok(crypto.createHash("sha256").update(local).digest("hex") === f.checksum_actual, "checksum lokal");
      if (f.checksum_expected) ok(f.checksum_expected === f.checksum_actual, "checksum unggah");
    }
  }
  ok(existsSync(join(dir, "manifest.csv")), "manifest.csv");
});

await t("cadangan bertahap: file utuh dilewati; salinan lokal rusak diunduh ulang", async () => {
  const m = manifest(dir);
  const victim = m.files.find((f) => f.status === "OK");
  writeFileSync(join(dir, "files", ...victim.storage_path.split("/")), Buffer.alloc(victim.size_bytes, 0));
  tool("backup-storage.mjs", ["--out", dir]);
  const m2 = manifest(dir);
  const again = m2.files.find((f) => f.storage_path === victim.storage_path);
  ok(again.status === "OK" && again.note !== "sudah ada", `status ${again.status} ${again.note}`);
  ok(m2.files.filter((f) => f.note === "sudah ada").length === m2.summary.ok - 1, "file lain seharusnya dilewati");
});

await t("pemulihan: file yang hilang dari Storage diunggah kembali ke lokasi sama; tidak menimpa yang ada", async () => {
  const m = manifest(dir);
  const victim = m.files.find((f) => f.status === "OK");
  await db.query("delete from storage.objects where bucket_id = 'perizinan-documents' and name = $1", [victim.storage_path]);
  rmSync(STORE + victim.storage_path, { force: true });
  rmSync(STORE + victim.storage_path + ".meta.json", { force: true });

  const dry = tool("restore-storage.mjs", ["--from", dir, "--dry-run"]);
  ok(dry.code === 0 && /uji coba/.test(dry.out), dry.out);
  const r = tool("restore-storage.mjs", ["--from", dir]);
  ok(r.code === 0, r.out);
  ok(new RegExp(`^1 diunggah, ${m.summary.ok - 1} sudah ada, 0 gagal`, "m").test(r.out), r.out);
  const back = readFileSync(STORE + victim.storage_path);
  ok(crypto.createHash("sha256").update(back).digest("hex") === victim.checksum_actual, "isi berbeda");
  const row = await db.query("select metadata from storage.objects where name = $1", [victim.storage_path]);
  ok(row.rowCount === 1 && Number(row.rows[0].metadata.size) === victim.size_bytes, "metadata objek");
});

await t("pemulihan menolak file cadangan yang berubah", async () => {
  const m = manifest(dir);
  const victim = m.files.find((f) => f.status === "OK");
  const p = join(dir, "files", ...victim.storage_path.split("/"));
  const orig = readFileSync(p);
  writeFileSync(p, Buffer.concat([orig, Buffer.from("x")]));
  const r = tool("restore-storage.mjs", ["--from", dir, "--dry-run"]);
  writeFileSync(p, orig);
  ok(r.code === 1 && /checksum berubah/.test(r.out), r.out);
});

rmSync(dir, { recursive: true, force: true });
await db.end();
console.log(`\n${pass} lulus, ${fails.length} gagal`);
process.exit(fails.length ? 1 : 0);
