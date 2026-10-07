// Uji end-to-end UI terhadap Postgres + PostgREST lokal (RLS sungguhan). Lihat tests/e2e/README.md.
// Pemakaian: node run.mjs <folder dist> <folder hasil screenshot>
import { chromium } from "playwright-core";
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { rmSync, mkdirSync as mkdirp } from "node:fs";
import pg from "pg";

const DIST = process.argv[2];
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
// Header keamanan produksi (vercel.json) ikut dikirim, dengan domain Supabase diganti gateway lokal,
// sehingga pelanggaran CSP (mis. worker, iframe, eval) tertangkap sebagai galat konsol.
const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
const prodHeaders = Object.fromEntries(
  vercel.headers.find((h) => h.source === "/(.*)").headers.map(({ key, value }) => [
    key.toLowerCase(),
    value.replace(/https:\/\/\*\.supabase\.co/g, "http://127.0.0.1:54321").replace(/wss:\/\/\*\.supabase\.co/g, "ws://127.0.0.1:54321"),
  ]),
);
const server = http.createServer((req, res) => {
  let p = join(DIST, req.url.split("?")[0]);
  if (!existsSync(p) || p === DIST || !extname(p)) p = join(DIST, "index.html");
  res.writeHead(200, { ...prodHeaders, "content-type": mime[extname(p)] ?? "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(4174);
const APP = "http://localhost:4174";

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox"] }).catch(() =>
  chromium.launch({ args: ["--no-sandbox"] }));

const problems = [];
const results = [];
let current = "";
let curPage = null;
let expectedHttp = []; // regex daftar respons galat yang memang diharapkan dalam langkah saat ini

async function blankPage({ w = 1366, h = 860 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
  const page = await ctx.newPage();
  watch(page);
  curPage = page;
  return { page, ctx };
}

function watch(page) {
  page.on("pageerror", (e) => problems.push(`[${current}] pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`[${current}] console: ${m.text()}`);
  });
  page.on("response", async (r) => {
    if (!r.url().includes(":54321") || r.status() < 400) return;
    const body = await r.text().catch(() => "");
    const line = `${r.request().method()} ${r.url().replace("http://127.0.0.1:54321", "")} → ${r.status()} ${body.slice(0, 160)}`;
    if (!expectedHttp.some((re) => re.test(line))) problems.push(`[${current}] http: ${line}`);
  });
}

async function session(email, opts = {}) {
  const { page, ctx } = await blankPage(opts);
  await page.goto(`${APP}/login`);
  await page.fill("#email", email);
  await page.fill("#password", "SiparBelu#Uji2026");
  await page.click("button[type=submit]");
  await page.waitForURL(`${APP}/`);
  await page.waitForSelector("text=Total Perizinan");
  curPage = page;
  return { page, ctx };
}

async function step(name, fn) {
  current = name;
  expectedHttp = [];
  try {
    await fn();
    results.push(`✔ ${name}`);
  } catch (e) {
    results.push(`✘ ${name}\n    ${String(e.message).split("\n")[0]} @ ${curPage?.url()}`);
    await curPage?.screenshot({ path: `${OUT}/FAIL-${results.length}.png` }).catch(() => {});
  }
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: false });
const rowsCount = (p) => p.locator("tbody tr").count();
const toast = (p, re) => p.waitForSelector(`[data-sonner-toast] >> text=${re}`, { timeout: 8000 });

// ───────────────────────── Super Admin ─────────────────────────
let { page: sa, ctx: saCtx } = await session("superadmin@example.com");

await step("SA: daftar perizinan memuat 6 data contoh dari view", async () => {
  await sa.goto(`${APP}/perizinan`);
  await sa.waitForSelector("text=PMH-2026-90001");
  const txt = await sa.locator("text=/dari \\d+ data/").innerText();
  if (!/1–6 dari 6 data/.test(txt)) throw new Error(txt);
  await shot(sa, "10-perizinan-list");
});

await step("SA: pencarian ber-debounce + URL tersinkron", async () => {
  await sa.fill("main input[type=search]", "Contoh Dua");
  await sa.waitForURL(/q=Contoh/);
  await sa.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
  if (!(await sa.locator("tbody").innerText()).includes("Pemohon Contoh Dua")) throw new Error("hasil salah");
});

await step("SA: reset + filter status AKTIF + urut", async () => {
  await sa.click("button:has-text('Reset')");
  await sa.waitForFunction(() => !location.search.includes("q="));
  await sa.selectOption("select[aria-label=Status]", "AKTIF");
  await sa.waitForURL(/f_status=AKTIF/);
  await sa.waitForFunction(() => [...document.querySelectorAll("tbody tr")].every((r) => r.innerText.includes("Aktif")));
  await sa.click("th button:has-text('No. Permohonan')");
  await sa.waitForURL(/sort=application_number.asc/);
  const first = await sa.locator("tbody tr").first().innerText();
  await sa.click("th button:has-text('No. Permohonan')");
  await sa.waitForURL(/sort=application_number.desc/);
  await sa.waitForFunction((f) => document.querySelector("tbody tr")?.innerText !== f, first);
});

await step("SA: kolom bisa disembunyikan/ditampilkan", async () => {
  await sa.click("button:has-text('Kolom')");
  await sa.click("[role=menu] label:has-text('NIK')");
  await sa.keyboard.press("Escape");
  await sa.waitForSelector("th:has-text('NIK')");
});

await step("SA: ekspor CSV (pemisah ;, BOM, sesuai filter)", async () => {
  const [dl] = await Promise.all([sa.waitForEvent("download"), sa.click("button:has-text('Ekspor CSV')")]);
  const path = `${OUT}/export.csv`;
  await dl.saveAs(path);
  const csv = readFileSync(path, "utf8");
  if (!csv.startsWith("﻿No. Permohonan;")) throw new Error(csv.slice(0, 60));
  const lines = csv.trim().split("\r\n");
  if (lines.length !== 3) throw new Error(`baris ${lines.length}`); // header + 2 izin AKTIF
});

await step("Master: tambah, ubah, dokumen wajib, hapus jenis izin", async () => {
  await sa.goto(`${APP}/master`);
  await sa.waitForURL(/master\/jenis-izin/);
  await sa.waitForSelector("tbody tr >> text=IU");
  await sa.click("button:has-text('Tambah jenis izin')");
  await sa.click("[role=dialog] button[type=submit]");
  await sa.waitForSelector("text=Kode wajib diisi.");
  await sa.fill("[role=dialog] input >> nth=0", "uji-e2e");
  await sa.fill("[role=dialog] input >> nth=1", "Izin Uji E2E");
  await sa.fill("[role=dialog] input >> nth=3", "0");
  await sa.click("[role=dialog] button[type=submit]");
  await sa.waitForSelector("text=Masa berlaku harus angka 1–1200.");
  await sa.fill("[role=dialog] input >> nth=3", "24");
  await shot(sa, "11-master-form");
  await sa.click("[role=dialog] button[type=submit]");
  await toast(sa, "Data jenis izin ditambahkan");
  await sa.waitForSelector("tbody >> text=UJI-E2E");
  // duplikat kode
  await sa.click("button:has-text('Tambah jenis izin')");
  await sa.fill("[role=dialog] input >> nth=0", "UJI-E2E");
  await sa.fill("[role=dialog] input >> nth=1", "Duplikat");
  expectedHttp = [/license_types.* 409 /];
  await sa.click("[role=dialog] button[type=submit]");
  await sa.waitForSelector("[role=dialog] >> text=Kode sudah terdaftar");
  await sa.click("[role=dialog] button:has-text('Batal')");
  // dokumen wajib
  const row = sa.locator("tbody tr", { hasText: "UJI-E2E" });
  await row.locator("button[aria-label='Aksi baris']").click();
  await sa.click("[role=menuitem]:has-text('Atur dokumen wajib')");
  await sa.check("[role=dialog] label:has-text('KTP') input");
  await sa.check("[role=dialog] label:has-text('Surat Permohonan') input");
  await sa.click("[role=dialog] button:has-text('Simpan')");
  await toast(sa, "Dokumen wajib disimpan");
  // hapus
  await row.locator("button[aria-label='Aksi baris']").click();
  await sa.click("[role=menuitem]:has-text('Hapus')");
  await sa.click("[role=dialog] button:has-text('Hapus')");
  await toast(sa, "Data dihapus");
  await sa.waitForSelector("tbody >> text=UJI-E2E", { state: "detached" });
});

await step("Master: hapus kecamatan yang dipakai ditolak dengan pesan jelas", async () => {
  await sa.goto(`${APP}/master/kecamatan`);
  const first = sa.locator("tbody tr").first();
  await first.waitFor();
  await first.locator("button[aria-label='Aksi baris']").click();
  await sa.click("[role=menuitem]:has-text('Hapus')");
  await sa.click("[role=dialog] button:has-text('Hapus')");
  await sa.waitForSelector("[data-sonner-toast] >> text=/masih dipakai|tidak dapat dihapus/");
});

await step("Master: filter desa per kecamatan", async () => {
  await sa.goto(`${APP}/master/desa`);
  await sa.waitForSelector("tbody tr");
  const all = await rowsCount(sa);
  const opt = await sa.locator("select[aria-label=Kecamatan] option").nth(1).getAttribute("value");
  await sa.selectOption("select[aria-label=Kecamatan]", opt);
  await sa.waitForURL(/f_district=/);
  await sa.waitForTimeout(500);
  const some = await rowsCount(sa);
  if (!(some > 0 && some <= all)) throw new Error(`${some}/${all}`);
  await shot(sa, "12-master-desa");
});

await sa.close(); await saCtx.close();

// ───────────────────────── Petugas ─────────────────────────
let { page: pt, ctx: ptCtx } = await session("petugas@example.com");
let newLicenseUrl = "";

await step("Petugas: tambah pemohon (validasi NIK, wilayah bertingkat)", async () => {
  await pt.goto(`${APP}/pemohon`);
  await pt.waitForSelector("tbody tr");
  await pt.click("button:has-text('Tambah pemohon')");
  await pt.fill("[role=dialog] >> label:has-text('Nama lengkap') + input", "Maria Uji Coba");
  await pt.fill("[role=dialog] >> label:has-text('NIK') + input", "12345");
  await pt.click("[role=dialog] button[type=submit]");
  await pt.waitForSelector("text=NIK harus 16 digit angka.");
  await pt.fill("[role=dialog] >> label:has-text('NIK') + input", "5304011234567890");
  const d = await pt.locator("[role=dialog] >> label:has-text('Kecamatan') + select option").nth(1).getAttribute("value");
  await pt.selectOption("[role=dialog] >> label:has-text('Kecamatan') + select", d);
  await pt.waitForFunction(() => {
    const s = [...document.querySelectorAll("[role=dialog] select")][1];
    return s && !s.disabled && s.options.length > 1;
  });
  const v = await pt.locator("[role=dialog] >> label:has-text('Desa/Kelurahan') + select option").nth(1).getAttribute("value");
  await pt.selectOption("[role=dialog] >> label:has-text('Desa/Kelurahan') + select", v);
  await shot(pt, "13-pemohon-form");
  await pt.click("[role=dialog] button[type=submit]");
  await pt.waitForURL(/\/pemohon\/[0-9a-f-]{36}$/);
  await pt.waitForSelector("h2:has-text('Maria Uji Coba')");
  await pt.waitForSelector("text=5304011234567890");
});

await step("Petugas: NIK duplikat ditolak dengan tautan ke data lama", async () => {
  await pt.goto(`${APP}/pemohon`);
  await pt.click("button:has-text('Tambah pemohon')");
  await pt.fill("[role=dialog] >> label:has-text('Nama lengkap') + input", "Orang Lain");
  await pt.fill("[role=dialog] >> label:has-text('NIK') + input", "5304011234567890");
  await pt.click("[role=dialog] button[type=submit]");
  await pt.waitForSelector("text=NIK ini sudah terdaftar atas nama Maria Uji Coba.");
  await pt.waitForSelector("text=Buka data pemohon yang sudah ada");
  await pt.click("[role=dialog] button:has-text('Batal')");
});

await step("Petugas: tambah perusahaan (validasi NIB)", async () => {
  await pt.goto(`${APP}/perusahaan`);
  await pt.click("button:has-text('Tambah perusahaan')");
  await pt.fill("[role=dialog] >> label:has-text('Nama perusahaan') + input", "CV Uji Sejahtera");
  await pt.fill("[role=dialog] >> label:has-text('NIB') + input", "123");
  await pt.click("[role=dialog] button[type=submit]");
  await pt.waitForSelector("text=NIB harus 13 digit angka.");
  await pt.fill("[role=dialog] >> label:has-text('NIB') + input", "9120001234567");
  await pt.selectOption("[role=dialog] >> label:has-text('Bentuk usaha') + select", "CV");
  await pt.click("[role=dialog] button[type=submit]");
  await pt.waitForURL(/\/perusahaan\/[0-9a-f-]{36}$/);
  await pt.waitForSelector("h2:has-text('CV Uji Sejahtera')");
});

await step("Petugas: buat izin DRAFT via combobox, tanpa bagian penerbitan", async () => {
  await pt.click("button:has-text('Izin baru')");
  await pt.waitForURL(/perizinan\/baru\?perusahaan=/);
  await pt.waitForSelector("text=Data permohonan");
  if (await pt.locator("text=Data penerbitan").count()) throw new Error("petugas melihat bagian penerbitan");
  const bizVal = await pt.inputValue("#lic-business");
  if (bizVal !== "CV Uji Sejahtera") throw new Error(`prefill perusahaan: ${bizVal}`);
  await pt.click("button:has-text('Simpan permohonan')");
  await pt.waitForSelector("text=Jenis izin wajib dipilih.");
  await pt.waitForSelector("text=Pemohon wajib dipilih.");
  const t = await pt.locator("label:has-text('Jenis izin') + select option").nth(1).getAttribute("value");
  await pt.selectOption("label:has-text('Jenis izin') + select", t);
  await pt.click("#lic-applicant");
  await pt.fill("#lic-applicant", "Maria");
  await pt.waitForSelector("[role=option]:has-text('Maria Uji Coba')");
  await pt.keyboard.press("ArrowDown");
  await pt.keyboard.press("ArrowUp");
  await pt.keyboard.press("Enter");
  if ((await pt.inputValue("#lic-applicant")) !== "Maria Uji Coba") throw new Error("combobox tidak memilih");
  await pt.fill("label:has-text('Catatan') + textarea", "Permohonan uji end-to-end");
  await shot(pt, "14-izin-form");
  await pt.click("button:has-text('Simpan permohonan')");
  await pt.waitForURL(/\/perizinan\/[0-9a-f-]{36}$/);
  newLicenseUrl = pt.url();
  await pt.waitForSelector("h2:has-text('PMH-')");
  await pt.waitForSelector("main >> text=Draft");
  await pt.waitForSelector("text=Kelengkapan dokumen");
});

await step("Petugas: ajukan (DRAFT → DIAJUKAN), riwayat bertambah", async () => {
  await pt.click("button:has-text('Ajukan')");
  await pt.click("[role=dialog] button:has-text('Ajukan')");
  await toast(pt, "Status diubah menjadi Diajukan");
  await pt.waitForSelector("text=dari Draft");
  await pt.waitForSelector("button:has-text('Ubah')"); // masih boleh ubah saat DIAJUKAN
  await shot(pt, "15-izin-detail-diajukan");
});

await step("Petugas: /pengguna ditolak; master data hanya baca", async () => {
  await pt.goto(`${APP}/pengguna`);
  await pt.waitForURL(/tidak-berwenang/);
  await pt.goto(`${APP}/master/jenis-izin`);
  await pt.waitForSelector("text=Hanya Super Admin yang dapat mengubah master data.");
  if (await pt.locator("button:has-text('Tambah jenis izin')").count()) throw new Error("tombol tambah tampil");
});

await pt.close(); await ptCtx.close();

// ───────────────────────── Verifikator ─────────────────────────
let { page: vf, ctx: vfCtx } = await session("verifikator@example.com");
await step("Verifikator: tanpa tombol Ubah; Mulai verifikasi ditolak DB (belum ada dokumen)", async () => {
  await vf.goto(newLicenseUrl);
  await vf.waitForSelector("button:has-text('Mulai verifikasi')");
  if (await vf.locator("button:has-text('Ubah')").count()) throw new Error("verifikator melihat Ubah");
  await vf.click("button:has-text('Mulai verifikasi')");
  expectedHttp = [/change_license_status.* 400 /];
  await vf.click("[role=dialog] button:has-text('Mulai verifikasi')");
  await vf.waitForSelector("[role=dialog] >> text=Belum ada dokumen yang diunggah.");
  await shot(vf, "16-status-dialog-error");
  await vf.click("[role=dialog] button:has-text('Batal')");
});
await step("Verifikator: /perizinan/baru diarahkan ke tidak berwenang", async () => {
  await vf.goto(`${APP}/perizinan/baru`);
  await vf.waitForURL(/tidak-berwenang/);
});
await vf.close(); await vfCtx.close();

// ───────────────────────── Admin Arsip ─────────────────────────
let { page: ad, ctx: adCtx } = await session("adminarsip@example.com");
await step("Admin Arsip: impor arsip izin lama AKTIF; tgl berakhir dihitung otomatis", async () => {
  await ad.goto(`${APP}/perizinan/baru`);
  await ad.waitForSelector("text=Data penerbitan");
  const opts = await ad.locator("label:has-text('Jenis izin') + select option").allInnerTexts();
  const idx = opts.findIndex((o) => /\(IU\)/.test(o));
  const t = await ad.locator("label:has-text('Jenis izin') + select option").nth(idx).getAttribute("value");
  await ad.selectOption("label:has-text('Jenis izin') + select", t);
  await ad.click("#lic-applicant");
  await ad.fill("#lic-applicant", "Contoh Satu");
  await ad.click("[role=option]:has-text('Pemohon Contoh Satu')");
  await ad.selectOption("label:has-text('Status awal') + select", "AKTIF");
  await ad.click("button:has-text('Simpan permohonan')");
  await ad.waitForSelector("text=Nomor izin wajib untuk izin yang sudah terbit.");
  await ad.fill("label:has-text('Nomor izin') + input", "503/IU/UJI/2024");
  await ad.fill("label:has-text('Tanggal terbit') + input", "2024-01-31");
  await ad.waitForSelector("text=/Bila kosong: .*2029|Bila kosong: .*202/");
  await shot(ad, "17-izin-legacy-form");
  await ad.click("button:has-text('Simpan permohonan')");
  await ad.waitForURL(/\/perizinan\/[0-9a-f-]{36}$/);
  await ad.waitForSelector("h2:has-text('503/IU/UJI/2024')");
  await ad.waitForSelector("main >> text=Aktif");
  await shot(ad, "18-izin-legacy-detail");
});
await step("Admin Arsip: ubah izin petugas (nomor izin)", async () => {
  await ad.goto(newLicenseUrl + "/ubah");
  await ad.waitForSelector("text=Data penerbitan");
  await ad.fill("label:has-text('Nomor izin') + input", "503/UJI/E2E/2026");
  await ad.click("button:has-text('Simpan perubahan')");
  await ad.waitForURL(newLicenseUrl);
  await ad.waitForSelector("h2:has-text('503/UJI/E2E/2026')");
  if (await ad.locator("button:has-text('Hapus')").count()) throw new Error("admin arsip melihat Hapus");
});
await ad.close(); await adCtx.close();

// ───────────────────────── Viewer ─────────────────────────
let { page: vw, ctx: vwCtx } = await session("viewer@example.com");
await step("Viewer: hanya izin publik; tanpa menu Pemohon/Perusahaan, riwayat, dan kode QR", async () => {
  if (await vw.locator("nav >> text=Pemohon").count()) throw new Error("menu pemohon tampil");
  await vw.goto(`${APP}/perizinan`);
  await vw.waitForSelector("tbody tr");
  const body = await vw.locator("tbody").innerText();
  if (/Draft|Diajukan|Verifikasi/.test(body)) throw new Error("viewer melihat status non-publik");
  if (await vw.locator("button:has-text('Tambah perizinan')").count()) throw new Error("tombol tambah");
  await vw.locator("tbody tr").first().click();
  await vw.waitForURL(/\/perizinan\/[0-9a-f-]{36}$/);
  await vw.waitForSelector("text=Data izin");
  if (await vw.locator("text=Riwayat status").count()) throw new Error("riwayat tampil");
  if (await vw.locator("text=Kode verifikasi QR").count()) throw new Error("kode tampil");
  await shot(vw, "19-viewer-detail");
  await vw.goto(`${APP}/pemohon`);
  await vw.waitForURL(/tidak-berwenang/);
});
await vw.close(); await vwCtx.close();

// ───────────────────────── Fase 4: Arsip digital ─────────────────────────
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const fileInput = "[role=dialog] input[type=file]";
const docsCard = "div.rounded-xl:has(h3:text-is('Dokumen arsip'))";
async function chooseType(p, name) {
  const v = await p.locator("[role=dialog] label:has-text('Jenis dokumen') + select option", { hasText: name }).first().getAttribute("value");
  await p.selectOption("[role=dialog] label:has-text('Jenis dokumen') + select", v);
}
let storagePosts = 0;

({ page: pt, ctx: ptCtx } = await session("petugas@example.com"));
pt.on("request", (r) => { if (r.method() === "POST" && /\/storage\/v1\/object\/perizinan/.test(r.url())) storagePosts++; });

await step("Petugas: unggah KTP (PDF) ke izin miliknya; tercatat Menunggu verifikasi", async () => {
  await pt.goto(newLicenseUrl);
  await pt.click("button:has-text('Unggah dokumen')");
  await chooseType(pt, "KTP");
  if ((await pt.inputValue("[role=dialog] label:has-text('Judul dokumen') + input")) !== "KTP") throw new Error("judul tidak otomatis");
  await pt.fill("[role=dialog] label:has-text('Nomor dokumen') + input", "KTP/5304/001");
  await pt.setInputFiles(fileInput, { name: "KTP Maria.pdf", mimeType: "application/pdf", buffer: PDF });
  await pt.waitForSelector("[role=dialog] >> text=KTP Maria.pdf");
  await shot(pt, "30-unggah-dialog");
  await pt.click("[role=dialog] button[type=submit]");
  await toast(pt, "Dokumen diunggah");
  await pt.waitForSelector(`${docsCard} >> text=Menunggu verifikasi`);
  await pt.waitForSelector(`${docsCard} >> text=No. KTP/5304/001`);
  await pt.waitForSelector("div.rounded-xl:has(h3:text-is('Kelengkapan dokumen')) li:has-text('KTP'):has-text('Menunggu verifikasi')");
});

await step("Petugas: file PNG bernama .pdf ditolak sebelum dikirim ke Storage", async () => {
  const before = storagePosts;
  await pt.click("button:has-text('Unggah dokumen')");
  await chooseType(pt, "Dokumen Pendukung");
  await pt.setInputFiles(fileInput, { name: "palsu.pdf", mimeType: "application/pdf", buffer: PNG });
  await pt.click("[role=dialog] button[type=submit]");
  await pt.waitForSelector("[role=dialog] >> text=Isi file adalah PNG, tetapi ekstensinya .pdf");
  if (storagePosts !== before) throw new Error("file tetap dikirim ke Storage");
  await pt.click("[role=dialog] button:has-text('Batal')");
});

await step("Petugas: unggah dari kartu kelengkapan (jenis terisi otomatis), gambar PNG", async () => {
  await pt.click("button[aria-label='Unggah Surat Permohonan']");
  const sel = await pt.locator("[role=dialog] label:has-text('Jenis dokumen') + select option:checked").innerText();
  if (sel !== "Surat Permohonan") throw new Error(`jenis terpilih: ${sel}`);
  await pt.setInputFiles(fileInput, { name: "surat-permohonan.png", mimeType: "image/png", buffer: PNG });
  await pt.waitForSelector("[role=dialog] img"); // thumbnail lokal
  await pt.click("[role=dialog] button[type=submit]");
  await toast(pt, "Dokumen diunggah");
  await pt.waitForSelector(`${docsCard} button[aria-label='Lihat Surat Permohonan']`);
  await shot(pt, "31-detail-dokumen");
});

await step("Pratinjau: PDF via signed URL di iframe; gambar tampil", async () => {
  await pt.click(`${docsCard} button[aria-label='Lihat KTP']`);
  const src = await (await pt.waitForSelector("[role=dialog] iframe")).getAttribute("src");
  if (!/\/storage\/v1\/object\/sign\/perizinan-documents\/.+token=/.test(src)) throw new Error(src);
  const r = await pt.request.get(src);
  if (r.status() !== 200 || r.headers()["content-type"] !== "application/pdf") throw new Error(`${r.status()} ${r.headers()["content-type"]}`);
  await shot(pt, "32-pratinjau-pdf");
  await pt.keyboard.press("Escape");
  await pt.click(`${docsCard} button[aria-label='Lihat Surat Permohonan']`);
  await pt.waitForFunction(() => { const i = document.querySelector("[role=dialog] img"); return i && i.complete && i.naturalWidth > 0; });
  await pt.keyboard.press("Escape");
});

await step("Unduh: file asli dengan nama aslinya, isi identik", async () => {
  const [dl] = await Promise.all([pt.waitForEvent("download"), pt.click(`${docsCard} button[aria-label='Unduh KTP']`)]);
  if (dl.suggestedFilename() !== "KTP Maria.pdf") throw new Error(dl.suggestedFilename());
  const got = readFileSync(await dl.path());
  if (!got.equals(PDF)) throw new Error("isi file berbeda");
});

await step("Versi baru (v2) dan ubah info dokumen", async () => {
  await pt.click(`${docsCard} button[aria-label='Aksi lain KTP']`);
  await pt.click("[role=menuitem]:has-text('Unggah versi baru')");
  await pt.waitForSelector("[role=dialog] >> text=Versi aktif:");
  await pt.setInputFiles(fileInput, { name: "KTP Maria v2.pdf", mimeType: "application/pdf", buffer: PDF });
  await pt.click("[role=dialog] button[type=submit]");
  await toast(pt, "Versi baru diunggah");
  await pt.waitForSelector(`${docsCard} >> text=/· v2 ·/`);
  await pt.click(`${docsCard} button[aria-label='Aksi lain KTP']`);
  if (await pt.locator("[role=menuitem]:has-text('Hapus')").count()) throw new Error("petugas melihat menu Hapus");
  await pt.click("[role=menuitem]:has-text('Ubah info')");
  await pt.fill("[role=dialog] label:has-text('Judul dokumen') + input", "KTP Maria Uji Coba");
  await pt.click("[role=dialog] button[type=submit]");
  await toast(pt, "Info dokumen disimpan");
  await pt.waitForSelector(`${docsCard} button[aria-label='Lihat KTP Maria Uji Coba']`);
});

await step("Storage menolak unggahan Petugas ke izin yang bukan miliknya (policy RLS)", async () => {
  expectedHttp = [/storage\/v1\/object\/perizinan-documents.* 400 .*row-level security/];
  const res = await pt.evaluate(async () => {
    const raw = localStorage.getItem("sb-127-auth-token") ?? sessionStorage.getItem("sb-127-auth-token");
    const token = JSON.parse(raw).access_token;
    const lic = (await (await fetch("http://127.0.0.1:54321/rest/v1/v_license_search?select=id,year&application_number=eq.PMH-2026-90004", {
      headers: { authorization: `Bearer ${token}`, apikey: "anon-key" } })).json())[0];
    const r = await fetch(`http://127.0.0.1:54321/storage/v1/object/perizinan-documents/${lic.year}/${lic.id}/ktp/${crypto.randomUUID()}-x.pdf`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/pdf" }, body: "%PDF-1.4" });
    return r.json();
  });
  if (res.statusCode !== "403") throw new Error(JSON.stringify(res));
});
await pt.close(); await ptCtx.close();

({ page: vf, ctx: vfCtx } = await session("verifikator@example.com"));
await step("Verifikator: dapat melihat dokumen, tanpa unggah/ubah/hapus", async () => {
  await vf.goto(newLicenseUrl);
  await vf.waitForSelector(`${docsCard} button[aria-label='Lihat KTP Maria Uji Coba']`);
  if (await vf.locator("button:has-text('Unggah dokumen')").count()) throw new Error("tombol unggah tampil");
  await vf.click(`${docsCard} button[aria-label='Aksi lain KTP Maria Uji Coba']`);
  await vf.waitForSelector("[role=menuitem]");
  const items = await vf.locator("[role=menuitem]").allInnerTexts();
  if (items.join("|") !== "Lihat|Riwayat versi") throw new Error(items.join("|"));
  await vf.keyboard.press("Escape");
});
await vf.close(); await vfCtx.close();

({ page: ad, ctx: adCtx } = await session("adminarsip@example.com"));
await step("Admin Arsip: Surat Izin pada izin AKTIF langsung Diarsipkan; hapus dokumen", async () => {
  await ad.goto(`${APP}/perizinan?q=PMH-2026-90002`);
  await ad.click("tbody tr >> text=PMH-2026-90002");
  await ad.waitForSelector(docsCard);
  await ad.click("button:has-text('Unggah dokumen')");
  await chooseType(ad, "Surat Izin");
  await ad.waitForSelector("[role=dialog] >> text=langsung berstatus");
  await ad.fill("[role=dialog] label:has-text('Judul dokumen') + input", "Surat Izin Operasional (pindaian)");
  await ad.setInputFiles(fileInput, { name: "surat-izin.pdf", mimeType: "application/pdf", buffer: PDF });
  await ad.click("[role=dialog] button[type=submit]");
  await toast(ad, "Dokumen diunggah");
  const item = ad.locator(`${docsCard} li`, { hasText: "Surat Izin Operasional (pindaian)" });
  await item.locator("text=Diarsipkan").waitFor();
  await ad.click(`${docsCard} button[aria-label='Aksi lain NPWP (contoh)']`);
  await ad.click("[role=menuitem]:has-text('Hapus')");
  await ad.click("[role=dialog] button:has-text('Hapus')");
  await toast(ad, "Dokumen dihapus dari arsip");
  await ad.waitForSelector(`${docsCard} button[aria-label='Lihat NPWP (contoh)']`, { state: "detached" });
  await shot(ad, "33-admin-diarsipkan");
});
await ad.close(); await adCtx.close();

({ page: vw, ctx: vwCtx } = await session("viewer@example.com"));
await step("Viewer: Arsip Digital hanya Surat Izin; pratinjau berfungsi", async () => {
  await vw.goto(`${APP}/arsip`);
  await vw.waitForSelector("tbody tr >> text=Surat Izin Operasional (pindaian)");
  const types = await vw.locator("tbody tr td:nth-child(2)").allInnerTexts();
  if (!types.length || types.some((t) => t !== "Surat Izin")) throw new Error(types.join(","));
  await vw.click("tbody tr >> text=Surat Izin Operasional (pindaian)");
  const src = await (await vw.waitForSelector("[role=dialog] iframe")).getAttribute("src");
  if ((await vw.request.get(src)).status() !== 200) throw new Error("pratinjau gagal");
  await shot(vw, "34-viewer-arsip");
});
await vw.close(); await vwCtx.close();

({ page: sa, ctx: saCtx } = await session("superadmin@example.com"));
await step("Arsip Digital: filter jenis, cari nama file, ekspor CSV", async () => {
  await sa.goto(`${APP}/arsip`);
  await sa.waitForSelector("tbody tr >> text=KTP Maria Uji Coba");
  await shot(sa, "35-arsip-digital");
  await sa.selectOption("select[aria-label='Jenis dokumen']", { label: "KTP" });
  await sa.waitForURL(/f_type=/);
  await sa.waitForFunction(() => [...document.querySelectorAll("tbody tr td:nth-child(2)")].every((td) => td.textContent === "KTP"));
  await sa.fill("main input[type=search]", "Maria v2");
  await sa.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1 && document.querySelector("tbody").innerText.includes("KTP Maria Uji Coba"));
  const [dl] = await Promise.all([sa.waitForEvent("download"), sa.click("button:has-text('Ekspor CSV')")]);
  const csv = readFileSync(await dl.path(), "utf8");
  if (!csv.includes("KTP Maria Uji Coba") || csv.trim().split("\r\n").length !== 2) throw new Error(csv);
});
await sa.close(); await saCtx.close();

// ───────────────────────── Fase 5: verifikasi, workflow, audit, pemulihan ─────────────────────────
const todayWita = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());

({ page: vf, ctx: vfCtx } = await session("verifikator@example.com"));
await step("Verifikator: Antrean Verifikasi berisi dokumen permohonan yang diajukan", async () => {
  await vf.goto(`${APP}/verifikasi`);
  await vf.waitForSelector("tbody tr >> text=KTP Maria Uji Coba");
  await vf.waitForSelector("tbody tr >> text=Surat Permohonan");
  await shot(vf, "40-antrean-verifikasi");
});
await step("Verifikator: tolak KTP wajib beralasan; izin otomatis masuk tahap Verifikasi", async () => {
  await vf.click("tbody tr >> text=KTP Maria Uji Coba");
  await vf.waitForSelector("[role=dialog] iframe");
  await vf.click("[role=dialog] [role=radio]:has-text('Tolak')");
  await vf.click("[role=dialog] button:has-text('Simpan hasil')");
  await vf.waitForSelector("[role=dialog] >> text=Alasan penolakan wajib diisi");
  await vf.fill("[role=dialog] textarea", "Foto KTP buram, NIK tidak terbaca.");
  await shot(vf, "41-dialog-verifikasi");
  await vf.click("[role=dialog] button:has-text('Simpan hasil')");
  await toast(vf, "Dokumen ditolak");
  await vf.waitForSelector("tbody tr >> text=KTP Maria Uji Coba", { state: "detached" });
  await vf.goto(newLicenseUrl);
  await vf.waitForSelector("[aria-current=step] >> text=Verifikasi");
});
await vf.close(); await vfCtx.close();

({ page: pt, ctx: ptCtx } = await session("petugas@example.com"));
await step("Petugas: ganti KTP yang ditolak (v3) dari kartu kelengkapan; riwayat versi lengkap", async () => {
  await pt.goto(newLicenseUrl);
  await pt.waitForSelector(`${docsCard} >> text=Ditolak`);
  await pt.click("button[aria-label='Unggah KTP']");
  await pt.waitForSelector("[role=dialog] >> text=Versi aktif:");
  await pt.setInputFiles(fileInput, { name: "KTP Maria jelas.pdf", mimeType: "application/pdf", buffer: PDF });
  await pt.click("[role=dialog] button[type=submit]");
  await toast(pt, "Versi baru diunggah");
  await pt.waitForSelector(`${docsCard} >> text=/· v3 ·/`);
  await pt.click(`${docsCard} button[aria-label='Aksi lain KTP Maria Uji Coba']`);
  await pt.click("[role=menuitem]:has-text('Riwayat versi')");
  await pt.waitForSelector("[role=dialog] >> text=Versi 3");
  const txt = await pt.locator("[role=dialog] ol[aria-label='Daftar versi']").innerText();
  for (const want of ["Versi 3", "Aktif", "Versi 2", "Foto KTP buram", "Versi 1"]) if (!txt.includes(want)) throw new Error(`riwayat tanpa "${want}"`);
  await pt.click("[role=dialog] ol li:nth-child(2) button >> nth=0"); // pilih versi 2 → pratinjau berganti
  await pt.waitForSelector("[role=dialog] iframe[title$='v2']");
  await shot(pt, "42-riwayat-versi");
  await pt.keyboard.press("Escape");
});
await pt.close(); await ptCtx.close();

({ page: vf, ctx: vfCtx } = await session("verifikator@example.com"));
await step("Verifikator: terima semua dokumen wajib lalu Setujui permohonan", async () => {
  await vf.goto(newLicenseUrl);
  for (const title of ["KTP Maria Uji Coba", "Surat Permohonan"]) {
    await vf.click(`button[aria-label='Periksa ${title}']`);
    await vf.click("[role=dialog] [role=radio]:has-text('Terima')");
    await vf.click("[role=dialog] button:has-text('Simpan hasil')");
    await toast(vf, "Dokumen diverifikasi");
    await vf.waitForSelector(`button[aria-label='Periksa ${title}']`, { state: "detached" });
  }
  await vf.waitForSelector("text=Semua dokumen wajib sudah lengkap");
  await vf.click("main button:has-text('Setujui')");
  await vf.click("[role=dialog] button:has-text('Setujui')");
  await toast(vf, "Status diubah menjadi Disetujui");
  await vf.waitForSelector("[aria-current=step] >> text=Disetujui");
});
await vf.close(); await vfCtx.close();

({ page: ad, ctx: adCtx } = await session("adminarsip@example.com"));
await step("Admin Arsip: Terbitkan dicegah sebelum tanggal terbit diisi, lalu terbit → Aktif otomatis", async () => {
  await ad.goto(newLicenseUrl);
  await ad.click("main button:has-text('Terbitkan')");
  await ad.waitForSelector("[role=dialog] >> text=belum diisi");
  if (await ad.locator("[role=dialog] button:has-text('Terbitkan')").isEnabled()) throw new Error("tombol terbitkan aktif");
  await ad.click("[role=dialog] button:has-text('Batal')");
  await ad.goto(newLicenseUrl + "/ubah");
  await ad.fill("label:has-text('Tanggal terbit') + input", todayWita);
  await ad.click("button:has-text('Simpan perubahan')");
  await ad.waitForURL(newLicenseUrl);
  await ad.click("main button:has-text('Terbitkan')");
  await ad.click("[role=dialog] button:has-text('Terbitkan')");
  await toast(ad, "Status diubah menjadi Diterbitkan");
  await ad.waitForSelector("[aria-current=step] >> text=Aktif");
  const hist = await ad.locator("div.rounded-xl:has(h3:text-is('Riwayat status'))").innerText();
  if (!/Aktif otomatis pada tanggal terbit/.test(hist)) throw new Error("riwayat tanpa catatan aktif otomatis");
  await shot(ad, "43-izin-aktif");
});
await step("Audit: jejak audit izin menampilkan perubahan status dengan nilai lama → baru", async () => {
  await ad.click("button:has-text('Jejak audit')");
  await ad.waitForURL(/\/audit\?f_record=/);
  await ad.waitForSelector("text=Menampilkan jejak audit untuk satu data");
  const row = ad.locator("tbody tr", { hasText: /DISETUJUI → DITERBITKAN/ });
  await row.waitFor();
  await row.click();
  await ad.waitForSelector("[role=dialog] >> text=Detail aktivitas");
  const t = await ad.locator("[role=dialog] table").innerText();
  if (!/Status[\s\S]*DISETUJUI[\s\S]*DITERBITKAN/.test(t)) throw new Error(t);
  await shot(ad, "44-audit-detail");
  await ad.keyboard.press("Escape");
  await ad.click("button:has-text('Semua aktivitas')");
  await ad.selectOption("select[aria-label='Aksi']", "VERIFY");
  await ad.waitForSelector("tbody tr >> text=Menolak dokumen: KTP Maria v2.pdf");
  await ad.fill("input[aria-label='Tanggal dari']", todayWita);
  await ad.waitForURL(/f_from=/);
  await ad.waitForSelector("tbody tr >> text=Menolak dokumen: KTP Maria v2.pdf");
});
await step("Data Terhapus: Admin Arsip memulihkan dokumen; tanpa tombol pulihkan untuk izin", async () => {
  await ad.goto(`${APP}/terhapus`);
  await ad.click("[role=tab]:has-text('Dokumen')");
  const row = ad.locator("tbody tr", { hasText: "NPWP (contoh)" });
  await row.waitFor();
  await row.locator("button[aria-label='Aksi baris']").click();
  await ad.click("[role=menuitem]:has-text('Pulihkan')");
  await ad.click("[role=dialog] button:has-text('Pulihkan')");
  await toast(ad, "Data dipulihkan");
  await row.waitFor({ state: "detached" });
  await ad.click("[role=tab]:has-text('Perizinan')");
  await ad.waitForSelector("text=Tidak ada data terhapus");
});
await ad.close(); await adCtx.close();

const { page: pm } = await session("pimpinan@example.com");
await step("Pimpinan: boleh membaca Audit Log, tanpa menu Data Terhapus & Antrean Verifikasi", async () => {
  await pm.goto(`${APP}/audit`);
  await pm.waitForSelector("tbody tr >> text=Mengupload dokumen");
  if (await pm.locator("nav >> text=Data Terhapus").count()) throw new Error("menu data terhapus");
  if (await pm.locator("nav >> text=Antrean Verifikasi").count()) throw new Error("menu antrean");
  await pm.goto(`${APP}/terhapus`);
  await pm.waitForURL(/tidak-berwenang/);
});
await pm.close();

// ───────────────────────── Fase 6: QR, notifikasi, laporan, pencarian ─────────────────────────
const isPdf = (b) => b.subarray(0, 5).toString() === "%PDF-";
const isZip = (b) => b[0] === 0x50 && b[1] === 0x4b; // .xlsx = arsip zip
const isPng = (b) => b.subarray(1, 4).toString() === "PNG";
let liveCode = "";
let expiredCode = "";

({ page: ad, ctx: adCtx } = await session("adminarsip@example.com"));
await step("QR: kartu QR pada izin terbit, unduh PNG, halaman cetak label", async () => {
  await ad.goto(newLicenseUrl);
  const card = ad.locator("div.rounded-xl:has(h3:has-text('QR verifikasi'))");
  await card.waitFor();
  await ad.waitForFunction(() => { const i = document.querySelector("img[alt^='QR verifikasi izin']"); return i && i.complete && i.naturalWidth > 0; });
  liveCode = (await card.locator("p.font-mono").innerText()).trim();
  if (!/^[A-Z0-9]{12}$/.test(liveCode)) throw new Error(liveCode);
  const [dl] = await Promise.all([ad.waitForEvent("download"), card.locator("button:has-text('Unduh PNG')").click()]);
  if (!dl.suggestedFilename().endsWith(".png") || !isPng(readFileSync(await dl.path()))) throw new Error(dl.suggestedFilename());
  await shot(ad, "50-qr-card");
  const [printPage] = await Promise.all([ad.context().waitForEvent("page"), card.locator("a:has-text('Cetak label')").click()]);
  watch(printPage);
  await printPage.waitForSelector(`text=${liveCode}`);
  await printPage.waitForFunction(() => { const i = document.querySelector("img[alt='QR verifikasi']"); return i && i.complete && i.naturalWidth > 0; });
  await printPage.screenshot({ path: `${OUT}/51-cetak-label.png` });
  await printPage.close();
  expiredCode = await ad.evaluate(async () => {
    const t = JSON.parse(localStorage.getItem("sb-127-auth-token") ?? sessionStorage.getItem("sb-127-auth-token")).access_token;
    const r = await fetch("http://127.0.0.1:54321/rest/v1/licenses?select=verification_code&application_number=eq.PMH-2021-90003", {
      headers: { authorization: `Bearer ${t}`, apikey: "anon-key" } });
    return (await r.json())[0].verification_code;
  });
});
await ad.close(); await adCtx.close();

let pub, pubCtx;
({ page: pub, ctx: pubCtx } = await blankPage({ w: 390, h: 844 }));
await step("Publik (tanpa login, ponsel): QR izin aktif → sah & berlaku, tanpa data pribadi", async () => {
  await pub.goto(`${APP}/verify/${liveCode}`);
  await pub.waitForSelector("text=Izin sah dan berlaku");
  const body = await pub.locator("main").innerText();
  for (const want of ["503/UJI/E2E/2026", "CV Uji Sejahtera", "Izin Lokasi", "Berlaku sampai", liveCode]) if (!body.includes(want)) throw new Error(`tanpa "${want}"`);
  for (const secret of ["5304011234567890", "Maria Uji Coba"]) if (body.includes(secret)) throw new Error(`membocorkan ${secret}`);
  const overflow = await pub.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`overflow ${overflow}px`);
  await shot(pub, "52-verify-publik");
});
await step("Publik: izin berakhir, kode tidak dikenal, dan input kode manual", async () => {
  await pub.goto(`${APP}/verify/${expiredCode}`);
  await pub.waitForSelector("text=masa berlakunya telah habis");
  await pub.goto(`${APP}/verify/ZZZZZZZZZZZZ`);
  await pub.waitForSelector("text=Izin tidak ditemukan");
  await pub.goto(`${APP}/verify/abc`);
  await pub.waitForSelector("text=Format kode tidak valid");
  await pub.fill("#verify-code", liveCode.toLowerCase());
  await pub.click("button:has-text('Periksa')");
  await pub.waitForURL(new RegExp(`/verify/${liveCode}$`));
  await pub.waitForSelector("text=Izin sah dan berlaku");
});
await pubCtx.close();

