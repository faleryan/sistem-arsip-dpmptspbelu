// Uji migration + RLS + workflow SIPAR-BELU di PostgreSQL (PGlite).
// Jalankan:  cd supabase/tests && npm install && npm test
import { randomUUID } from "node:crypto";
import { bootDb, as, read } from "./lib.mjs";

const { db } = await bootDb();
await db.exec(read("seed.sql"));
await db.exec(read("seed_test_users.sql"));
if (process.env.MUTATE_SQL) await db.exec(process.env.MUTATE_SQL); // hanya untuk uji sensitivitas tes

// Pengguna tambahan untuk skenario
const U = {
  sa: { id: "11111111-1111-1111-1111-111111111101" },
  ad: { id: "11111111-1111-1111-1111-111111111102" },
  pt: { id: "11111111-1111-1111-1111-111111111103" },
  vf: { id: "11111111-1111-1111-1111-111111111104" },
  pm: { id: "11111111-1111-1111-1111-111111111105" },
  pt2: { id: "22222222-2222-2222-2222-222222222201" },
  vw: { id: "22222222-2222-2222-2222-222222222202" },
};
for (const [u, role, name] of [[U.pt2, "petugas", "Petugas Dua"], [U.vw, "viewer", "Viewer Uji"]]) {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.id, `${role}-${u.id.slice(-3)}@example.com`]);
  await db.query(`insert into public.profiles (id, full_name, role) values ($1, $2, $3)`, [u.id, name, role]);
}

