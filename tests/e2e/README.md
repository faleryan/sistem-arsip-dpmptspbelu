# Uji end-to-end (opsional, untuk pengembang)

Menjalankan aplikasi hasil build terhadap **PostgreSQL + PostgREST lokal** dengan migration dan RLS yang sama
seperti Supabase, lalu mengklik alur nyata per role (Super Admin, Admin Arsip, Petugas, Verifikator, Viewer).
Tidak menyentuh proyek Supabase Anda.

`gateway.mjs` juga meniru **Storage API** (`storage-emu.mjs`): unggah, signed URL, dan unduh. Hak akses tidak
ditiru — setiap operasi dijalankan sebagai user (`SET LOCAL ROLE authenticated` + klaim JWT) sehingga policy
`storage.objects` dari migration 0005 yang memutuskan. File tersimpan di `tests/e2e/.storage/`.

Kebutuhan: PostgreSQL 15+ (dengan contrib `pg_trgm`, `pgcrypto`), [PostgREST v12](https://github.com/PostgREST/postgrest/releases),
Node 18+, dan Chromium/Chrome.

```bash
# 1. PostgreSQL lokal di port 54329 (socket /tmp), mis.:
initdb -D /tmp/sipar-pg -A trust -U postgres
pg_ctl -D /tmp/sipar-pg -o "-p 54329 -k /tmp" -l /tmp/sipar-pg.log start

# 2. Muat database uji (aman diulang; selalu mulai dari nol)
./load-db.sh

# 3. PostgREST + gateway tiruan Supabase (dua terminal)
postgrest pgrst.conf
npm install                     # sekali: pg + playwright-core
node gateway.mjs                # http://127.0.0.1:54321

# 4. Build aplikasi yang diarahkan ke gateway, lalu jalankan uji
cd ../.. && VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=anon-key npx vite build --outDir dist-e2e
cd tests/e2e && CHROME_PATH=/path/ke/chrome npm test
```

Hasil: daftar skenario ✔/✘, daftar galat konsol/HTTP yang tidak diharapkan, dan screenshot di `hasil/`.
Jalankan `./load-db.sh` sebelum setiap putaran karena uji membuat data.

## Uji tambahan (Fase 7)

Dengan stack yang sama (PostgreSQL, PostgREST, `gateway.mjs`) berjalan:

```bash
# Edge Function admin-create-user (butuh Deno 2): hak pemanggil, buat akun, reset sandi, audit, CORS.
# gateway.mjs meniru API admin Auth (/auth/v1/admin/users) khusus untuk uji ini.
DENO=/path/ke/deno node edge-function.test.mjs

# Alat backup/pemulihan file arsip (tools/backup). Jalankan setelah `npm test` agar ada dokumen.
node backup.test.mjs
```

## Uji kinerja

```bash
psql -h /tmp -p 54329 -U postgres -d sipar -v n=50000 -f ../perf/seed_perf.sql   # ±2 menit
node ../perf/run-perf.mjs           # median per kueri; anggaran BUDGET_MS (bawaan 500)
./load-db.sh                        # kembalikan database uji ke kondisi bersih
```
