# Backup & Pemulihan SIPAR-BELU

SIPAR-BELU menyimpan data di **dua tempat** yang dicadangkan dengan cara berbeda:

| Bagian | Isi | Dicadangkan oleh |
|---|---|---|
| **Database** (PostgreSQL) | izin, pemohon, perusahaan, metadata & riwayat dokumen, audit, pengguna (profil), pengaturan | Backup Supabase (Pro: harian otomatis) dan/atau `pg_dump` |
| **Storage** (bucket `perizinan-documents`) | **isi file** PDF/JPG/PNG yang diunggah | **Tidak** termasuk backup database Supabase → `tools/backup/backup-storage.mjs` |

> Backup database Supabase hanya menyimpan *metadata* objek Storage, bukan isi filenya. Memulihkan database
> saja akan menghasilkan dokumen yang tercatat tetapi file-nya hilang. **Keduanya harus dicadangkan.**

## 1. Rekomendasi jadwal

| Frekuensi | Apa | Cara |
|---|---|---|
| Harian (otomatis) | Database | Paket **Pro**: backup harian disimpan 7 hari (Team 14, Enterprise s.d. 30). Paket Free **tidak** punya backup otomatis. Untuk RPO lebih kecil: add-on **PITR** (butuh minimal compute Small). |
| Mingguan | Database (salinan di luar Supabase) | `pg_dump` / `supabase db dump` → simpan di server/NAS instansi + satu salinan di luar kantor. |
| Mingguan (atau setelah pengunggahan besar) | File arsip | `backup-storage.mjs` ke folder yang sama (bertahap: hanya file baru yang diunduh). |
| Bulanan | **Uji pemulihan** | Pulihkan ke proyek uji (bagian 4), buka beberapa dokumen acak. Backup yang tidak pernah diuji belum terbukti. |

Simpan minimal **3 salinan, di 2 media berbeda, 1 di luar kantor** (aturan 3-2-1). Folder cadangan berisi data
pribadi (NIK, alamat): enkripsi disk/arsipnya dan batasi aksesnya.

## 2. Backup database

### 2a. Backup otomatis Supabase (Pro)
Dashboard → **Database → Backups**. Pemulihan: pilih titik backup → *Restore*. Proyek tidak dapat diakses selama
proses pemulihan. Setelah pulih, jalankan **Pengaturan → Integritas penyimpanan** untuk melihat file yang tidak
cocok dengan catatan.

### 2b. Salinan mandiri dengan `pg_dump`
Ambil *connection string* di **Connect** (pilih *Session pooler* bila jaringan Anda hanya IPv4).

```bash
# Skema + data aplikasi (schema public), format custom (terkompresi, dapat dipulihkan selektif)
pg_dump "postgresql://postgres.<ref>:<PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
  --schema=public --format=custom --no-owner --no-privileges \
  --file=sipar-db-$(date +%F).dump

# Akun login (auth.users) — diperlukan bila memindahkan ke proyek baru
pg_dump "postgresql://…" --schema=auth --table=auth.users --table=auth.identities \
  --data-only --format=custom --file=sipar-auth-$(date +%F).dump
```

Alternatif dengan Supabase CLI: `supabase db dump --db-url "<connection string>" -f sipar-db.sql`
(skema) dan `supabase db dump --db-url "…" --data-only -f sipar-data.sql` (data).

Gunakan `pg_dump` dengan versi mayor ≥ versi Postgres proyek (lihat Settings → Infrastructure).

## 3. Backup file arsip (Storage)

Alat: `tools/backup/backup-storage.mjs` (Node.js 18+, tanpa instalasi paket). Dijalankan di **komputer admin**,
bukan di Vercel.

```bash
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service_role / secret key>   # Settings → API. Jangan disimpan di file proyek.
node tools/backup/backup-storage.mjs --out /backup/sipar/arsip
```

