# SIPAR-BELU

Sistem Informasi Pengarsipan dan Manajemen Dokumen Perizinan — DPMPTSP Kabupaten Belu.

React + TypeScript + Vite + Tailwind · Supabase (Auth, PostgreSQL + RLS, Storage) · hosting Vercel.

Desain lengkap: [`docs/00-DESAIN.md`](docs/00-DESAIN.md). Status: **Fase 1–5 selesai** (lihat roadmap di dokumen desain).

Yang sudah bisa dipakai: login dan peran, dashboard, Pengguna & Role, **Data Perizinan** (daftar, tambah, detail,
ubah, ubah status sesuai workflow, riwayat status, kelengkapan dokumen), **Pemohon**, **Perusahaan**, dan
**Master Data** (jenis izin + dokumen wajib, jenis dokumen, kecamatan, desa/kelurahan, klasifikasi arsip, unit).
Semua tabel punya pencarian, filter, urut, paginasi server, pilihan kolom, dan ekspor CSV.

**Arsip Digital** (Fase 4): unggah PDF/JPG/PNG ke bucket privat dari halaman detail izin (dengan progres, cek isi
file, checksum SHA-256), metadata dokumen (jenis, judul, nomor, tanggal, klasifikasi), unggah versi baru, pratinjau
dan unduh lewat signed URL berumur pendek, hapus lunak oleh Admin, serta halaman **Arsip Digital** berisi seluruh
dokumen lintas izin.

**DMS & workflow** (Fase 5): riwayat versi lengkap (unduh/pratinjau tiap versi, alasan penolakan per versi),
**Antrean Verifikasi** untuk Verifikator (pratinjau berdampingan dengan Terima/Tolak beralasan), alur kerja visual
di detail izin (Draft → Diajukan → Verifikasi → Disetujui → Diterbitkan → Aktif), **Audit Log** dengan filter dan
rincian perubahan nilai lama → baru (plus tombol *Jejak audit* di setiap detail), dan **Data Terhapus** untuk
memulihkan data yang dihapus lunak.

## Menjalankan lokal

```bash
npm install
cp .env.example .env      # isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY
npm run dev               # http://localhost:5173
npm run build             # typecheck + build produksi ke dist/
```

## Menyiapkan Supabase

1. Buat proyek di supabase.com. Ambil **Project URL** dan **anon public key** (Settings → API).
2. SQL Editor → jalankan file di `supabase/migrations/` **berurutan**, satu per satu:
   `0001` → `0002` → `0003` → `0004` → `0005` → `0006` → `0007` → `0008` → `0009`. Semuanya aman dijalankan ulang.
   **`0007` harus dijalankan sendiri** (satu kali *Run*), baru kemudian `0008` — PostgreSQL tidak mengizinkan
   status enum baru dipakai dalam eksekusi yang sama dengan penambahannya.
   Sudah menjalankan migration fase sebelumnya? Cukup jalankan yang belum (Fase 4: `0007` lalu `0008`; Fase 5: `0009`).
   Bila muncul catatan tentang `pg_cron`, aktifkan di Database → Extensions lalu jalankan ulang `0003`
   (penjadwalan harian: izin berakhir otomatis + notifikasi).
3. Buat Super Admin pertama (langkah manual di bagian bawah `0001`).
4. Matikan pendaftaran mandiri: Authentication → Providers → Email → *Allow new users to sign up* = off.
5. **Edge Function pembuat akun** (agar menu *Pengguna & Role* bisa menambah user):
   Dashboard → Edge Functions → *Deploy a new function* → nama `admin-create-user` → tempel isi
   `supabase/functions/admin-create-user/index.ts` → Deploy (biarkan *Verify JWT* aktif).
   Atau dengan CLI: `supabase functions deploy admin-create-user`.
   Kunci service role disuntik otomatis oleh Supabase; **jangan** menaruhnya di frontend atau Vercel.
6. (Opsional, hanya proyek uji) `supabase/seed.sql` untuk data contoh, dan `supabase/seed_test_users.sql`
   untuk 6 akun uji, satu per role (kata sandi tertulis di file itu — hapus sebelum produksi).
   Dokumen contoh di `seed.sql` hanya metadata tanpa file, sehingga pratinjaunya menampilkan
   "File tidak ditemukan di penyimpanan". Dokumen yang Anda unggah sendiri dapat dibuka normal.
7. Setelah deploy, coba sekali: unggah PDF di detail izin lalu buka pratinjaunya. Bila area pratinjau kosong,
   pakai tombol **Tab baru** atau **Unduh** dan beri tahu saya (lihat catatan pratinjau di dokumen desain bagian 12).

## Menguji database (RLS, workflow, storage)

Suite ini menjalankan semua migration di PostgreSQL lokal (PGlite) dan menguji 73 skenario per role:

```bash
cd supabase/tests
npm install
npm test
```

Catatan: ini meniru role/skema Supabase (`mock_supabase.sql`), bukan Supabase sungguhan. Jalankan juga uji manual
singkat di proyek Anda (login tiap role uji, coba unggah dan verifikasi) setelah Fase 4.

Uji antarmuka end-to-end (opsional, untuk pengembang): `tests/e2e/README.md` — menjalankan aplikasi terhadap
PostgreSQL + PostgREST lokal (dengan tiruan Storage API yang memakai policy RLS asli) dan mengklik alur nyata
tiap role (41 skenario: master data, CRUD, unggah/pratinjau/unduh/versi dokumen, verifikasi, alur penuh
Draft → Aktif, Audit Log, dan pemulihan data).

## Deploy ke Vercel

1. Push folder ini ke repository GitHub (root repo = folder ini, bukan subfolder).
2. vercel.com → Add New → Project → pilih repo. Framework otomatis terdeteksi **Vite**
   (build `npm run build`, output `dist` sudah diatur di `vercel.json`).
3. Environment Variables (Production dan Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Setelah domain Vercel (mis. `sipar-belu.vercel.app`) terbit, daftarkan di Supabase:
   Authentication → URL Configuration → **Site URL** dan **Redirect URLs**
   (`https://domain-anda/reset-password`). Tanpa ini email "lupa kata sandi" tidak akan kembali ke aplikasi.
5. Setiap kali Anda mengubah env var, lakukan **Redeploy** (nilai `VITE_*` ditanam saat build).

Catatan: `vercel.json` memuat Content-Security-Policy yang mengizinkan `https://*.supabase.co`.
Jika memakai custom domain Supabase, sesuaikan `connect-src`, `img-src`, dan `frame-src`.

## Keamanan

- Hanya anon key yang ada di frontend. `SUPABASE_SERVICE_ROLE_KEY` tidak boleh dipakai di kode frontend.
- Hak akses ditegakkan oleh RLS di database; menu per role di UI hanya kenyamanan.
- Tidak ada pendaftaran mandiri; akun dibuat oleh Super Admin.