// ── mini test runner ────────────────────────────────────────────────────────
let pass = 0;
const failures = [];
async function t(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
const group = (n) => console.log(`\n${n}`);
const ok = (c, msg = "kondisi tidak terpenuhi") => { if (!c) throw new Error(msg); };
const eq = (a, b, msg = "") => { if (a !== b) throw new Error(`${msg} diharapkan ${JSON.stringify(b)}, didapat ${JSON.stringify(a)}`); };
const q = (who, sql, params) => as(db, who, async () => (await db.query(sql, params)).rows);
const one = async (who, sql, params) => (await q(who, sql, params))[0];
const run = (who, sql, params) => as(db, who, () => db.query(sql, params));
async function denied(who, sql, params, re) {
  try { await run(who, sql, params); } catch (e) {
    if (re && !re.test(e.message)) throw new Error(`ditolak, tetapi pesan tak sesuai: ${e.message}`);
    return;
  }
  throw new Error(`seharusnya ditolak: ${sql.slice(0, 80)}`);
}
const affected = async (who, sql, params) => (await run(who, sql, params)).affectedRows ?? 0;

const licByApp = async (app) => (await one(null, `select * from public.licenses where application_number = $1`, [app]));
const status = async (id) => (await one(null, `select status from public.licenses where id = $1`, [id])).status;

/** Tiru unggahan Storage: baris storage.objects dibuat sebagai user (policy insert berlaku). */
async function putObject(who, path, size = 1000, mime = "application/pdf") {
  await run(who, `insert into storage.objects (bucket_id, name, owner, metadata) values ('perizinan-documents', $1, $2, $3)`,
    [path, who?.id ?? null, JSON.stringify({ size, mimetype: mime })]);
  return path;
}

async function addDoc(who, licId, typeCode, fileName = "berkas.pdf") {
  const lic = await one(null, `select year from public.licenses where id = $1`, [licId]);
  const dt = await one(null, `select id, storage_folder from public.document_types where code = $1`, [typeCode]);
  const d = await one(who, `insert into public.documents (license_id, document_type_id, title, status)
                            values ($1, $2, $3, 'TERVERIFIKASI') returning *`, [licId, dt.id, `${typeCode} uji`]);
  const path = await putObject(who, `${lic.year}/${licId}/${dt.storage_folder}/${randomUUID()}-${fileName}`);
  const v = await one(who, `insert into public.document_versions (document_id, file_name, storage_path, mime_type, size_bytes)
                            values ($1, $2, $3, 'application/pdf', 1000) returning *`,
    [d.id, fileName, path]);
  return { doc: d, ver: v };
}

// ── 0. Struktur ─────────────────────────────────────────────────────────────
group("Struktur & keamanan dasar");
await t("semua tabel public memakai RLS", async () => {
  const r = await q(null, `select tablename from pg_tables where schemaname = 'public' and not rowsecurity`);
  eq(r.length, 0, `tabel tanpa RLS: ${r.map((x) => x.tablename)}`);
});
await t("bucket perizinan-documents privat, 10 MB, hanya pdf/jpg/png", async () => {
  const b = await one(null, `select * from storage.buckets where id = 'perizinan-documents'`);
  eq(b.public, false); eq(Number(b.file_size_limit), 10485760);
  eq([...b.allowed_mime_types].sort().join(","), "application/pdf,image/jpeg,image/png");
});
await t("anon tidak punya akses ke tabel mana pun", async () => {
  for (const tb of ["licenses", "applicants", "documents", "profiles", "audit_logs", "notifications", "system_settings"]) {
    await denied("anon", `select * from public.${tb}`, [], /permission denied/);
  }
});
await t("anon tidak boleh memanggil RPC workflow", async () => {
  await denied("anon", `select public.change_license_status($1, 'DIAJUKAN')`, [randomUUID()], /permission denied/);
  await denied("anon", `select public.run_daily_license_maintenance()`, [], /permission denied/);
});
await t("user login tidak boleh memanggil fungsi internal", async () => {
  await denied(U.sa, `select public.run_daily_license_maintenance()`, [], /permission denied/);
  await denied(U.sa, `select public.notify_user($1, 'x', 'x', 'x', 'x')`, [U.pt.id], /permission denied/);
});
await t("seed.sql idempotent (dijalankan ulang tanpa duplikasi)", async () => {
  const before = (await one(null, `select (select count(*) from licenses) l, (select count(*) from documents) d, (select count(*) from applicants) a`));
  await db.exec(read("seed.sql"));
  const after = (await one(null, `select (select count(*) from licenses) l, (select count(*) from documents) d, (select count(*) from applicants) a`));
  eq(JSON.stringify(after), JSON.stringify(before));
});

// ── 1. Halaman publik QR ────────────────────────────────────────────────────
group("Verifikasi QR publik");
const aktif = await licByApp("PMH-2026-90001");
const draft = await licByApp("PMH-2026-90004");
await t("kode valid → hanya 6 kolom aman, tanpa NIK/NPWP", async () => {
  const r = await q("anon", `select * from public.verify_license($1)`, [aktif.verification_code]);
  eq(r.length, 1);
  eq(Object.keys(r[0]).sort().join(","), "agency,holder_name,issue_date,license_number,license_type,status");
  eq(r[0].holder_name, "PT Contoh Belu Sejahtera");
  eq(r[0].status, "AKTIF");
  ok(/Belu/.test(r[0].agency));
});
await t("kode huruf kecil tetap valid", async () => {
  eq((await q("anon", `select * from public.verify_license($1)`, [aktif.verification_code.toLowerCase()])).length, 1);
});
await t("kode tidak ada / format salah / izin DRAFT → tidak ditemukan", async () => {
  eq((await q("anon", `select * from public.verify_license('ZZZZZZZZZZZZ')`)).length, 0);
  eq((await q("anon", `select * from public.verify_license($1)`, ["' or 1=1 --"])).length, 0);
  eq((await q("anon", `select * from public.verify_license($1)`, [draft.verification_code])).length, 0);
});
await t("izin untuk perusahaan memakai nama perusahaan; perorangan memakai nama pemohon", async () => {
  const p = await licByApp("PMH-2021-90003");
  const r = await q("anon", `select * from public.verify_license($1)`, [p.verification_code]);
  eq(r[0].holder_name, "Pemohon Contoh Tiga");
  eq(r[0].status, "BERAKHIR");
});

// ── 2. Pimpinan: read-only ──────────────────────────────────────────────────
group("Pimpinan (read-only)");
await t("pimpinan dapat membaca izin, dokumen, dan audit log", async () => {
  eq((await q(U.pm, `select * from public.licenses`)).length, 6);
  ok((await q(U.pm, `select * from public.documents`)).length > 0);
  ok((await q(U.pm, `select * from public.audit_logs`)).length > 0);
});
await t("pimpinan tidak dapat menulis apa pun", async () => {
  await denied(U.pm, `insert into public.applicants (full_name) values ('x')`, [], /row-level security/);
  eq(await affected(U.pm, `update public.licenses set notes = 'x'`), 0);
  eq(await affected(U.pm, `update public.documents set title = 'x'`), 0);
  await denied(U.pm, `select public.change_license_status($1, 'DIAJUKAN')`, [draft.id], /tidak (berwenang|diizinkan)/);
});

// ── 3. Petugas ──────────────────────────────────────────────────────────────
group("Petugas: pembuatan & batasan");
let L1; // izin yang dibuat petugas
await t("petugas membuat pemohon dan izin DRAFT; nomor permohonan & kode verifikasi dibuat server", async () => {
  const a = await one(U.pt, `insert into public.applicants (full_name, nik) values ('Pemohon Uji Petugas', '5301999999999999') returning id`);
  const type = await one(null, `select id from public.license_types where code = 'IU'`);
  L1 = await one(U.pt, `insert into public.licenses (license_type_id, applicant_id, verification_code)
                        values ($1, $2, 'AAAAAAAAAAAA') returning *`, [type.id, a.id]);
  ok(/^PMH-\d{4}-\d{5}$/.test(L1.application_number), `nomor: ${L1.application_number}`);
  eq(L1.status, "DRAFT");
  eq(L1.officer_id, U.pt.id); eq(L1.created_by, U.pt.id);
  ok(/^[A-Z0-9]{12}$/.test(L1.verification_code) && L1.verification_code !== "AAAAAAAAAAAA", "kode verifikasi harus dibuat server");
});
await t("created_by tidak dapat dipalsukan", async () => {
  const type = await one(null, `select id from public.license_types where code = 'IL'`);
  const a = await one(null, `select id from public.applicants limit 1`);
  const r = await one(U.pt, `insert into public.licenses (license_type_id, applicant_id, created_by) values ($1, $2, $3) returning created_by`, [type.id, a.id, U.sa.id]);
  eq(r.created_by, U.pt.id);
});
await t("petugas tidak dapat membuat izin berstatus selain DRAFT", async () => {
  const type = await one(null, `select id from public.license_types where code = 'IU'`);
  const a = await one(null, `select id from public.applicants limit 1`);
  // Ditolak oleh trigger penjaga atau RLS — keduanya valid.
  await denied(U.pt, `insert into public.licenses (license_type_id, applicant_id, status) values ($1, $2, 'AKTIF')`, [type.id, a.id], /row-level security|DRAFT tanpa data penerbitan/);
  await denied(U.pt, `insert into public.licenses (license_type_id, applicant_id, license_number) values ($1, $2, 'X/1')`, [type.id, a.id], /DRAFT tanpa data penerbitan/);
});
await t("petugas dapat mengubah data izin miliknya, tidak dapat mengubah status/nomor/kode langsung", async () => {
  eq(await affected(U.pt, `update public.licenses set notes = 'catatan' where id = $1`, [L1.id]), 1);
  await denied(U.pt, `update public.licenses set status = 'AKTIF' where id = $1`, [L1.id], /change_license_status/);
  await denied(U.pt, `update public.licenses set license_number = 'X/9' where id = $1`, [L1.id], /Admin Arsip/);
  await denied(U.pt, `update public.licenses set verification_code = 'BBBBBBBBBBBB' where id = $1`, [L1.id], /tidak dapat diubah/);
  await denied(U.pt, `update public.licenses set officer_id = $2 where id = $1`, [L1.id, U.pt2.id], /Admin Arsip/);
});
await t("petugas tidak dapat mengubah/memproses izin milik orang lain", async () => {
  eq(await affected(U.pt2, `update public.licenses set notes = 'x' where id = $1`, [L1.id]), 0);
  await denied(U.pt2, `select public.change_license_status($1, 'DIAJUKAN')`, [L1.id], /miliknya/);
  eq(await affected(U.pt, `update public.licenses set notes = 'x' where id = $1`, [draft.id]), 0);
});
await t("petugas tidak dapat soft delete izin/pemohon", async () => {
  await denied(U.pt, `update public.licenses set deleted_at = now() where id = $1`, [L1.id], /tidak berwenang/);
  await denied(U.pt, `update public.applicants set deleted_at = now() where id = $1`, [L1.applicant_id], /tidak berwenang/);
});
await t("tidak ada hard delete untuk siapa pun lewat API", async () => {
  for (const who of [U.sa, U.ad, U.pt]) {
    eq(await affected(who, `delete from public.licenses where id = $1`, [L1.id]).catch(() => -1) <= 0, true);
  }
  eq((await q(null, `select 1 from public.licenses where id = $1`, [L1.id])).length, 1);
});
await t("tabel riwayat/verifikasi/audit tidak dapat ditulis langsung", async () => {
  await denied(U.sa, `insert into public.license_status_history (license_id, to_status) values ($1, 'AKTIF')`, [L1.id], /permission denied/);
  await denied(U.vf, `insert into public.document_verifications (document_version_id, result) values ($1, 'TERVERIFIKASI')`, [randomUUID()], /permission denied/);
  await denied(U.sa, `update public.audit_logs set action = 'x'`, [], /permission denied/);
  await denied(U.sa, `delete from public.audit_logs`, [], /permission denied/);
});

group("Dokumen & versioning");
let docA, v1, v2;
await t("petugas membuat dokumen; status dipaksa MENUNGGU; versi pertama = 1 dan menjadi current", async () => {
  const r = await addDoc(U.pt, L1.id, "KTP", "ktp.pdf");
  docA = r.doc; v1 = r.ver;
  eq(docA.status, "MENUNGGU_VERIFIKASI");
  eq(v1.version_no, 1); eq(v1.is_current, true); eq(v1.uploaded_by, U.pt.id);
  eq((await one(null, `select current_version_id from public.documents where id = $1`, [docA.id])).current_version_id, v1.id);
});
await t("versi baru: nomor naik, versi lama tetap tersimpan namun bukan current", async () => {
  const p2 = await putObject(U.pt, `${L1.year}/${L1.id}/ktp/${randomUUID()}-ktp-baru.pdf`, 2000);
  v2 = await one(U.pt, `insert into public.document_versions (document_id, file_name, storage_path, mime_type, size_bytes)
                        values ($1, 'ktp-baru.pdf', $2, 'application/pdf', 2000) returning *`,
    [docA.id, p2]);
  eq(v2.version_no, 2); eq(v2.is_current, true);
  const all = await q(null, `select version_no, is_current from public.document_versions where document_id = $1 order by version_no`, [docA.id]);
  eq(JSON.stringify(all), JSON.stringify([{ version_no: 1, is_current: false }, { version_no: 2, is_current: true }]));
  eq((await one(null, `select current_version_id from public.documents where id = $1`, [docA.id])).current_version_id, v2.id);
});
await t("versi tidak dapat diubah atau dihapus oleh user", async () => {
  await denied(U.sa, `update public.document_versions set file_name = 'x.pdf'`, [], /permission denied/);
  await denied(U.sa, `delete from public.document_versions`, [], /permission denied/);
});
await t("status/versi aktif dokumen tidak dapat diubah langsung", async () => {
  await denied(U.pt, `update public.documents set status = 'TERVERIFIKASI' where id = $1`, [docA.id], /tidak dapat diubah langsung/);
  await denied(U.pt, `update public.documents set current_version_id = $2 where id = $1`, [docA.id, v1.id], /tidak dapat diubah langsung/);
  eq(await affected(U.pt, `update public.documents set document_number = 'NO-1' where id = $1`, [docA.id]), 1);
});
await t("lokasi file harus cocok dengan izin & jenis dokumen; MIME/ukuran/ekstensi divalidasi", async () => {
  const other = `2026/${randomUUID()}/ktp/${randomUUID()}-x.pdf`;
  await denied(U.pt, `insert into public.document_versions (document_id, file_name, storage_path, mime_type, size_bytes) values ($1, 'x.pdf', $2, 'application/pdf', 10)`, [docA.id, other], /Lokasi file/);
  const wrongFolder = `${L1.year}/${L1.id}/npwp/${randomUUID()}-x.pdf`;
  await denied(U.pt, `insert into public.document_versions (document_id, file_name, storage_path, mime_type, size_bytes) values ($1, 'x.pdf', $2, 'application/pdf', 10)`, [docA.id, wrongFolder], /Lokasi file/);
  // Objek terunggah tanpa metadata → yang diuji di sini adalah CHECK constraint tabel.
  const p = `${L1.year}/${L1.id}/ktp/${randomUUID()}-x.pdf`;
  await run(U.pt, `insert into storage.objects (bucket_id, name, owner) values ('perizinan-documents', $1, $2)`, [p, U.pt.id]);
  await denied(U.pt, `insert into public.document_versions (document_id, file_name, storage_path, mime_type, size_bytes) values ($1, 'x.pdf', $2, 'text/html', 10)`, [docA.id, p], /check/);
  await denied(U.pt, `insert into public.document_versions (document_id, file_name, storage_path, mime_type, size_bytes) values ($1, 'x.exe', $2, 'application/pdf', 10)`, [docA.id, p], /check/);
  await denied(U.pt, `insert into public.document_versions (document_id, file_name, storage_path, mime_type, size_bytes) values ($1, 'x.pdf', $2, 'application/pdf', 10485761)`, [docA.id, p], /check/);
});
await t("petugas lain tidak dapat menambah dokumen pada izin yang bukan miliknya", async () => {
  const dt = await one(null, `select id from public.document_types where code = 'KTP'`);
  await denied(U.pt2, `insert into public.documents (license_id, document_type_id, title) values ($1, $2, 'x')`, [L1.id, dt.id], /row-level security/);
});
await t("petugas tidak dapat soft delete dokumen; Admin Arsip dapat", async () => {
  await denied(U.pt, `update public.documents set deleted_at = now() where id = $1`, [docA.id], /tidak berwenang/);
  const tmp = await addDoc(U.pt, L1.id, "DOK_PENDUKUNG", "tmp.pdf");
  eq(await affected(U.ad, `update public.documents set deleted_at = now() where id = $1`, [tmp.doc.id]), 1);
  eq((await q(U.pt, `select 1 from public.documents where id = $1`, [tmp.doc.id])).length, 0);
  eq((await q(U.ad, `select 1 from public.documents where id = $1`, [tmp.doc.id])).length, 1);
});

group("Workflow status & verifikasi");
await t("petugas mengajukan izin miliknya (DRAFT→DIAJUKAN); riwayat & notifikasi verifikator tercatat", async () => {
  const r = await one(U.pt, `select * from public.change_license_status($1, 'DIAJUKAN')`, [L1.id]);
  eq(r.status, "DIAJUKAN");
  const h = await q(null, `select from_status, to_status from public.license_status_history where license_id = $1 order by changed_at, id`, [L1.id]);
  eq(h.length >= 2, true);
  ok((await q(U.vf, `select 1 from public.notifications where type = 'izin_diajukan'`)).length >= 1, "verifikator harus dapat notifikasi");
});
await t("transisi tidak sah ditolak (loncat status, role salah)", async () => {
  await denied(U.pt, `select public.change_license_status($1, 'DITERBITKAN')`, [L1.id], /tidak diizinkan/);
  await denied(U.pt, `select public.change_license_status($1, 'VERIFIKASI')`, [L1.id], /tidak berwenang/);
  await denied(U.ad, `select public.change_license_status($1, 'DISETUJUI')`, [L1.id], /tidak diizinkan/);
});
await t("petugas masih boleh mengunggah dokumen saat DIAJUKAN; verifikasi oleh non-verifikator ditolak", async () => {
  await addDoc(U.pt, L1.id, "SURAT_PERMOHONAN", "sp.pdf");
  await addDoc(U.pt, L1.id, "NIB", "nib.pdf");
  await addDoc(U.pt, L1.id, "NPWP", "npwp.pdf");
  await denied(U.pt, `select public.verify_document($1, 'TERVERIFIKASI')`, [v2.id], /Hanya Verifikator/);
  await denied(U.ad, `select public.verify_document($1, 'TERVERIFIKASI')`, [v2.id], /Hanya Verifikator/);
});
await t("verifikasi: tolak tanpa alasan ditolak; versi lama tidak dapat diverifikasi", async () => {
  await denied(U.vf, `select public.verify_document($1, 'DITOLAK')`, [v2.id], /Alasan penolakan wajib/);
  await denied(U.vf, `select public.verify_document($1, 'DITOLAK', '   ')`, [v2.id], /Alasan penolakan wajib/);
  await denied(U.vf, `select public.verify_document($1, 'TERVERIFIKASI')`, [v1.id], /versi terbaru/);
});
await t("verifikator menolak dengan alasan → status dokumen DITOLAK, izin otomatis VERIFIKASI, pengunggah diberi tahu", async () => {
  await one(U.vf, `select public.verify_document($1, 'DITOLAK', 'Dokumen tidak terbaca.')`, [v2.id]);
  eq((await one(null, `select status from public.documents where id = $1`, [docA.id])).status, "DITOLAK");
  eq(await status(L1.id), "VERIFIKASI");
  const n = await q(U.pt, `select * from public.notifications where type = 'dokumen_ditolak'`);
  ok(n.length === 1 && /tidak terbaca/.test(n[0].body));
  const vr = await one(null, `select verified_by, note from public.document_verifications where document_version_id = $1`, [v2.id]);
  eq(vr.verified_by, U.vf.id); eq(vr.note, "Dokumen tidak terbaca.");
});
await t("unggah ulang (versi 3) mengembalikan status MENUNGGU; petugas masih boleh unggah saat VERIFIKASI", async () => {
  const p3 = await putObject(U.pt, `${L1.year}/${L1.id}/ktp/${randomUUID()}-ktp-v3.pdf`, 3000);
  const v3 = await one(U.pt, `insert into public.document_versions (document_id, file_name, storage_path, mime_type, size_bytes)
                              values ($1, 'ktp-v3.pdf', $2, 'application/pdf', 3000) returning *`,
    [docA.id, p3]);
  eq(v3.version_no, 3);
  eq((await one(null, `select status from public.documents where id = $1`, [docA.id])).status, "MENUNGGU_VERIFIKASI");
  v2 = v3;
});
await t("DISETUJUI ditolak selama dokumen wajib belum terverifikasi", async () => {
  await denied(U.vf, `select public.change_license_status($1, 'DISETUJUI')`, [L1.id], /dokumen wajib belum terverifikasi/);
});
await t("verifikator memverifikasi semua dokumen wajib → izin dapat DISETUJUI", async () => {
  const cur = await q(null, `select v.id from public.document_versions v join public.documents d on d.id = v.document_id
                              where d.license_id = $1 and v.is_current and d.status = 'MENUNGGU_VERIFIKASI' and d.deleted_at is null`, [L1.id]);
  eq(cur.length, 4);
  for (const c of cur) await one(U.vf, `select public.verify_document($1, 'TERVERIFIKASI')`, [c.id]);
  const done = await one(U.vf, `select * from public.change_license_status($1, 'DISETUJUI')`, [L1.id]);
  eq(done.status, "DISETUJUI");
  const comp = await one(U.ad, `select * from public.v_license_completeness where license_id = $1`, [L1.id]);
  eq(Number(comp.required_count), 4); eq(Number(comp.verified_count), 4);
});
await t("dokumen tidak dapat diverifikasi lagi setelah izin DISETUJUI", async () => {
  await denied(U.vf, `select public.verify_document($1, 'TERVERIFIKASI')`, [v2.id], /DIAJUKAN atau VERIFIKASI/);
});
await t("penerbitan: wajib nomor izin & tanggal terbit; hanya Admin Arsip; kedaluwarsa dihitung; kode verifikasi tetap", async () => {
  await denied(U.ad, `select public.change_license_status($1, 'DITERBITKAN')`, [L1.id], /Nomor izin dan tanggal terbit/);
  eq(await affected(U.pt, `update public.licenses set license_number = 'X' where id = $1`, [L1.id]), 0, "petugas tidak boleh mengubah izin yang sudah DISETUJUI");
  eq(await affected(U.ad, `update public.licenses set license_number = 'IZIN/IU/UJI/2026', issue_date = $2 where id = $1`, [L1.id, new Date().toISOString().slice(0, 10)]), 1);
  const code = (await one(null, `select verification_code from public.licenses where id = $1`, [L1.id])).verification_code;
  const r = await one(U.ad, `select * from public.change_license_status($1, 'DITERBITKAN')`, [L1.id]);
  eq(r.status, "AKTIF"); // tanggal terbit = hari ini → otomatis aktif
  ok(r.expiry_date, "expiry_date harus terisi dari masa berlaku jenis izin (60 bulan)");
  eq(r.verification_code, code);
  const h = (await q(null, `select to_status from public.license_status_history where license_id = $1 order by changed_at, id`, [L1.id])).map((x) => x.to_status);
  eq(h.slice(-2).join(">"), "DITERBITKAN>AKTIF");
  await denied(U.ad, `update public.licenses set verification_code = 'CCCCCCCCCCCC' where id = $1`, [L1.id], /tidak dapat diubah/);
});
await t("pencabutan wajib catatan dan hanya Super Admin", async () => {
  await denied(U.ad, `select public.change_license_status($1, 'DICABUT', 'x')`, [L1.id], /tidak berwenang/);
  await denied(U.sa, `select public.change_license_status($1, 'DICABUT')`, [L1.id], /Catatan wajib/);
  const r = await one(U.sa, `select * from public.change_license_status($1, 'DICABUT', 'Pelanggaran ketentuan')`, [L1.id]);
  eq(r.status, "DICABUT");
});

// ── 4. Admin Arsip & Super Admin ────────────────────────────────────────────
group("Admin Arsip & Super Admin");
await t("Admin Arsip dapat mengimpor arsip izin lama langsung berstatus AKTIF (tercatat di riwayat)", async () => {
  const type = await one(null, `select id from public.license_types where code = 'IT'`);
  const a = await one(null, `select id from public.applicants where nik = '5301000000000002'`);
  const r = await one(U.ad, `insert into public.licenses (license_number, license_type_id, applicant_id, issue_date, status)
                             values ('LAMA/2019/001', $1, $2, date '2019-05-05', 'AKTIF') returning *`, [type.id, a.id]);
  eq(r.year, 2019);
  eq((await one(null, `select count(*)::int c from public.license_status_history where license_id = $1`, [r.id])).c, 1);
});
await t("soft delete izin: hanya Super Admin; tersembunyi dari petugas, terlihat Admin Arsip", async () => {
  const tgt = await licByApp("PMH-2026-90004");
  await denied(U.ad, `update public.licenses set deleted_at = now() where id = $1`, [tgt.id], /tidak berwenang/);
  eq(await affected(U.sa, `update public.licenses set deleted_at = now() where id = $1`, [tgt.id]), 1);
  eq((await q(U.pt, `select 1 from public.licenses where id = $1`, [tgt.id])).length, 0);
  eq((await q(U.ad, `select 1 from public.licenses where id = $1`, [tgt.id])).length, 1);
  eq((await q(U.pt, `select 1 from public.v_license_search where id = $1`, [tgt.id])).length, 0);
  eq(await affected(U.sa, `update public.licenses set deleted_at = null where id = $1`, [tgt.id]), 1);
});
await t("master data: semua dapat baca, hanya Super Admin yang dapat ubah", async () => {
  ok((await q(U.pt, `select * from public.license_types`)).length >= 4);
  await denied(U.ad, `insert into public.license_types (code, name) values ('ZZ', 'Zz')`, [], /row-level security/);
  eq((await run(U.sa, `insert into public.license_types (code, name) values ('ZZ', 'Zz') returning id`)).rows.length, 1);
  eq(await affected(U.ad, `update public.districts set name = 'x'`), 0);
});

// ── 5. Viewer ───────────────────────────────────────────────────────────────
group("Viewer (akses terbatas)");
await t("viewer hanya melihat izin berstatus publik; tanpa pemohon/perusahaan/NIK", async () => {
  const pub = (await one(null, `select count(*)::int c from public.licenses where deleted_at is null and status in ('DITERBITKAN','AKTIF','BERAKHIR')`)).c;
  const seen = await q(U.vw, `select status from public.licenses`);
  eq(seen.length, pub);
  ok(seen.every((s) => ["DITERBITKAN", "AKTIF", "BERAKHIR"].includes(s.status)));
  eq((await q(U.vw, `select * from public.applicants`)).length, 0);
  eq((await q(U.vw, `select * from public.businesses`)).length, 0);
  eq((await q(U.vw, `select * from public.license_status_history`)).length, 0);
  eq((await q(U.vw, `select * from public.audit_logs`)).length, 0);
  eq((await q(U.vw, `select * from public.document_verifications`)).length, 0);
});
await t("v_license_search untuk viewer: baris publik saja, NIK/NPWP disamarkan; internal melihat NIK", async () => {
  const rows = await q(U.vw, `select * from public.v_license_search`);
  ok(rows.length > 0 && rows.every((r) => r.applicant_nik === null && r.applicant_npwp === null));
  ok(rows.every((r) => ["DITERBITKAN", "AKTIF", "BERAKHIR"].includes(r.status)));
  ok((await q(U.pt, `select applicant_nik from public.v_license_search where applicant_nik is not null`)).length > 0);
});
await t("viewer hanya melihat dokumen berjenis viewer_visible (Surat Izin)", async () => {
  const docs = await q(U.vw, `select dt.code from public.documents d join public.document_types dt on dt.id = d.document_type_id`);
  ok(docs.length > 0 && docs.every((d) => d.code === "SURAT_IZIN"), `jenis: ${[...new Set(docs.map((d) => d.code))]}`);
  ok((await q(U.vw, `select * from public.document_versions`)).length > 0);
});
await t("viewer tidak dapat menulis & tidak dapat memakai RPC workflow", async () => {
  await denied(U.vw, `insert into public.applicants (full_name) values ('x')`, [], /row-level security/);
  eq(await affected(U.vw, `update public.licenses set notes = 'x'`), 0);
  await denied(U.vw, `select public.change_license_status($1, 'DIAJUKAN')`, [draft.id], /tidak (berwenang|diizinkan)/);
  await denied(U.vw, `select public.verify_document($1, 'TERVERIFIKASI')`, [v2.id], /Hanya Verifikator/);
});
await t("v_staff dapat dibaca user aktif tanpa NIP/telepon/email", async () => {
  const r = await q(U.vw, `select * from public.v_staff`);
  ok(r.length >= 5);
  eq(Object.keys(r[0]).sort().join(","), "full_name,id,role,unit_id");
});

// ── 6. Profil & akun ────────────────────────────────────────────────────────
group("Profil & akun");
await t("user biasa hanya melihat profil sendiri; dapat ubah nama tetapi tidak role/status", async () => {
  eq((await q(U.pt, `select * from public.profiles`)).length, 1);
  eq(await affected(U.pt, `update public.profiles set full_name = 'Petugas Uji (ubah)', phone = '0812' where id = $1`, [U.pt.id]), 1);
  await denied(U.pt, `update public.profiles set role = 'super_admin' where id = $1`, [U.pt.id], /hanya dapat mengubah nama/);
  await denied(U.pt, `update public.profiles set is_active = false where id = $1`, [U.pt.id], /hanya dapat mengubah nama/);
  eq(await affected(U.pt, `update public.profiles set full_name = 'x' where id = $1`, [U.pm.id]), 0);
  await denied(U.pt, `insert into public.profiles (id, full_name, role) values (gen_random_uuid(), 'x', 'super_admin')`, [], /permission denied/);
});
await t("Super Admin dapat melihat semua profil & mengelola role; tidak dapat menghapus Super Admin terakhir", async () => {
  ok((await q(U.sa, `select * from public.profiles`)).length >= 7);
  eq(await affected(U.sa, `update public.profiles set role = 'verifikator' where id = $1`, [U.pt2.id]), 1);
  eq(await affected(U.sa, `update public.profiles set role = 'petugas' where id = $1`, [U.pt2.id]), 1);
  await denied(U.sa, `update public.profiles set role = 'viewer' where id = $1`, [U.sa.id], /terakhir/);
  await denied(U.sa, `update public.profiles set is_active = false where id = $1`, [U.sa.id], /terakhir/);
});
await t("akun nonaktif kehilangan seluruh akses data", async () => {
  await run(null, `update public.profiles set is_active = false where id = $1`, [U.pm.id]);
  try {
    eq((await q(U.pm, `select * from public.licenses`)).length, 0);
    eq((await q(U.pm, `select * from public.system_settings`)).length, 0);
    eq((await q(U.pm, `select * from public.v_staff`)).length, 0);
  } finally {
    await run(null, `update public.profiles set is_active = true where id = $1`, [U.pm.id]);
  }
});

// ── 7. Notifikasi ───────────────────────────────────────────────────────────
group("Notifikasi");
await t("user hanya melihat notifikasi sendiri; hanya status baca yang bisa diubah", async () => {
  const mine = await q(U.vf, `select * from public.notifications`);
  ok(mine.length > 0 && mine.every((n) => n.user_id === U.vf.id));
  await denied(U.vf, `update public.notifications set title = 'x'`, [], /permission denied/);
  eq(await affected(U.vf, `update public.notifications set is_read = true where id = $1`, [mine[0].id]), 1);
  eq(await affected(U.pt, `update public.notifications set is_read = true where id = $1`, [mine[0].id]), 0);
  await denied(U.vf, `insert into public.notifications (user_id, type, title) values ($1, 't', 't')`, [U.vf.id], /permission denied/);
});

// ── 8. Audit trail ──────────────────────────────────────────────────────────
group("Audit trail");
await t("aksi tercatat dengan pelaku, deskripsi, nilai lama/baru", async () => {
  const st = await one(U.sa, `select * from public.audit_logs where action = 'STATUS_CHANGE' and record_id = $1 order by id desc limit 1`, [L1.id]);
  ok(st && /→/.test(st.description) && st.user_name, "log perubahan status");
  const up = await one(U.sa, `select * from public.audit_logs where action = 'UPLOAD' limit 1`);
  ok(/^Mengupload dokumen: .+\(versi \d+\)$/.test(up.description), up.description);
  const vf = await one(U.sa, `select * from public.audit_logs where action = 'VERIFY' and user_id = $1 and description like 'Menolak dokumen:%' order by id desc limit 1`, [U.vf.id]);
  ok(vf && vf.user_name === "Verifikator Uji" && vf.user_role === "verifikator", "log verifikasi menyebut nama & role verifikator");
  const upd = await one(U.sa, `select * from public.audit_logs where action = 'UPDATE' and module = 'licenses' and new_value ? 'notes' limit 1`);
  ok(upd.old_value && upd.new_value && !("updated_at" in upd.new_value), "hanya kolom yang berubah");
});
await t("IP dan user-agent diambil dari header permintaan", async () => {
  await db.exec(`select set_config('request.headers', '{"x-forwarded-for":"10.1.2.3, 1.1.1.1","user-agent":"UnitTestAgent/1.0"}', false)`);
  try {
    await run(U.ad, `insert into public.applicants (full_name) values ('Pemohon Header Uji')`);
  } finally {
    await db.exec(`select set_config('request.headers', '', false)`);
  }
  const l = await one(U.sa, `select ip_address, user_agent from public.audit_logs where description like '%Pemohon Header Uji%'`);
  eq(l.ip_address, "10.1.2.3"); eq(l.user_agent, "UnitTestAgent/1.0");
});
await t("audit log hanya dapat dibaca Super Admin, Admin Arsip, dan Pimpinan", async () => {
  ok((await q(U.ad, `select 1 from public.audit_logs limit 1`)).length === 1);
  eq((await q(U.pt, `select 1 from public.audit_logs limit 1`)).length, 0);
  eq((await q(U.vf, `select 1 from public.audit_logs limit 1`)).length, 0);
});

group("service_role (Edge Function)");
await t("service_role tidak dibatasi penjaga API (membuat profil, memperbaiki data) namun tetap tercatat audit", async () => {
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email) values ($1, 'baru@example.com')`, [id]);
  await db.exec(`reset role; set role service_role;`);
  try {
    await db.query(`insert into public.profiles (id, full_name, role, email) values ($1, 'Dibuat Function', 'petugas', 'baru@example.com')`, [id]);
    await db.query(`update public.profiles set role = 'verifikator' where id = $1`, [id]);
  } finally { await db.exec(`reset role`); }
  eq((await one(null, `select role from public.profiles where id = $1`, [id])).role, "verifikator");
  ok((await q(U.sa, `select 1 from public.audit_logs where module = 'profiles' and record_id = $1`, [id])).length >= 2);
});

// ── 9. Storage ──────────────────────────────────────────────────────────────
group("Storage (policy bucket)");
const objPath = (lic, folder, name = `${randomUUID()}-f.pdf`) => `${lic.year}/${lic.id}/${folder}/${name}`;
const putObj = (who, name, bucket = "perizinan-documents") =>
  run(who, `insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)`, [bucket, name, who?.id ?? null]);
let L2; // izin DRAFT milik petugas untuk uji unggah
await t("petugas dapat mengunggah ke path yang benar pada izin yang boleh ia kelola", async () => {
  const type = await one(null, `select id from public.license_types where code = 'IU'`);
  const a = await one(null, `select id from public.applicants limit 1`);
  L2 = await one(U.pt, `insert into public.licenses (license_type_id, applicant_id) values ($1, $2) returning *`, [type.id, a.id]);
  await putObj(U.pt, objPath(L2, "ktp"));
  await putObj(U.pt, objPath(L2, "surat-izin", `${randomUUID()}-IZIN.PNG`));
});
await t("upload ditolak: path salah, folder salah, ekstensi salah, bucket lain, izin milik orang lain, izin sudah tidak boleh diubah", async () => {
  await denied(U.pt, `insert into storage.objects (bucket_id, name) values ('perizinan-documents', 'bebas/file.pdf')`, [], /row-level security/);
  await denied(U.pt, `insert into storage.objects (bucket_id, name) values ('perizinan-documents', $1)`, [objPath(L2, "folder-ngawur")], /row-level security/);
  await denied(U.pt, `insert into storage.objects (bucket_id, name) values ('perizinan-documents', $1)`, [objPath(L2, "ktp", `${randomUUID()}-evil.exe`)], /row-level security/);
  await denied(U.pt, `insert into storage.objects (bucket_id, name) values ('perizinan-documents', $1)`, [objPath(L2, "ktp", `../../x.pdf`)], /row-level security/);
  await denied(U.pt, `insert into storage.objects (bucket_id, name) values ('lain', $1)`, [objPath(L2, "ktp")], /row-level security|foreign key/);
  await denied(U.pt2, `insert into storage.objects (bucket_id, name) values ('perizinan-documents', $1)`, [objPath(L2, "ktp")], /row-level security/);
  await denied(U.pt, `insert into storage.objects (bucket_id, name) values ('perizinan-documents', $1)`, [objPath(L1, "ktp")], /row-level security/); // L1 sudah DICABUT
  await denied(U.vw, `insert into storage.objects (bucket_id, name) values ('perizinan-documents', $1)`, [objPath(L2, "ktp")], /row-level security/);
  await denied(U.pm, `insert into storage.objects (bucket_id, name) values ('perizinan-documents', $1)`, [objPath(L2, "ktp")], /row-level security/);
});
await t("arsip tidak dapat ditimpa atau dihapus oleh user mana pun", async () => {
  for (const who of [U.sa, U.ad, U.pt]) {
    eq(await affected(who, `update storage.objects set name = name || 'x'`), 0);
    eq(await affected(who, `delete from storage.objects`), 0);
  }
});
await t("baca file: internal semua; viewer hanya folder surat-izin pada izin publik", async () => {
  const pubLic = await licByApp("PMH-2026-90001");
  await run(null, `insert into storage.objects (bucket_id, name) values ('perizinan-documents', $1), ('perizinan-documents', $2), ('perizinan-documents', $3)`,
    [objPath(pubLic, "surat-izin", "izin-publik.pdf"), objPath(pubLic, "ktp", "ktp-publik.pdf"), objPath(L2, "surat-izin", "izin-draft.pdf")]);
  const names = async (who) => (await q(who, `select name from storage.objects where name like '%publik.pdf' or name like '%izin-draft.pdf'`)).map((r) => r.name.split("/").pop()).sort();
  eq((await names(U.vw)).join(","), "izin-publik.pdf");
  eq((await names(U.pt)).join(","), "izin-draft.pdf,izin-publik.pdf,ktp-publik.pdf");
  eq((await names(U.vf)).length, 3);
  eq((await q("anon", `select 1`)).length, 1);
  await denied("anon", `select * from storage.objects`, [], /permission denied/);
});

// ── 9b. Arsip digital (Fase 4) ──────────────────────────────────────────────
group("Arsip digital: unggah, metadata, pencarian");
let LA, docNew;
const SHA = "a".repeat(64);
const createDoc = (who, lic, typeId, path, size = 1000, mime = "application/pdf", checksum = SHA, title = "Dokumen uji") =>
  one(who, `select public.create_document($1, $2, $3, $4, $5, $6, $7, $8, 'NO/1', '2026-01-02', null) as id`,
    [lic.id, typeId, title, path.split("/").pop().replace(/^[0-9a-f-]{37}/, ""), path, mime, size, checksum]);
const typeOf = async (code) => one(null, `select id, storage_folder from public.document_types where code = $1`, [code]);
const pathFor = (lic, folder, name = "berkas.pdf") => `${lic.year}/${lic.id}/${folder}/${randomUUID()}-${name}`;

await t("create_document: dokumen + versi 1 tercatat sekaligus; checksum & metadata tersimpan", async () => {
  const a = await one(null, `select id from public.applicants limit 1`);
  const type = await one(null, `select id from public.license_types where code = 'IU'`);
  LA = await one(U.pt, `insert into public.licenses (license_type_id, applicant_id) values ($1, $2) returning *`, [type.id, a.id]);
  const ktp = await typeOf("KTP");
  const path = await putObject(U.pt, pathFor(LA, ktp.storage_folder, "ktp-scan.pdf"), 4321);
  docNew = (await createDoc(U.pt, LA, ktp.id, path, 4321)).id;
  const d = await one(null, `select * from public.documents where id = $1`, [docNew]);
  eq(d.status, "MENUNGGU_VERIFIKASI"); eq(d.document_number, "NO/1"); eq(d.created_by, U.pt.id);
  const v = await one(null, `select * from public.document_versions where id = $1`, [d.current_version_id]);
  eq(v.version_no, 1); eq(Number(v.size_bytes), 4321); eq(v.checksum_sha256, SHA); eq(v.uploaded_by, U.pt.id);
});
await t("file yang belum terunggah tidak dapat dicatat, dan tidak meninggalkan dokumen tanpa versi", async () => {
  const ktp = await typeOf("KTP");
  const before = (await one(null, `select count(*)::int c from public.documents where license_id = $1`, [LA.id])).c;
  await denied(U.pt, `select public.create_document($1, $2, 'x', 'x.pdf', $3, 'application/pdf', 10)`,
    [LA.id, ktp.id, pathFor(LA, ktp.storage_folder, "x.pdf")], /belum ada di penyimpanan/);
  eq((await one(null, `select count(*)::int c from public.documents where license_id = $1`, [LA.id])).c, before);
});
await t("ukuran dan jenis file harus sama dengan file yang terunggah", async () => {
  const ktp = await typeOf("KTP");
  const p1 = await putObject(U.pt, pathFor(LA, ktp.storage_folder, "a.pdf"), 5000);
  await denied(U.pt, `select public.create_document($1, $2, 'x', 'a.pdf', $3, 'application/pdf', 4000)`, [LA.id, ktp.id, p1], /Ukuran file/);
  const p2 = await putObject(U.pt, pathFor(LA, ktp.storage_folder, "b.pdf"), 5000, "image/png");
  await denied(U.pt, `select public.create_document($1, $2, 'x', 'b.pdf', $3, 'application/pdf', 5000)`, [LA.id, ktp.id, p2], /Jenis file/);
});
await t("checksum harus SHA-256 heksadesimal; judul wajib", async () => {
  const ktp = await typeOf("KTP");
  const p = await putObject(U.pt, pathFor(LA, ktp.storage_folder, "c.pdf"));
  await denied(U.pt, `select public.create_document($1, $2, 'x', 'c.pdf', $3, 'application/pdf', 1000, 'bukan-hash')`, [LA.id, ktp.id, p], /checksum/);
  await denied(U.pt, `select public.create_document($1, $2, '   ', 'c.pdf', $3, 'application/pdf', 1000)`, [LA.id, ktp.id, p], /check/);
});
await t("jenis dokumen nonaktif tidak dapat dipakai untuk dokumen baru", async () => {
  const sp = await typeOf("SURAT_PERMOHONAN");
  await run(null, `update public.document_types set is_active = false where id = $1`, [sp.id]);
  try {
    await denied(U.pt, `insert into public.documents (license_id, document_type_id, title) values ($1, $2, 'x')`, [LA.id, sp.id], /tidak aktif/);
  } finally {
    await run(null, `update public.document_types set is_active = true where id = $1`, [sp.id]);
  }
});
await t("unggah ke izin yang sudah AKTIF (Admin Arsip) → status DIARSIPKAN, tanpa notifikasi verifikator", async () => {
  const L = await licByApp("PMH-2026-90002");
  eq(L.status, "AKTIF");
  const pend = await typeOf("DOK_PENDUKUNG");
  const nBefore = (await one(null, `select count(*)::int c from public.notifications where type = 'dokumen_menunggu'`)).c;
  const p = await putObject(U.ad, pathFor(L, pend.storage_folder, "foto-lokasi.png"), 2048, "image/png");
  const id = (await createDoc(U.ad, L, pend.id, p, 2048, "image/png", null, "Foto lokasi usaha")).id;
  eq((await one(null, `select status from public.documents where id = $1`, [id])).status, "DIARSIPKAN");
  eq((await one(null, `select count(*)::int c from public.notifications where type = 'dokumen_menunggu'`)).c, nBefore);
});
await t("role tanpa hak kelola tidak dapat mengunggah/mencatat dokumen", async () => {
  const ktp = await typeOf("KTP");
  await denied(U.pt2, `insert into storage.objects (bucket_id, name) values ('perizinan-documents', $1)`, [pathFor(LA, "ktp")], /row-level security/);
  const p = await putObject(U.pt, pathFor(LA, ktp.storage_folder, "d.pdf"));
  for (const who of [U.pt2, U.vf, U.pm, U.vw]) {
    await denied(who, `select public.create_document($1, $2, 'x', 'd.pdf', $3, 'application/pdf', 1000)`, [LA.id, ktp.id, p], /row-level security|permission denied/);
  }
  await denied("anon", `select public.create_document($1, $2, 'x', 'd.pdf', $3, 'application/pdf', 1000)`, [LA.id, ktp.id, p], /permission denied/);
});
await t("metadata dokumen dapat diubah petugas pemilik; versi baru lewat insert biasa", async () => {
  eq(await affected(U.pt, `update public.documents set title = 'KTP pemohon', document_number = 'KTP/99' where id = $1`, [docNew]), 1);
  const ktp = await typeOf("KTP");
  const p = await putObject(U.pt, pathFor(LA, ktp.storage_folder, "ktp-v2.jpg"), 900, "image/jpeg");
  const v = await one(U.pt, `insert into public.document_versions (document_id, file_name, storage_path, mime_type, size_bytes)
                             values ($1, 'ktp-v2.jpg', $2, 'image/jpeg', 900) returning version_no`, [docNew, p]);
  eq(v.version_no, 2);
  eq(await affected(U.pt2, `update public.documents set title = 'x' where id = $1`, [docNew]), 0);
});
await t("v_document_search: internal melihat dokumen proses; Viewer hanya Surat Izin pada izin publik", async () => {
  const pm = await q(U.pm, `select * from public.v_document_search where license_id = $1`, [LA.id]);
  eq(pm.length, 1); eq(pm[0].version_no, 2); eq(pm[0].title, "KTP pemohon"); eq(pm[0].license_status, "DRAFT");
  const vw = await q(U.vw, `select document_type_code, license_status from public.v_document_search`);
  ok(vw.length > 0, "viewer harus melihat Surat Izin");
  ok(vw.every((r) => r.document_type_code === "SURAT_IZIN" && ["DITERBITKAN", "AKTIF", "BERAKHIR"].includes(r.license_status)), JSON.stringify(vw));
  await denied("anon", `select * from public.v_document_search`, [], /permission denied/);
});
await t("dokumen terhapus (soft delete) hilang dari v_document_search dan tidak dapat diberi versi baru", async () => {
  eq(await affected(U.ad, `update public.documents set deleted_at = now() where id = $1`, [docNew]), 1);
  eq((await q(U.ad, `select 1 from public.v_document_search where id = $1`, [docNew])).length, 0);
  const p = await putObject(U.ad, pathFor(LA, "ktp", "ktp-v3.pdf"));
  await denied(U.ad, `insert into public.document_versions (document_id, file_name, storage_path, mime_type, size_bytes)
                      values ($1, 'ktp-v3.pdf', $2, 'application/pdf', 1000)`, [docNew, p], /tidak ditemukan|row-level security/);
});

// ── 10. Pemeliharaan harian ─────────────────────────────────────────────────
group("Pemeliharaan harian (cron)");
await t("DITERBITKAN→AKTIF, AKTIF→BERAKHIR, peringatan kedaluwarsa tanpa duplikat", async () => {
  const type = await one(null, `select id from public.license_types where code = 'IT'`);
  const a = await one(null, `select id from public.applicants where nik = '5301000000000002'`);
  const mk = async (n, st, issue, expiry) => (await one(null, `insert into public.licenses (license_number, license_type_id, applicant_id, status, issue_date, expiry_date)
                                     values ($1, $2, $3, $4, $5, $6) returning id`, [n, type.id, a.id, st, issue, expiry]));
  const toActive = await mk("CRON/1", "DITERBITKAN", new Date(Date.now() - 864e5).toISOString().slice(0, 10), null);
  const toExpire = await mk("CRON/2", "AKTIF", "2020-01-01", new Date(Date.now() - 864e5).toISOString().slice(0, 10));
  const future = await mk("CRON/3", "DITERBITKAN", new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), null);
  const r1 = (await one(null, `select public.run_daily_license_maintenance() r`)).r;
  eq(await status(toActive.id), "AKTIF");
  eq(await status(toExpire.id), "BERAKHIR");
  eq(await status(future.id), "DITERBITKAN");
  ok(r1.activated >= 1 && r1.expired >= 1 && r1.expiry_warnings >= 1, JSON.stringify(r1));
  const c1 = (await one(null, `select count(*)::int c from public.notifications where type = 'izin_akan_berakhir'`)).c;
  const r2 = (await one(null, `select public.run_daily_license_maintenance() r`)).r;
  eq(r2.expiry_warnings, 0, "tidak boleh membuat notifikasi ganda");
  eq((await one(null, `select count(*)::int c from public.notifications where type = 'izin_akan_berakhir'`)).c, c1);
});

// ── Ringkasan ───────────────────────────────────────────────────────────────
console.log(`\n${pass} lulus, ${failures.length} gagal`);
if (failures.length) {
  console.log("\nGAGAL:\n" + failures.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