({ page: pt, ctx: ptCtx } = await session("petugas@example.com"));
await step("Notifikasi: lonceng berisi jumlah belum dibaca; klik item membuka izin & mengurangi badge", async () => {
  const bell = pt.locator("button[aria-label^='Notifikasi']");
  await pt.waitForSelector("button[aria-label^='Notifikasi,']");
  const before = Number((await bell.getAttribute("aria-label")).match(/(\d+) belum/)[1]);
  if (before < 3) throw new Error(`badge ${before}`);
  await bell.click();
  await pt.waitForSelector("[role=menu] >> text=Dokumen ditolak");
  await shot(pt, "53-panel-notifikasi");
  await pt.click("[role=menu] [role=menuitem]:has-text('Izin diterbitkan')");
  await pt.waitForURL(newLicenseUrl);
  await pt.waitForFunction((b) => {
    const l = document.querySelector("button[aria-label^='Notifikasi']")?.getAttribute("aria-label") ?? "";
    const m = l.match(/(\d+) belum/);
    return (m ? Number(m[1]) : 0) === b - 1;
  }, before);
});
await step("Notifikasi: halaman daftar, saring belum dibaca, tandai semua dibaca, hapus", async () => {
  await pt.goto(`${APP}/notifikasi`);
  await pt.waitForSelector("li >> text=Dokumen ditolak");
  await pt.click("[role=tab]:has-text('Belum dibaca')");
  await pt.click("button:has-text('Tandai semua dibaca')");
  await toast(pt, "Semua notifikasi ditandai dibaca");
  await pt.waitForSelector("text=Semua notifikasi sudah dibaca");
  await pt.waitForSelector("button[aria-label='Notifikasi']");
  await pt.click("[role=tab]:has-text('Semua')");
  const n0 = await pt.locator("main li").count();
  await pt.click("main li >> nth=0 >> button[aria-label^='Hapus notifikasi']");
  await pt.waitForFunction((n) => document.querySelectorAll("main li").length === n - 1, n0);
});
await step("Laporan: Petugas boleh melihat tanpa tombol ekspor", async () => {
  await pt.goto(`${APP}/laporan`);
  await pt.waitForSelector("text=Rekapitulasi Perizinan per Jenis Izin");
  await pt.waitForSelector("text=Ekspor laporan tersedia untuk Admin Arsip dan Pimpinan.");
  if (await pt.locator("button:has-text('Excel')").count()) throw new Error("tombol ekspor tampil");
});
await pt.close(); await ptCtx.close();

