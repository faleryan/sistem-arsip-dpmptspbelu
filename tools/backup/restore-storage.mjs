#!/usr/bin/env node
// ============================================================================
// SIPAR-BELU · Pulihkan file arsip dari folder cadangan ke Supabase Storage
//
// Pasangan backup-storage.mjs. Dipakai setelah database dipulihkan (backup harian/PITR/pg_dump)
// ke proyek yang filenya hilang, atau saat pindah ke proyek Supabase baru.
//
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node tools/backup/restore-storage.mjs --from ./cadangan/arsip [--dry-run]
//
// - Hanya file berstatus OK di manifest yang diunggah, ke lokasi (path) yang sama persis,
//   sehingga cocok dengan document_versions.storage_path.
// - File yang sudah ada di bucket dilewati (tidak pernah menimpa).
// - SHA-256 setiap file diperiksa ulang sebelum diunggah.
// Tanpa dependensi: Node.js 18+.
// ============================================================================
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const BUCKET = "perizinan-documents";
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const die = (m) => {
  console.error(`✗ ${m}`);
  process.exit(2);
};

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const FROM = resolve(arg("from", ""));
const DRY = process.argv.includes("--dry-run");

if (!arg("from")) die("Tentukan folder cadangan: --from ./cadangan/arsip");
if (!/^https?:\/\//.test(URL_BASE)) die("SUPABASE_URL belum diisi.");
if (!KEY || KEY.startsWith("sb_publishable_")) die("SUPABASE_SERVICE_ROLE_KEY belum diisi / bukan secret key.");
const manifestPath = resolve(FROM, "manifest.json");
if (!existsSync(manifestPath)) die(`manifest.json tidak ditemukan di ${FROM}`);

const isJwt = KEY.split(".").length === 3;
const headers = { apikey: KEY, ...(isJwt ? { Authorization: `Bearer ${KEY}` } : {}) };
const { files } = JSON.parse(readFileSync(manifestPath, "utf8"));
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

let uploaded = 0, skipped = 0, failed = 0;
for (const f of files.filter((x) => String(x.status).startsWith("OK"))) {
  const local = resolve(FROM, "files", ...f.storage_path.split("/"));
  if (!local.startsWith(resolve(FROM, "files") + sep) || !existsSync(local)) {
    console.error(`  ✗ file cadangan tidak ada: ${f.storage_path}`);
    failed++;
    continue;
  }
  const buf = readFileSync(local);
  const sum = createHash("sha256").update(buf).digest("hex");
  if (f.checksum_actual && sum !== f.checksum_actual) {
    console.error(`  ✗ checksum berubah sejak dicadangkan: ${f.storage_path}`);
    failed++;
    continue;
  }
  if (DRY) {
    uploaded++;
    continue;
  }
  const r = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${enc(f.storage_path)}`, {
    method: "POST",
    headers: { ...headers, "content-type": f.mime_type, "x-upsert": "false", "cache-control": "3600" },
    body: buf,
  });
  if (r.ok) uploaded++;
  else {
    const t = await r.text();
    if (/already exists|Duplicate|409/i.test(t)) skipped++;
    else {
      console.error(`  ✗ ${f.storage_path}: HTTP ${r.status} ${t.slice(0, 160)}`);
      failed++;
    }
  }
}
console.log(`${DRY ? "[uji coba] " : ""}${uploaded} diunggah, ${skipped} sudah ada, ${failed} gagal.`);
process.exit(failed ? 1 : 0);
