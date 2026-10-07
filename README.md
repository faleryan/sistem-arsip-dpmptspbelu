# SIPAR-BELU

Sistem Informasi Pengarsipan dan Manajemen Dokumen Perizinan — DPMPTSP Kabupaten Belu.

React + TypeScript + Vite + Tailwind · Supabase (Auth, PostgreSQL + RLS, Storage) · hosting Vercel.

Desain lengkap: [`docs/00-DESAIN.md`](docs/00-DESAIN.md). Status: **Fase 1 dan 2 selesai** (lihat roadmap di dokumen desain).

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
   `0001` → `0002` → `0003` → `0004` → `0005` → `0006`. Semuanya aman dijalankan ulang.
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
   untuk 5 akun uji (kata sandi tertulis di file itu — hapus sebelum produksi).

## Menguji database (RLS, workflow, storage)

Suite ini menjalankan semua migration di PostgreSQL lokal (PGlite) dan menguji 59 skenario per role:

```bash
cd supabase/tests
npm install
npm test
```

Catatan: ini meniru role/skema Supabase (`mock_supabase.sql`), bukan Supabase sungguhan. Jalankan juga uji manual
singkat di proyek Anda (login tiap role uji, coba unggah dan verifikasi) setelah Fase 4.

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
