# Uji end-to-end (opsional, untuk pengembang)

Menjalankan aplikasi hasil build terhadap **PostgreSQL + PostgREST lokal** dengan migration dan RLS yang sama
seperti Supabase, lalu mengklik alur nyata per role (Super Admin, Admin Arsip, Petugas, Verifikator, Viewer).
Tidak menyentuh proyek Supabase Anda.

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
node gateway.mjs                # http://127.0.0.1:54321

# 4. Build aplikasi yang diarahkan ke gateway, lalu jalankan uji
cd ../.. && VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=anon-key npx vite build --outDir dist-e2e
cd tests/e2e && npm install && CHROME_PATH=/path/ke/chrome npm test
```

Hasil: daftar skenario ✔/✘, daftar galat konsol/HTTP yang tidak diharapkan, dan screenshot di `hasil/`.
Jalankan `./load-db.sh` sebelum setiap putaran karena uji membuat data.
