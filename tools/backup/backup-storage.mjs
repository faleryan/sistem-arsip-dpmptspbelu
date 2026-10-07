#!/usr/bin/env node
// ============================================================================
// SIPAR-BELU · Cadangan file arsip (Supabase Storage → folder lokal)
//
// Backup database Supabase TIDAK menyertakan isi file di Storage, hanya metadatanya.
// Alat ini mengunduh setiap file yang tercatat di document_versions, memeriksa SHA-256-nya
// terhadap checksum yang disimpan saat unggah, lalu menulis manifest.
//
// Pakai (di komputer admin, BUKAN di Vercel/frontend):
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node tools/backup/backup-storage.mjs --out ./cadangan/arsip
//
// - Jalankan ulang ke folder yang sama untuk cadangan bertahap: file yang sudah ada dan cocok
//   checksum-nya tidak diunduh lagi.
// - Kode keluar 0 = semua file lengkap & cocok; 1 = ada file hilang/rusak (lihat manifest);
//   2 = konfigurasi/koneksi gagal.
// - Kunci service_role melewati RLS. Simpan hanya di komputer admin; jangan pernah di-commit,
//   dikirim lewat chat, atau dipasang sebagai variabel VITE_* / Vercel.
// Tanpa dependensi: Node.js 18+.
// ============================================================================
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, writeFileSync, renameSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

const BUCKET = "perizinan-documents";
const PAGE = 1000;

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(2);
}

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const OUT = resolve(arg("out", `./cadangan-arsip-${new Date().toISOString().slice(0, 10)}`));
const CONCURRENCY = Math.max(1, Math.min(16, Number(arg("concurrency", "4")) || 4));

