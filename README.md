# SIPAR-BELU

Sistem Informasi Pengarsipan dan Manajemen Dokumen Perizinan — DPMPTSP Kabupaten Belu.

React + TypeScript + Vite + Tailwind · Supabase (Auth, PostgreSQL + RLS, Storage, Edge Function) · hosting Vercel.

**Status: versi 1.0.0 — Fase 1–7 selesai, siap produksi.**

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | **Mulai di sini untuk produksi**: Supabase, migration, Auth + SMTP, Edge Function, Super Admin pertama, Vercel, domain, data awal, daftar periksa go-live, pembaruan, pemecahan masalah |
| [`docs/BACKUP.md`](docs/BACKUP.md) | Backup & pemulihan database dan **file arsip** (alat `tools/backup/`) |
| [`docs/00-DESAIN.md`](docs/00-DESAIN.md) | Desain: arsitektur, ERD, role & permission, strategi RLS, workflow, keputusan tiap fase (bagian 10–15) |
| [`supabase/audit/security_audit.sql`](supabase/audit/security_audit.sql) | Audit keamanan basis data (jalankan di SQL Editor; target 0 TINGGI/SEDANG) |
| [`tests/e2e/README.md`](tests/e2e/README.md) | Uji antarmuka, Edge Function, dan alat backup terhadap tiruan Supabase lokal |

## Fitur

- **Login & peran** (Super Admin, Admin Arsip, Petugas, Verifikator, Pimpinan, Viewer); akun dibuat Super Admin
  lewat Edge Function; tanpa pendaftaran mandiri.
- **Data Perizinan, Pemohon, Perusahaan, Master Data** — tabel dengan pencarian, filter, urut, paginasi server,
  pilihan kolom, ekspor CSV; status mengikuti workflow (Draft → Diajukan → Verifikasi → Disetujui → Diterbitkan →
  Aktif → Berakhir, plus Ditolak/Dicabut/Dibatalkan) dengan riwayat dan kelengkapan dokumen.
- **Arsip Digital** — unggah PDF/JPG/PNG ke bucket privat (progres, cek isi file, SHA-256), metadata & klasifikasi,
  versi dokumen, pratinjau/unduh lewat signed URL berumur pendek.
- **DMS** — Antrean Verifikasi, riwayat versi & alasan penolakan, **Audit Log** (nilai lama → baru), **Data
  Terhapus** (pulihkan).
- **QR verifikasi publik** `/verify/<kode>` (tanpa login, hanya data aman) dan label QR siap cetak.
- **Notifikasi**, **Laporan** (rekap, per kecamatan, izin terbit, masa berlaku, dokumen; ekspor **Excel/PDF/CSV**
  berkop instansi), **Pencarian Arsip** lanjutan.
- **Pengaturan** (Super Admin): nama instansi, batas unggah, peringatan masa berlaku, **integritas penyimpanan**
  (file tanpa catatan / catatan tanpa file), informasi versi.
- Ketahanan: halaman dimuat per rute, pemulihan otomatis setelah deploy baru, pesan galat ramah, spanduk offline.

## Menjalankan lokal

```bash
npm install
cp .env.example .env      # isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY (proyek UJI)
npm run dev               # http://localhost:5173
npm run build             # typecheck + build produksi ke dist/
```

## Database

Migration di `supabase/migrations/`, dijalankan berurutan di SQL Editor (rincian di `docs/DEPLOY.md` §3):

| File | Isi |
|---|---|
| `0001`–`0006` | Profil & peran, skema, fungsi/trigger/workflow/audit, RLS, Storage, data referensi |
| `0007` *(jalankan sendiri)*, `0008` | Status dokumen *Diarsipkan*, arsip digital (`create_document`, pencarian dokumen) |
| `0009`, `0010` | Indeks audit; laporan & QR |
| `0011` | Fase 7: fungsi tertutup secara bawaan, validasi pengaturan, integritas Storage, hapus file yatim |
| `0012` | Fase 7: kinerja RLS (fungsi peran sekali per kueri, JIT mati) — daftar 50.000 izin dari 8,6 s → 0,15 s |
| `0013` | Fase 7: perbaikan hasil tinjauan keamanan independen (lihat `docs/00-DESAIN.md` §15.1) |

Hanya untuk proyek **uji**: `supabase/seed.sql` (data contoh) dan `supabase/seed_test_users.sql` (6 akun uji,
satu per role). Jangan dijalankan di produksi — audit keamanan akan menandainya.

## Pengujian

| Suite | Perintah | Cakupan |
|---|---|---|
| Database (PGlite) | `cd supabase/tests && npm install && npm test` | 96 skenario: RLS per role, workflow, Storage, arsip, laporan, audit keamanan (termasuk uji mutasi), pengaturan, integritas, perbaikan tinjauan keamanan |
| Antarmuka E2E | lihat `tests/e2e/README.md` | 60 skenario alur nyata tiap role di Chromium terhadap PostgreSQL + PostgREST + tiruan Storage dengan **CSP produksi** |
| Edge Function | `tests/e2e/edge-function.test.mjs` | Hak pemanggil, buat akun, reset sandi, audit, CORS, serangan lewat view |
| Alat backup | `tests/e2e/backup.test.mjs` | Cadangkan + checksum, bertahap, pulihkan, tolak file berubah |
| Kinerja | `tests/perf/seed_perf.sql` + `tests/perf/run-perf.mjs` | 50.000 izin / 100.000 dokumen lewat PostgREST |

## Keamanan (ringkas)

- Frontend hanya memegang anon/publishable key. `SUPABASE_SERVICE_ROLE_KEY` hanya ada di Edge Function (disuntik
  Supabase) dan di komputer admin untuk alat backup — tidak pernah di kode frontend, variabel `VITE_*`, atau Vercel.
- Hak akses ditegakkan di database (RLS, trigger penjaga, fungsi workflow); menu per role di UI hanya kenyamanan.
- Anon hanya dapat memanggil `verify_license()`. File arsip di bucket privat, dibaca lewat signed URL 1–5 menit,
  dan aksesnya mengikuti catatan dokumen.
- Header: CSP ketat, HSTS, X-Frame-Options DENY, COOP/CORP, nosniff, Referrer-Policy, Permissions-Policy.
- Jalankan `supabase/audit/security_audit.sql` setelah setiap migration.