const { page: pm2, ctx: pm2Ctx } = await session("pimpinan@example.com");
await step("Laporan rekap: tabel + total, grafik bulanan 12 bulan dengan tooltip", async () => {
  await pm2.goto(`${APP}/laporan`);
  await pm2.waitForSelector("tfoot >> text=Jumlah");
  await pm2.waitForSelector("figure svg[role=img]");
  if ((await pm2.locator("figure svg g[role=button]").count()) !== 12) throw new Error("bukan 12 bulan");
  const month = new Date().getMonth();
  await pm2.locator("figure svg g[role=button]").nth(month).hover();
  await pm2.waitForSelector("[role=tooltip] >> text=Permohonan masuk");
  await pm2.click("button:has-text('Lihat tabel')");
  await pm2.waitForSelector("figure table >> text=Desember");
  await shot(pm2, "54-laporan-rekap");
});
await step("Laporan: ekspor Excel, PDF, CSV (di bawah CSP produksi)", async () => {
  for (const [label, check] of [["Excel", (b, n) => isZip(b) && n.endsWith(".xlsx")], ["PDF", (b, n) => isPdf(b) && n.endsWith(".pdf")], ["CSV", (b, n) => n.endsWith(".csv") && b.toString("utf8").includes("Jenis izin;Dalam proses")]]) {
    const [dl] = await Promise.all([pm2.waitForEvent("download", { timeout: 20000 }), pm2.click(`button:has-text('${label}')`)]);
    const buf = readFileSync(await dl.path());
    if (!check(buf, dl.suggestedFilename()) || buf.length < (label === "CSV" ? 50 : 500)) throw new Error(`${label}: ${dl.suggestedFilename()} ${buf.length}B`);
    if (label === "PDF") writeFileSync(`${OUT}/laporan.pdf`, buf);
    if (label === "Excel") writeFileSync(`${OUT}/laporan.xlsx`, buf);
  }
});
await step("Laporan izin terbit & masa berlaku & dokumen; filter tersimpan di URL", async () => {
  await pm2.click("[role=tab]:has-text('Izin terbit')");
  await pm2.waitForURL(/jenis=terbit/);
  await pm2.waitForSelector("tbody >> text=503/UJI/E2E/2026");
  await pm2.click("[role=tab]:has-text('Masa berlaku')");
  await pm2.waitForSelector("text=/Izin Akan Berakhir dalam 30 Hari/");
  await pm2.selectOption("label:has-text('Tampilkan') select", "sudah");
  await pm2.fill("label:has-text('Dari tanggal') input", "2020-01-01");
  await pm2.waitForSelector("tbody >> text=IZIN/IL/0003/2021");
  await pm2.click("[role=tab]:has-text('Dokumen arsip')");
  await pm2.waitForSelector("text=Rekapitulasi Dokumen Arsip");
  await pm2.waitForSelector("tfoot >> text=Jumlah");
});
await pm2Ctx.close();