Yang dilakukan:
- membaca seluruh `document_versions` (setiap versi, termasuk versi lama dan dokumen terhapus lunak);
- mengunduh tiap file ke `<out>/files/<tahun>/<id-izin>/<folder>/<nama>` — struktur sama dengan bucket;
- memeriksa **SHA-256** setiap file terhadap checksum yang dicatat saat unggah;
- menulis `manifest.json` dan `manifest.csv` (status per file: `OK`, `HILANG`, `RUSAK`, `GAGAL`);
- menjalankan ulang ke folder yang sama hanya mengunduh file yang belum ada atau berubah.

Kode keluar: `0` semua cocok · `1` ada file hilang/rusak (baca manifest) · `2` konfigurasi/koneksi gagal.
Status `HILANG` berarti tercatat di database tetapi tidak ada di bucket — periksa juga
**Pengaturan → Integritas penyimpanan**.

Penjadwalan (contoh Linux, setiap Minggu 01.00):
```cron
0 1 * * 0  cd /opt/sipar-belu && SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node tools/backup/backup-storage.mjs --out /backup/sipar/arsip >> /var/log/sipar-backup.log 2>&1
```
Simpan kunci di berkas lingkungan yang hanya dapat dibaca akun backup (`chmod 600`), bukan di crontab bersama.

## 4. Pemulihan

### 4a. Database
- **Dari backup Supabase**: Database → Backups → *Restore* (bagian 2a).
- **Dari `pg_dump` ke proyek baru**: buat proyek, jalankan migration `0001`–`0013` (lihat `DEPLOY.md`), lalu
  pulihkan **data saja**:
  ```bash
  pg_restore --dbname "postgresql://…" --data-only --disable-triggers --no-owner sipar-auth-YYYY-MM-DD.dump
  pg_restore --dbname "postgresql://…" --data-only --disable-triggers --no-owner sipar-db-YYYY-MM-DD.dump
  ```
  `--disable-triggers` mencegah trigger penjaga/audit menolak atau menggandakan baris saat pemulihan
  (membutuhkan hak yang cukup; bila ditolak, pulihkan lewat bantuan dukungan Supabase).
  Setelah itu jalankan `notify pgrst, 'reload schema';` dan `supabase/audit/security_audit.sql`.

### 4b. File arsip
Setelah database pulih (catatan `document_versions` sudah ada):
```bash
export SUPABASE_URL=https://<ref-proyek-tujuan>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<kunci proyek tujuan>
node tools/backup/restore-storage.mjs --from /backup/sipar/arsip --dry-run   # periksa dulu
node tools/backup/restore-storage.mjs --from /backup/sipar/arsip
```
- mengunggah file berstatus OK ke **lokasi yang sama persis**, sehingga cocok dengan catatan dokumen;
- **tidak pernah menimpa** file yang sudah ada di bucket;
- memeriksa ulang SHA-256 setiap file cadangan sebelum diunggah (file yang berubah ditolak).

Terakhir: **Pengaturan → Integritas penyimpanan → Periksa sekarang** harus "Semua file dan catatan versi dokumen
cocok", lalu buka beberapa dokumen acak.

## 5. File yatim

Unggahan yang berhasil ke Storage tetapi gagal dicatat (mis. koneksi putus di tengah) meninggalkan file tanpa
catatan. **Pengaturan → Integritas penyimpanan** menampilkannya; Super Admin dapat menghapus file berumur > 1 jam.
File yang tercatat sebagai versi dokumen tidak dapat dihapus siapa pun dari aplikasi.

## 6. Pengujian alat ini

`tests/e2e/backup.test.mjs` menguji kedua alat terhadap tiruan Supabase lokal: menolak kunci non-service,
mencadangkan dan memverifikasi checksum, cadangan bertahap memperbaiki salinan lokal yang rusak, memulihkan file
yang hilang dari bucket ke lokasi yang sama tanpa menimpa yang lain, dan menolak file cadangan yang berubah.

Sumber (diperiksa Oktober 2026):
[Supabase — Database Backups](https://supabase.com/docs/guides/platform/backups) (retensi per paket, PITR,
Storage tidak termasuk backup database), [diskusi Supabase tentang backup Storage](https://github.com/orgs/supabase/discussions/39948).
