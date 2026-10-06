# SIPAR-BELU

Sistem Informasi Pengarsipan dan Manajemen Dokumen Perizinan — DPMPTSP Kabupaten Belu.

React + TypeScript + Vite + Tailwind · Supabase (Auth, PostgreSQL + RLS, Storage) · hosting Vercel.

Desain lengkap: [`docs/00-DESAIN.md`](docs/00-DESAIN.md). Status: **Fase 1 selesai** (lihat roadmap di dokumen desain).

## Menjalankan lokal

```bash
npm install
cp .env.example .env      # isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY
npm run dev               # http://localhost:5173
npm run build             # typecheck + build produksi ke dist/
```

## Menyiapkan Supabase (Fase 1)

1. Buat proyek di supabase.com. Ambil **Project URL** dan **anon public key** (Settings → API).
2. SQL Editor → jalankan `supabase/migrations/0001_phase1_profiles.sql`.
3. Buat Super Admin pertama dengan langkah manual di bagian bawah file SQL tersebut.
4. Matikan pendaftaran mandiri: Authentication → Providers → Email → *Allow new users to sign up* = off.

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