({ page: sa, ctx: saCtx } = await session("superadmin@example.com"));
await step("Pencarian: cari cepat di topbar → hasil Perizinan & Dokumen dengan jumlah", async () => {
  await sa.fill("header input[type=search]", "Maria");
  await sa.press("header input[type=search]", "Enter");
  await sa.waitForURL(/\/pencarian\?q=Maria/);
  await sa.waitForSelector("tbody >> text=503/UJI/E2E/2026");
  const tabs = await sa.locator("[role=tablist][aria-label='Hasil pencarian']").innerText();
  if (!/Perizinan\s*1/.test(tabs) || /Dokumen\s*…/.test(tabs)) throw new Error(tabs);
  await sa.click("[role=tab]:has-text('Dokumen')");
  await sa.waitForSelector("tbody >> text=KTP Maria Uji Coba");
  await shot(sa, "55-pencarian");
});
await step("Pencarian lanjutan: NIB tepat + status, tanpa kata kunci", async () => {
  await sa.goto(`${APP}/pencarian`);
  await sa.waitForSelector("text=Masukkan kata kunci atau pilih filter");
  await sa.click("button:has-text('Filter')");
  await sa.fill("label:has-text('NIB (tepat)') input", "9120001234567");
  await sa.selectOption("label:has-text('Status izin') select", "AKTIF");
  await sa.click("button:has-text('Terapkan')");
  await sa.waitForURL(/nib=9120001234567/);
  await sa.waitForSelector("tbody >> text=503/UJI/E2E/2026");
  if ((await sa.locator("tbody tr").count()) !== 1) throw new Error("hasil lebih dari satu");
});
await step("Dashboard: kartu akan berakhir & tautan menunggu verifikasi", async () => {
  await sa.goto(`${APP}/`);
  await sa.waitForSelector("a[aria-label^='Akan Berakhir (30 hari)']");
  await sa.click("a[aria-label^='Menunggu Verifikasi']");
  await sa.waitForURL(/\/verifikasi/);
});
await sa.close(); await saCtx.close();

