// Uji end-to-end UI terhadap Postgres + PostgREST lokal (RLS sungguhan). Lihat tests/e2e/README.md.
// Pemakaian: node run.mjs <folder dist> <folder hasil screenshot>
import { chromium } from "playwright-core";
import http from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = process.argv[2];
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  let p = join(DIST, req.url.split("?")[0]);
  if (!existsSync(p) || p === DIST || !extname(p)) p = join(DIST, "index.html");
  res.writeHead(200, { "content-type": mime[extname(p)] ?? "application/octet-stream" });
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

async function session(email, { w = 1366, h = 860 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
  const page = await ctx.newPage();
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
  await sa.fill("input[type=search]", "Contoh Dua");
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
await sa.close(); await saCtx.close();

console.log(results.join("\n"));
console.log("\nPROBLEMS:", problems.length ? "\n" + problems.join("\n") : "none");
await browser.close();
server.close();