if (process.argv.includes("--help")) {
  console.log("Pakai: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node tools/backup/backup-storage.mjs [--out folder] [--concurrency 4]");
  process.exit(0);
}
if (!/^https?:\/\//.test(URL_BASE)) die("SUPABASE_URL belum diisi (contoh: https://xxxx.supabase.co).");
if (!KEY) die("SUPABASE_SERVICE_ROLE_KEY belum diisi.");

// Tolak kunci publik: anon/publishable tidak dapat membaca semua file (RLS) dan hasilnya akan tampak "hilang".
const isJwt = KEY.split(".").length === 3;
if (KEY.startsWith("sb_publishable_")) die("Kunci yang diberikan adalah publishable key. Gunakan secret/service_role key.");
if (isJwt) {
  let role = "";
  try {
    role = JSON.parse(Buffer.from(KEY.split(".")[1], "base64url").toString()).role;
  } catch {
    die("SUPABASE_SERVICE_ROLE_KEY bukan JWT yang valid.");
  }
  if (role !== "service_role") die(`Kunci ber-role "${role}". Gunakan kunci service_role.`);
}
const headers = { apikey: KEY, ...(isJwt ? { Authorization: `Bearer ${KEY}` } : {}) };

async function fetchVersions() {
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const u = `${URL_BASE}/rest/v1/document_versions?select=id,document_id,version_no,file_name,storage_path,mime_type,size_bytes,checksum_sha256,uploaded_at,document:documents!document_versions_document_id_fkey(license_id,title)&order=uploaded_at.asc,id.asc&limit=${PAGE}&offset=${offset}`;
    const r = await fetch(u, { headers });
    if (!r.ok) die(`Gagal membaca document_versions (HTTP ${r.status}): ${(await r.text()).slice(0, 300)}`);
    const rows = await r.json();
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}

function sha256File(path) {
  return new Promise((res, rej) => {
    const h = createHash("sha256");
    createReadStream(path).on("data", (d) => h.update(d)).on("end", () => res(h.digest("hex"))).on("error", rej);
  });
}

/** Lokasi lokal aman: tidak boleh keluar dari folder tujuan. */
function localPath(storagePath) {
  const p = resolve(OUT, "files", ...storagePath.split("/"));
  if (!p.startsWith(resolve(OUT, "files") + sep)) throw new Error(`lokasi tidak aman: ${storagePath}`);
  return p;
}

async function backupOne(v) {
  const dest = localPath(v.storage_path);
  const expected = v.checksum_sha256 || null;
  const entry = {
    storage_path: v.storage_path,
    license_id: v.document?.license_id ?? null,
    document_id: v.document_id,
    version_no: v.version_no,
    file_name: v.file_name,
    mime_type: v.mime_type,
    size_bytes: Number(v.size_bytes),
    checksum_expected: expected,
    checksum_actual: null,
    status: "",
    note: "",
  };

  // Sudah ada dari cadangan sebelumnya dan cocok → lewati.
  if (existsSync(dest) && statSync(dest).size === entry.size_bytes) {
    const actual = await sha256File(dest);
    if (!expected || actual === expected) {
      entry.checksum_actual = actual;
      entry.status = expected ? "OK" : "OK_TANPA_CHECKSUM";
      entry.note = "sudah ada";
      return entry;
    }
  }

  const url = `${URL_BASE}/storage/v1/object/${BUCKET}/${v.storage_path.split("/").map(encodeURIComponent).join("/")}`;
  let r;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      r = await fetch(url, { headers });
      if (r.ok || r.status === 404 || r.status === 400) break;
    } catch (e) {
      if (attempt === 3) {
        entry.status = "GAGAL";
        entry.note = String(e.message || e);
        return entry;
      }
    }
    await new Promise((s) => setTimeout(s, 1000 * attempt));
  }
  if (!r || !r.ok) {
    const body = r ? await r.text().catch(() => "") : "";
    entry.status = r && (r.status === 404 || /not.?found/i.test(body)) ? "HILANG" : "GAGAL";
    entry.note = r ? `HTTP ${r.status} ${body.slice(0, 120)}` : "tidak ada respons";
    return entry;
  }
  const buf = Buffer.from(await r.arrayBuffer());
  const actual = createHash("sha256").update(buf).digest("hex");
  entry.checksum_actual = actual;
  mkdirSync(dirname(dest), { recursive: true });
  await writeFile(dest + ".part", buf);
  renameSync(dest + ".part", dest);
  if (buf.length !== entry.size_bytes) {
    entry.status = "RUSAK";
    entry.note = `ukuran ${buf.length} ≠ tercatat ${entry.size_bytes}`;
  } else if (expected && actual !== expected) {
    entry.status = "RUSAK";
    entry.note = "checksum tidak cocok";
  } else {
    entry.status = expected ? "OK" : "OK_TANPA_CHECKSUM";
  }
  return entry;
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  const started = new Date();
  mkdirSync(OUT, { recursive: true });
  console.log(`Membaca daftar file dari ${URL_BASE} …`);
  const versions = await fetchVersions();
  console.log(`${versions.length} versi dokumen tercatat. Mengunduh ke ${OUT} (paralel ${CONCURRENCY}) …`);

  const results = new Array(versions.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < versions.length) {
        const i = next++;
        results[i] = await backupOne(versions[i]);
        done++;
        if (done % 50 === 0 || done === versions.length) process.stdout.write(`  ${done}/${versions.length}\r`);
      }
    }),
  );
  process.stdout.write("\n");

  const count = (s) => results.filter((r) => r.status === s).length;
  const summary = {
    project: URL_BASE,
    bucket: BUCKET,
    started_at: started.toISOString(),
    finished_at: new Date().toISOString(),
    total: results.length,
    ok: count("OK") + count("OK_TANPA_CHECKSUM"),
    tanpa_checksum: count("OK_TANPA_CHECKSUM"),
    hilang: count("HILANG"),
    rusak: count("RUSAK"),
    gagal: count("GAGAL"),
    total_bytes: results.reduce((a, r) => a + (r.status.startsWith("OK") ? r.size_bytes : 0), 0),
  };
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ summary, files: results }, null, 2));
  const cols = ["status", "storage_path", "license_id", "document_id", "version_no", "file_name", "mime_type", "size_bytes", "checksum_expected", "checksum_actual", "note"];
  writeFileSync(join(OUT, "manifest.csv"), "﻿" + [cols.join(";"), ...results.map((r) => cols.map((c) => csvCell(r[c])).join(";"))].join("\r\n"));

  console.log(
    `Selesai: ${summary.ok} OK, ${summary.hilang} hilang, ${summary.rusak} rusak, ${summary.gagal} gagal · ${(summary.total_bytes / 1048576).toFixed(1)} MB`,
  );
  console.log(`Manifest: ${join(OUT, "manifest.csv")}`);
  process.exit(summary.hilang + summary.rusak + summary.gagal ? 1 : 0);
}

main().catch((e) => die(e.stack || String(e)));