({ page: vw, ctx: vwCtx } = await session("viewer@example.com"));
await step("Viewer: pencarian dokumen hanya Surat Izin; tanpa filter NIK", async () => {
  await vw.goto(`${APP}/pencarian?q=Surat&tab=dokumen`);
  await vw.waitForSelector("tbody tr >> text=Surat Izin");
  const types = await vw.locator("tbody tr td:nth-child(2)").allInnerTexts();
  if (types.some((t) => t !== "Surat Izin")) throw new Error(types.join(","));
  await vw.click("button:has-text('Filter')");
  if (await vw.locator("text=NIK pemohon (tepat)").count()) throw new Error("filter NIK tampil");
});
await vw.close(); await vwCtx.close();

// ───────────────────────── Super Admin: hapus + mobile ─────────────────────────
({ page: sa, ctx: saCtx } = await session("superadmin@example.com", { w: 390, h: 844 }));
await step("Mobile 390px: daftar & detail tanpa scroll horizontal halaman", async () => {
  await sa.goto(`${APP}/perizinan`);
  await sa.waitForSelector("tbody tr");
  const overflow = await sa.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`overflow ${overflow}px`);
  await shot(sa, "20-mobile-list");
  await sa.goto(newLicenseUrl);
  await sa.waitForSelector("text=Data izin");
  const o2 = await sa.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (o2 > 1) throw new Error(`overflow detail ${o2}px`);
  await shot(sa, "21-mobile-detail");
});
await step("SA: hapus lunak izin → hilang dari daftar", async () => {
  await sa.goto(newLicenseUrl);
  await sa.click("button:has-text('Hapus')");
  await sa.click("[role=dialog] button:has-text('Hapus')");
  await sa.waitForURL(`${APP}/perizinan`);
  await toast(sa, "Data perizinan dihapus");
  if ((await sa.locator("tbody").innerText()).includes("503/UJI/E2E/2026")) throw new Error("masih tampil");
});
await step("SA: pulihkan izin dari Data Terhapus → kembali di Data Perizinan", async () => {
  await sa.goto(`${APP}/terhapus`);
  const row = sa.locator("tbody tr", { hasText: "503/UJI/E2E/2026" });
  await row.waitFor();
  await row.locator("button[aria-label='Aksi baris']").click();
  await sa.click("[role=menuitem]:has-text('Pulihkan')");
  await sa.click("[role=dialog] button:has-text('Pulihkan')");
  await toast(sa, "Data dipulihkan");
  await sa.goto(`${APP}/perizinan?q=503%2FUJI`);
  await sa.waitForSelector("tbody tr >> text=503/UJI/E2E/2026");
});
// ───────────────────────── Fase 7: pengaturan, integritas, ketahanan ─────────────────────────
const db = new pg.Pool({ host: process.env.PGHOST || "/tmp", port: Number(process.env.PGPORT || 54329), user: "postgres", database: "sipar", max: 2 });
const STORE = new URL("./.storage/perizinan-documents/", import.meta.url).pathname;

await step("Pengaturan: nilai di luar batas ditolak; perubahan tersimpan dan dipakai di kop laporan", async () => {
  await sa.setViewportSize({ width: 1366, height: 860 });
  await sa.goto(`${APP}/pengaturan`);
  const days = sa.getByLabel("Peringatan masa berlaku (hari)");
  await days.waitFor();
  await sa.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value.includes("Kabupaten Belu")));
  await days.fill("500");
  await sa.click("button:has-text('Simpan')");
  await sa.waitForSelector("text=Jumlah hari harus 1–365");
  await days.fill("45");
  await sa.getByLabel("Nama instansi").fill("Dinas PMPTSP Kabupaten Belu (Uji E2E)");
  await sa.click("button:has-text('Simpan')");
  await toast(sa, "2 pengaturan disimpan");
  await sa.reload();
  await sa.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value === "45"));
  await sa.goto(`${APP}/laporan`);
  await sa.waitForSelector("text=Dinas PMPTSP Kabupaten Belu (Uji E2E)");
  const audit = await db.query("select count(*)::int c from audit_logs where module = 'system_settings' and action = 'UPDATE'");
  if (audit.rows[0].c < 2) throw new Error("perubahan pengaturan tidak tercatat di audit");
  await shot(sa, "40-pengaturan");
});

await step("Admin Arsip tidak dapat membuka Pengaturan", async () => {
  const { page, ctx } = await session("adminarsip@example.com");
  await page.goto(`${APP}/pengaturan`);
  await page.waitForURL(`${APP}/tidak-berwenang`);
  if (await page.locator("nav[aria-label='Menu utama'] >> text=Pengaturan").count()) throw new Error("menu Pengaturan tampil");
  await ctx.close();
});

let orphanOld = "", orphanNew = "", lostPath = "";
await step("Integritas penyimpanan: file yatim terdeteksi & dihapus; versi tanpa file dilaporkan", async () => {
  const lic = (await db.query("select id, year from licenses where deleted_at is null order by created_at limit 1")).rows[0];
  const put = async (name, age) => {
    const path = `${lic.year}/${lic.id}/ktp/${crypto.randomUUID()}-${name}`;
    await db.query(`insert into storage.objects (bucket_id, name, metadata, created_at) values ('perizinan-documents', $1, '{"size":4,"mimetype":"application/pdf"}', now() - $2::interval)`, [path, age]);
    mkdirp(dirname(STORE + path), { recursive: true });
    writeFileSync(STORE + path, "%PDF");
    writeFileSync(STORE + path + ".meta.json", JSON.stringify({ size: 4, mimetype: "application/pdf" }));
    return path;
  };
  orphanOld = await put("yatim-lama.pdf", "2 hours");
  orphanNew = await put("yatim-baru.pdf", "1 minute");
  lostPath = (await db.query("select storage_path from document_versions order by uploaded_at limit 1")).rows[0].storage_path;
  await db.query("delete from storage.objects where name = $1", [lostPath]);

  await sa.goto(`${APP}/pengaturan`);
  await sa.click("button:has-text('Periksa sekarang')");
  await sa.waitForSelector(`td >> text=${orphanOld}`);
  const body = await sa.locator("tbody").last().innerText();
  for (const t of [orphanNew, lostPath, "Versi dokumen tanpa file", "baru diunggah"]) if (!body.includes(t)) throw new Error(`tidak tampil: ${t}`);
  if ((await sa.locator("tbody input[type=checkbox]").count()) !== 1) throw new Error("hanya file yatim > 1 jam yang boleh dipilih");
  await sa.click("input[aria-label='Pilih semua file yang dapat dihapus']");
  await sa.click("button:has-text('Hapus 1 file terpilih')");
  await sa.click("[role=dialog] button:has-text('Hapus permanen')");
  await toast(sa, "1 file dihapus");
  await sa.waitForFunction((p) => !document.body.innerText.includes(p), orphanOld);
  if (existsSync(STORE + orphanOld)) throw new Error("file fisik masih ada");
  const left = (await db.query("select count(*)::int c from storage.objects where name = any($1)", [[orphanOld, orphanNew]])).rows[0].c;
  if (left !== 1) throw new Error(`sisa objek ${left}`);
  await shot(sa, "41-integritas");
});

await step("Offline: spanduk koneksi muncul dan hilang kembali", async () => {
  await sa.context().setOffline(true);
  await sa.waitForSelector("text=Tidak ada koneksi internet");
  await sa.context().setOffline(false);
  await sa.waitForSelector("text=Tidak ada koneksi internet", { state: "detached" });
});

await step("Deploy baru: file halaman lama hilang → muat ulang otomatis sekali, lalu halaman terbuka", async () => {
  await sa.goto(`${APP}/`);
  await sa.waitForSelector("text=Total Perizinan");
  await sa.evaluate(() => sessionStorage.removeItem("sipar.chunk-reload-at"));
  let blocked = 0;
  await sa.route(/\/assets\/AuditLogPage-[^/]+\.js$/, (r) => (blocked++ === 0 ? r.fulfill({ status: 404, body: "" }) : r.continue()));
  await sa.click("nav[aria-label='Menu utama'] >> text=Audit Log");
  await sa.waitForSelector("h2:text-is('Audit Log')", { timeout: 15000 });
  const navType = await sa.evaluate(() => performance.getEntriesByType("navigation")[0].type);
  if (navType !== "reload" || blocked < 2) throw new Error(`tidak dimuat ulang (type=${navType}, blocked=${blocked})`);
  await sa.unroute(/\/assets\/AuditLogPage-[^/]+\.js$/);
});

await step("Galat pemuatan berulang: pesan ramah di dalam tata letak, tanpa loop muat ulang", async () => {
  await sa.goto(`${APP}/`);
  await sa.waitForSelector("text=Total Perizinan");
  await sa.route(/\/assets\/TrashPage-[^/]+\.js$/, (r) => r.fulfill({ status: 404, body: "" }));
  await sa.click("nav[aria-label='Menu utama'] >> text=Data Terhapus");
  await sa.waitForSelector("text=Aplikasi baru saja diperbarui", { timeout: 15000 });
  if (!(await sa.locator("nav[aria-label='Menu utama']").isVisible())) throw new Error("sidebar hilang");
  await shot(sa, "42-galat-rute");
  await sa.unroute(/\/assets\/TrashPage-[^/]+\.js$/);
  await sa.click("button:has-text('Muat ulang')");
  await sa.waitForSelector("h2:text-is('Data Terhapus')");
});
await db.end();
await sa.close(); await saCtx.close();

console.log(results.join("\n"));
console.log("\nPROBLEMS:", problems.length ? "\n" + problems.join("\n") : "none");
await browser.close();
server.close();
