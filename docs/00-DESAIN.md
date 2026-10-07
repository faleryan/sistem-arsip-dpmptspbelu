# SIPAR-BELU — Paket Desain (Pra-Implementasi)

Sistem Informasi Pengarsipan dan Manajemen Dokumen Perizinan Kabupaten Belu
DPMPTSP Kabupaten Belu · Draft desain v1 · 6 Oktober 2026

Dokumen ini disusun sebelum coding sesuai instruksi. Implementasi dimulai dari PHASE 1 setelah desain disetujui.

---

## 0. Analisis Kebutuhan Singkat dan Asumsi

Aplikasi adalah DMS perizinan: data induk (pemohon, perusahaan, izin) + arsip dokumen berversi + verifikasi + workflow status + audit + pencarian + QR publik + laporan.

Bagian prompt yang belum rinci, dan asumsi aman yang saya ambil:

| # | Hal | Asumsi |
|---|-----|--------|
| A1 | Pengelolaan role | Role disimpan sebagai enum `app_role` di `profiles.role` (sumber kebenaran untuk RLS). Tabel `roles`, `permissions`, `role_permissions` tetap dibuat untuk matriks izin yang dapat dibaca UI dan dikelola Super Admin, tetapi RLS memakai fungsi `has_role()` agar cepat dan sederhana. |
| A2 | Pembuatan user | Hanya Super Admin. Dilakukan lewat Supabase Edge Function `admin-create-user` (memakai service role di sisi server, tidak pernah di frontend). Tidak ada pendaftaran mandiri. |
| A3 | Halaman publik QR | Fungsi RPC `verify_license(code)` bertipe `SECURITY DEFINER` yang hanya mengembalikan kolom aman. Anon tidak punya akses SELECT ke tabel apa pun. Nama pemegang izin tampil penuh, NIK/NPWP tidak pernah tampil. |
| A4 | Hapus data | Soft delete (`deleted_at`) untuk licenses, applicants, businesses, documents. Hard delete hanya untuk Super Admin lewat fungsi khusus dan tercatat di audit. |
| A5 | Kepemilikan dokumen | Dokumen selalu menempel pada satu izin (`license_id`). Pemilik = pemohon/perusahaan dari izin itu. |
| A6 | Dokumen belum lengkap | Dihitung dari `document_types.required_for_license_type` terhadap dokumen berstatus bukan "belum ada". Tidak butuh tabel baru. |
| A7 | Ukuran file | Batas 10 MB per file, tipe PDF/JPG/JPEG/PNG. Divalidasi di frontend, di bucket (`file_size_limit`, `allowed_mime_types`), dan di tabel (CHECK). |
| A8 | Izin berakhir otomatis | Job harian `pg_cron` mengubah status AKTIF menjadi BERAKHIR bila `expiry_date` lewat, membuat notifikasi "akan berakhir" 30 hari sebelumnya. |
| A9 | Pencarian | `pg_trgm` + indeks GIN pada kolom kunci, ditambah view `v_license_search` agar satu query mencakup izin, pemohon, perusahaan. |
| A10 | Export | Excel/CSV di sisi klien (library xlsx) dari data yang sudah lolos RLS. PDF memakai halaman cetak browser (opsional library jsPDF). |
| A11 | Hosting | Vercel sebagai static SPA (Vite build). Tidak ada serverless function di Vercel. Seluruh logika server ada di Supabase. |
| A12 | Email lupa password | Memakai email reset bawaan Supabase Auth. Redirect URL harus didaftarkan di Supabase setelah domain Vercel diketahui. |

---

## 1. Arsitektur Aplikasi

```
 Pegawai / Publik (browser)
          │  HTTPS
          ▼
 ┌──────────────────────────────┐
 │ Vercel (CDN, static SPA)     │  React + TS + Vite + Tailwind + shadcn/ui
 │  /dist  + vercel.json rewrite│  React Router, TanStack Query, Zod
 └──────────────┬───────────────┘
                │ supabase-js (anon key + JWT user)
                ▼
 ┌─────────────────────────────────────────────────────────┐
 │ Supabase                                                │
 │  Auth ── JWT ──► PostgREST ──► PostgreSQL (RLS aktif)   │
 │                                 ├ tabel + trigger audit  │
 │                                 ├ fungsi has_role()      │
 │                                 ├ RPC verify_license()   │
 │                                 └ pg_cron (izin berakhir)│
 │  Storage: bucket privat perizinan-documents (policy)    │
 │  Edge Function: admin-create-user (service role, server)│
 └─────────────────────────────────────────────────────────┘
```

Prinsip:

1. Keamanan di database (RLS + storage policy), bukan di frontend. Frontend hanya menyembunyikan menu demi kenyamanan.
2. Satu-satunya kunci di frontend adalah anon key. Service role hanya ada di Edge Function (secret Supabase).
3. File tidak masuk PostgreSQL. DB menyimpan metadata + `storage_path`. Preview dan download memakai signed URL berumur pendek (60 detik).
4. Perubahan penting (status izin, upload, verifikasi, hapus) dicatat otomatis oleh trigger ke `audit_logs`, jadi tidak bisa terlewat oleh bug frontend.

Lapisan frontend: `pages` (layar) → `components` (UI reusable) → `hooks` (TanStack Query) → `services` (satu file per modul yang memanggil Supabase) → `lib/supabase.ts`. Tipe database dihasilkan dari skema (`types/database.ts`).

---

## 2. ERD

```mermaid
erDiagram
  profiles ||--o{ licenses : "petugas"
  roles ||--o{ role_permissions : has
  permissions ||--o{ role_permissions : has
  units ||--o{ profiles : bidang

  districts ||--o{ villages : has
  districts ||--o{ applicants : lokasi
  villages ||--o{ applicants : lokasi
  districts ||--o{ businesses : lokasi
  villages ||--o{ businesses : lokasi

  applicants ||--o{ licenses : mengajukan
  businesses ||--o{ licenses : memiliki
  license_types ||--o{ licenses : jenis
  districts ||--o{ licenses : lokasi_usaha
  licenses ||--o{ license_status_history : riwayat

  licenses ||--o{ documents : arsip
  document_types ||--o{ documents : jenis
  archive_classes ||--o{ documents : klasifikasi
  documents ||--o{ document_versions : versi
  document_versions ||--o{ document_verifications : verifikasi

  profiles ||--o{ notifications : penerima
  profiles ||--o{ audit_logs : pelaku
```

Relasi inti sesuai prompt: `applicants → licenses → documents → document_versions → document_verifications`. Perusahaan (`businesses`) juga dapat memiliki banyak izin; sebuah izin memiliki pemohon (wajib) dan perusahaan (opsional, untuk izin perorangan).

---

## 3. Struktur Database

Semua PK `uuid default gen_random_uuid()`. Semua tabel relevan punya `created_at`, `updated_at` (trigger `set_updated_at`). Tabel utama punya `deleted_at` (soft delete).

**Enum:**
`app_role` = super_admin, admin_arsip, petugas, verifikator, pimpinan, viewer
`license_status` = DRAFT, DIAJUKAN, VERIFIKASI, DISETUJUI, DITERBITKAN, AKTIF, BERAKHIR, DITOLAK, DICABUT, DIBATALKAN
`doc_status` = MENUNGGU_VERIFIKASI, TERVERIFIKASI, DITOLAK (status "Belum ada" = tidak ada baris dokumen untuk jenis wajib tersebut)
`verification_result` = TERVERIFIKASI, DITOLAK

**Akses & organisasi**
- `profiles` — id (= auth.users.id), full_name, nip, phone, role `app_role`, unit_id, is_active, created_at, updated_at
- `roles` — code, label, description
- `permissions` — code (mis. `license.create`, `document.verify`), module, label
- `role_permissions` — role_code, permission_code (PK gabungan)
- `units` — id, name (Unit/Bidang)

**Wilayah**
- `districts` — id, code, name
- `villages` — id, district_id, code, name, type (desa/kelurahan)

**Pihak**
- `applicants` — id, full_name, nik (unik), npwp, phone, email, address, district_id, village_id, created_by, deleted_at
- `businesses` — id, name, nib (unik), npwp, entity_type, address, district_id, village_id, phone, email, person_in_charge, created_by, deleted_at

**Perizinan**
- `license_types` — id, code (unik), name, category, description, validity_months (null = tanpa batas), is_active
- `licenses` — id, license_number (unik, null saat DRAFT), application_number (unik), nib, license_type_id, applicant_id, business_id, district_id, application_date, issue_date, expiry_date, status `license_status`, officer_id, verification_code (unik, acak 12 karakter, dibuat otomatis), year (generated dari tanggal), notes, created_by, deleted_at
- `license_status_history` — id, license_id, from_status, to_status, note, changed_by, changed_at

**Arsip & DMS**
- `document_types` — id, code, name, storage_folder (ktp, nib, npwp, surat-permohonan, surat-izin, dokumen-pendukung), is_required, is_active
- `archive_classes` — id, code, name (Klasifikasi Arsip)
- `documents` — id, license_id, document_type_id, archive_class_id, document_number, document_date, title, status `doc_status`, current_version_id, created_by, deleted_at
- `document_versions` — id, document_id, version_no, file_name, storage_path (unik), mime_type, size_bytes, checksum_sha256, is_current, uploaded_by, uploaded_at. Baris tidak pernah di-UPDATE kecuali flag `is_current`; tidak pernah dihapus.
- `document_verifications` — id, document_version_id, result `verification_result`, note (wajib bila DITOLAK, CHECK), verified_by, verified_at

**Sistem**
- `notifications` — id, user_id, type, title, body, link, is_read, created_at
- `audit_logs` — id (bigint), user_id, user_name, action, module, record_id, old_value jsonb, new_value jsonb, ip_address, user_agent, created_at. Append-only: tidak ada policy UPDATE/DELETE untuk siapa pun, `REVOKE UPDATE, DELETE` dari role authenticated.
- `system_settings` — key, value jsonb (nama instansi, batas ukuran file, hari peringatan berakhir)

**Indeks utama:** B-tree pada `licenses(license_number)`, `(status)`, `(year)`, `(license_type_id)`, `(district_id)`, `(expiry_date)`, `(verification_code)`; `documents(license_id)`, `(status)`; FK semua diindeks. GIN trigram pada `applicants.full_name`, `applicants.nik`, `businesses.name`, `businesses.nib`, `licenses.application_number`, `documents.document_number`.

---

## 4. Struktur Folder

```
sipar-belu/
├── docs/                      # dokumen desain, panduan deploy
├── supabase/
│   ├── migrations/            # 0001_schema.sql, 0002_rls.sql, 0003_functions_triggers.sql, 0004_storage.sql
│   ├── functions/admin-create-user/
│   └── seed.sql
├── public/
├── src/
│   ├── components/
│   │   ├── ui/                # shadcn/ui
│   │   └── shared/            # DataTable, StatusBadge, ConfirmDialog, EmptyState, FileDropzone
│   ├── layouts/               # AppLayout (sidebar+topbar), AuthLayout, PublicLayout
│   ├── pages/
│   │   ├── auth/  dashboard/  licenses/  applicants/  businesses/
│   │   ├── documents/  search/  reports/  notifications/
│   │   ├── users/  master/  audit/  settings/  verify/
│   ├── hooks/                 # useAuth, usePermission, useDebounce, query hooks per modul
│   ├── lib/                   # supabase.ts, queryClient.ts, utils.ts
│   ├── services/              # licenses.ts, documents.ts, storage.ts, reports.ts, ...
│   ├── types/                 # database.ts (generated), domain.ts
│   ├── utils/                 # format tanggal id-ID, sanitasi nama file, export excel/csv
│   └── routes/                # router.tsx, ProtectedRoute, RoleGuard
├── .env.example               # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
├── vercel.json                # rewrite SPA + header keamanan
├── package.json  tsconfig.json  vite.config.ts  tailwind.config.ts
```

---

## 5. Role dan Permission Matrix

Legenda: C=buat, R=lihat, U=ubah, D=hapus (soft), V=verifikasi, — = tidak ada akses.

| Modul | Super Admin | Admin Arsip | Petugas | Verifikator | Pimpinan | Viewer |
|-------|:-:|:-:|:-:|:-:|:-:|:-:|
| Dashboard & statistik | R | R | R | R | R | R (terbatas) |
| Perizinan | CRUD | CRU | CRU (milik sendiri/ditugaskan) | R | R | R |
| Ubah status izin | semua | draft→diajukan, terbitkan | draft→diajukan | verifikasi→disetujui/ditolak | — | — |
| Pemohon & perusahaan | CRUD | CRU | CRU | R | R | R |
| Dokumen (upload/versi) | CRUD | CRUD | CRU | R | R | R |
| Hapus dokumen (soft) | ✔ | ✔ | — | — | — | — |
| Verifikasi dokumen | ✔ | — | — | V | — | — |
| Lihat riwayat versi | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Pencarian arsip | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Laporan & export | ✔ | ✔ | R | R | ✔ | — |
| Notifikasi (milik sendiri) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Master data (jenis izin/dokumen, wilayah, klasifikasi, unit) | CRUD | R | R | R | R | R |
| Manajemen user & role | CRUD | — | — | — | — | — |
| Audit log | R | R | — | — | R | — |
| Pengaturan sistem | CRUD | — | — | — | — | — |

Catatan asumsi: "Viewer hanya data yang diberikan akses" diwujudkan sebagai read-only seluruh data izin berstatus AKTIF/BERAKHIR/DITERBITKAN (bukan draft/proses), tanpa NIK/NPWP penuh pada tampilan. Pemberian akses per-izin yang lebih granular dapat ditambahkan lewat tabel `license_access` bila instansi membutuhkannya (di luar lingkup awal).

---

## 6. Strategi RLS

**Prinsip:** RLS aktif di semua tabel, `FORCE ROW LEVEL SECURITY` pada tabel sensitif, default tolak. Role `anon` tidak punya policy di tabel mana pun.

**Fungsi bantu** (`SECURITY DEFINER`, `STABLE`, `search_path = public`):
- `current_role_code()` → membaca `profiles.role` untuk `auth.uid()` dan hanya jika `is_active`
- `has_role(variadic text[])` → true bila role aktif termasuk dalam daftar
- `can_write_archive()` → super_admin, admin_arsip, petugas

**Pola policy:**

| Tabel | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| profiles | diri sendiri; semua role internal boleh baca nama (untuk tampil "petugas") tanpa kolom sensitif lewat view; super_admin semua | hanya via Edge Function | diri sendiri (nama/telepon saja, role tidak bisa); super_admin semua | tidak ada (nonaktifkan, bukan hapus) |
| master (license_types, document_types, districts, villages, archive_classes, units) | semua authenticated | super_admin | super_admin | super_admin |
| applicants, businesses | semua role internal (viewer lewat view tersamar) | super_admin, admin_arsip, petugas | sama | super_admin (soft) |
| licenses | internal: semua yang `deleted_at is null`; viewer: hanya status publik | super_admin, admin_arsip, petugas | admin/super_admin semua; petugas hanya `officer_id = auth.uid()` dan status DRAFT/DIAJUKAN; verifikator hanya kolom status via fungsi | super_admin (soft) |
| documents, document_versions | sama seperti licenses (mengikuti izin induk) | can_write_archive | hanya flag `is_current`, tidak ada ubah file | tidak ada hard delete; soft delete admin |
| document_verifications | internal baca | **hanya lewat `verify_document()`** (verifikator, super_admin; `verified_by` = auth.uid()) | tidak ada | tidak ada |
| license_status_history | internal baca | hanya lewat trigger | tidak ada | tidak ada |
| notifications | `user_id = auth.uid()` | trigger/fungsi | pemilik (is_read) | pemilik |
| audit_logs | super_admin, admin_arsip, pimpinan | hanya trigger | tidak ada | tidak ada |
| system_settings | internal baca | super_admin | super_admin | super_admin |

**Transisi status** dipaksa di database lewat fungsi `change_license_status(license_id, new_status, note)` (SECURITY DEFINER) yang memeriksa role dan urutan yang sah (matriks transisi di bagian 7), menulis `license_status_history`, dan memicu audit. Update langsung ke kolom `status` ditolak oleh policy/trigger. Dengan begitu verifikator tidak bisa mengubah data izin lain dan petugas tidak bisa melompati verifikasi.

**Storage** (bucket `perizinan-documents`, privat, `file_size_limit` 10 MB, `allowed_mime_types` pdf/jpeg/png):
- SELECT: semua role internal (viewer hanya bila izin induk berstatus publik; dicek lewat fungsi yang mencocokkan `license_id` dari segmen path ke-2)
- INSERT: `can_write_archive()` dan path harus berpola `{tahun}/{license_id}/{folder}/{uuid}-{namaAman}`
- UPDATE/DELETE: tidak diizinkan untuk authenticated (versi lama tidak pernah dihapus). Penghapusan fisik hanya prosedur khusus Super Admin di dashboard Supabase.
- Download selalu lewat `createSignedUrl(path, 60)`.

**Halaman publik:** `verify_license(code text)` mengembalikan satu baris: nomor izin, jenis izin, nama pemegang (perusahaan atau pemohon), tanggal terbit, status, nama instansi. Tidak ada kolom lain. Di-GRANT EXECUTE ke `anon`. Kode verifikasi acak 12 karakter (tidak berurutan, tidak bisa ditebak) dan dibatasi pada status DITERBITKAN/AKTIF/BERAKHIR/DICABUT.

**Pengujian RLS (PHASE 7):** skrip SQL yang menjalankan `set local role authenticated` + `request.jwt.claims` untuk tiap role dan memverifikasi hasil SELECT/INSERT/UPDATE/DELETE per tabel terhadap matriks di atas.

---

## 7. Workflow Perizinan

```
DRAFT → DIAJUKAN → VERIFIKASI → DISETUJUI → DITERBITKAN → AKTIF → BERAKHIR
                        │            │
                        ▼            ▼
                     DITOLAK     DIBATALKAN        AKTIF/DITERBITKAN → DICABUT
```

| Dari | Ke | Siapa | Syarat |
|------|----|-------|--------|
| DRAFT | DIAJUKAN | petugas, admin_arsip, super_admin | pemohon + jenis izin terisi |
| DIAJUKAN | VERIFIKASI | otomatis saat dokumen pertama diajukan, atau verifikator | minimal 1 dokumen |
| VERIFIKASI | DISETUJUI | verifikator, super_admin | semua dokumen wajib berstatus TERVERIFIKASI |
| VERIFIKASI | DITOLAK | verifikator, super_admin | catatan wajib |
| DITOLAK | DRAFT | petugas, admin_arsip | perbaikan data |
| DISETUJUI | DITERBITKAN | admin_arsip, super_admin | nomor izin dan tanggal terbit terisi; `expiry_date` dihitung dari `validity_months` |
| DITERBITKAN | AKTIF | otomatis pada tanggal terbit | — |
| AKTIF | BERAKHIR | otomatis (pg_cron) | `expiry_date` terlewat |
| AKTIF/DITERBITKAN | DICABUT | super_admin | catatan wajib |
| DRAFT/DIAJUKAN/VERIFIKASI/DISETUJUI | DIBATALKAN | super_admin, admin_arsip | catatan wajib |

Setiap transisi menulis `license_status_history` dan `audit_logs`, dan mengirim notifikasi ke pihak berikutnya (mis. DIAJUKAN → notifikasi ke verifikator).

Workflow dokumen: upload versi baru → status MENUNGGU_VERIFIKASI → verifikator memilih TERVERIFIKASI atau DITOLAK (alasan wajib) → bila ditolak, notifikasi ke pengunggah, unggah versi baru menaikkan `version_no` dan menjadikannya `is_current`.

---

## 8. Roadmap Implementasi (sampai bisa di-host di Vercel)

Setiap fase diakhiri `npm run build` + `tsc --noEmit` bersih, dan saya sampaikan hasilnya sebelum lanjut.

| Fase | Isi | Hasil yang bisa dicoba |
|------|-----|------------------------|
| 1 | Scaffold Vite + React + TS + Tailwind + shadcn/ui, klien Supabase (env), Auth (login, logout, lupa password, remember session), guard rute per role, layout sidebar+topbar (drawer di tablet), dashboard kerangka, `vercel.json`, `.env.example` | Login berjalan ke proyek Supabase Anda; layout tampil; **sudah bisa di-deploy ke Vercel** |
| 2 | Migration SQL lengkap (tabel, FK, indeks, enum, trigger updated_at & audit, RLS, storage policy, fungsi workflow, `verify_license`), seed role/master/data dummy, Edge Function `admin-create-user` | Jalankan di Supabase SQL Editor; 6 user uji (satu per role) |
| 3 | CRUD Perizinan, Pemohon, Perusahaan, Master Jenis Izin; DataTable (search, filter, sort, pagination, kolom, export) | Data perizinan nyata dari DB |
| 4 | Arsip Digital: upload (validasi MIME/ukuran/ekstensi), bucket privat, metadata, preview & download signed URL | Upload dan buka file |
| 5 | Versioning, verifikasi, workflow status, audit trail UI | Siklus lengkap draft → terbit |
| 6 | QR + halaman publik `/verify/:code`, laporan + export, notifikasi (badge navbar), pencarian global + lanjutan | Fitur utama selesai |
| 7 | Audit RLS (skrip uji per role), error boundary, optimasi (code-splitting, indeks), catatan backup (PITR/dump terjadwal), build produksi, **panduan deploy Vercel** (import repo, env var, redirect URL Auth) | Siap produksi |

Ringkasan deploy Vercel (dikerjakan di Fase 1 dan dirapikan di Fase 7): framework preset Vite, build `npm run build`, output `dist`, environment variable `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`, rewrite semua rute ke `/index.html`, lalu daftarkan domain Vercel di Supabase Auth → URL Configuration.

---

## 9. Hal yang Dibutuhkan dari Anda Nanti

- Proyek Supabase (URL + anon key; service role TIDAK perlu diberikan ke saya atau frontend).
- Akun Vercel dan repo GitHub (untuk Fase 1 saya siapkan ZIP/repo siap push).
- Daftar kecamatan/desa Kabupaten Belu dan jenis izin resmi (untuk menggantikan seed dummy).

---

## 10. Perubahan terhadap desain awal (ditetapkan saat Fase 2)

Semua perubahan di bawah ini sudah tertuang di migration dan diuji (`supabase/tests`).

| # | Perubahan | Alasan |
|---|-----------|--------|
| 1 | Verifikasi dokumen hanya lewat fungsi `verify_document(version_id, result, note)`, bukan insert langsung ke `document_verifications`. | Status dokumen, status izin (DIAJUKAN → VERIFIKASI), riwayat, dan notifikasi harus berubah satu paket; insert langsung bisa membuatnya tidak konsisten. |
| 2 | Kolom `document_types.viewer_visible` (default false; hanya **Surat Izin** bernilai true). Viewer hanya melihat dokumen/file berjenis itu. | KTP, NPWP, dan berkas pribadi lain tidak pantas terbuka untuk Viewer. Pendekatan teraman sesuai instruksi "pilih yang paling aman". |
| 3 | Tabel baru `license_type_documents` (dokumen wajib per jenis izin). | Dasar perhitungan "dokumen tidak lengkap" dan syarat DISETUJUI; kebutuhan dokumen tiap jenis izin berbeda. |
| 4 | `audit_logs` ditambah `description` (kalimat siap tampil, mis. "Mengupload dokumen: NIB_PT_….pdf (versi 1)") dan `user_role`. `action` berisi kode (CREATE, UPDATE, DELETE, RESTORE, STATUS_CHANGE, UPLOAD, VERIFY). | Dashboard dan halaman Audit Log menampilkan kalimat, filter memakai kode. |
| 5 | `profiles.email` (salinan untuk tampilan daftar pengguna). | Email aslinya ada di `auth.users` yang tidak boleh dibaca klien. |
| 6 | Penjaga trigger hanya membatasi **API caller** (role `authenticated`/`anon`). SQL Editor dan `service_role` tidak dibatasi. | Pemilik proyek tetap bisa memperbaiki data lewat SQL Editor; klien tidak bisa melewati workflow. |
| 7 | Admin Arsip/Super Admin boleh menyisipkan izin langsung berstatus selain DRAFT (impor arsip izin lama). Petugas hanya DRAFT. Insert awal tercatat di `license_status_history`. | Aplikasi ini arsip: izin lama yang sudah terbit harus bisa didigitalkan. |
| 8 | Petugas dapat mengubah **data** izin miliknya hanya saat DRAFT/DIAJUKAN, tetapi dapat **mengunggah dokumen** juga saat VERIFIKASI. | Dokumen yang ditolak verifikator harus bisa diganti tanpa membuka kembali seluruh data izin. |
| 9 | Penerbitan (DISETUJUI → DITERBITKAN) otomatis lanjut ke AKTIF bila tanggal terbit ≤ hari ini; bila tanggal terbit di masa depan, cron harian yang mengaktifkan. | Menghindari klik ganda; kedua status tetap tercatat di riwayat. |
| 10 | View baru: `v_license_search` (daftar+pencarian, menyamarkan NIK/NPWP untuk Viewer), `v_staff` (nama petugas tanpa data sensitif), `v_license_completeness` (kelengkapan dokumen). | Satu sumber untuk tabel Data Perizinan dan Pencarian di Fase 3 dan 6. |
| 11 | Kode verifikasi QR tetap 12 karakter acak (A–Z/0–9). Pembuatannya dipaksa server; klien tidak bisa menentukan atau mengubahnya. | Sesuai desain; pembatasan laju permintaan publik bergantung pada rate limit Supabase (lihat Fase 7). |
| 12 | Pembuatan akun: hanya Edge Function `admin-create-user` (Super Admin), plus UI di menu **Pengguna & Role**. Profil terakhir yang berstatus Super Admin aktif tidak dapat dinonaktifkan/diturunkan. | Mencegah sistem terkunci tanpa administrator. |

---

## 11. Keputusan saat Fase 3 (CRUD Perizinan, Pemohon, Perusahaan, Master Data)

Tidak ada perubahan SQL di fase ini selain akun uji Viewer di `seed_test_users.sql`. Semua alur diuji end-to-end
terhadap PostgreSQL + PostgREST lokal (`tests/e2e`, 21 skenario) dan suite database tetap 59/59 lulus.

| # | Keputusan | Alasan |
|---|-----------|--------|
| 1 | Viewer **tidak** mendapat menu Pemohon dan Perusahaan (matriks bagian 5 menulis R). Nama pemohon/perusahaan tetap tampil di Data Perizinan melalui `v_license_search`, tanpa NIK/NPWP. | RLS (bagian 6) menolak Viewer membaca tabel `applicants`/`businesses` secara langsung; ini pilihan paling aman dan konsisten dengan penyamaran NIK. |
| 2 | Daftar izin, pemohon, perusahaan, dan master memakai paginasi, pencarian, dan urut **di server** (PostgREST `range`, `ilike`, `order`). Status tabel (kata kunci, filter, urut, halaman) disimpan di URL. | Tetap cepat untuk puluhan ribu arsip; tautan bisa dibagikan dan tombol Back kembali ke posisi semula. |
| 3 | Ekspor dari tabel = **CSV** (pemisah titik koma, BOM UTF-8, maks. 10.000 baris, mengikuti filter dan kolom yang tampil). Sel diawali `= + - @` diberi tanda kutip tunggal. Excel (.xlsx) dan PDF ada di menu Laporan (Fase 6). | Langsung terbaca Excel berbahasa Indonesia; mencegah formula injection. |
| 4 | NIK dan NIB **ditolak bila sudah terdaftar** (dicek di form, dengan tautan ke data lama). Belum dijadikan unique constraint di database. | Data arsip lama mungkin berisi duplikat; constraint dapat ditambahkan di Fase 7 setelah data dibersihkan. |
| 5 | Master data dihapus permanen (tabel master tidak punya `deleted_at`). Rujukan `ON DELETE RESTRICT` ditolak database; rujukan `ON DELETE SET NULL` (kecamatan, desa, unit, klasifikasi) dicek dulu di aplikasi agar data arsip tidak kehilangan rujukan diam-diam. Untuk jenis izin/dokumen/klasifikasi, disarankan **menonaktifkan**. | Mencegah hilangnya informasi wilayah pada izin lama. |
| 6 | Form izin: Petugas hanya melihat bagian *Data permohonan*; bagian *Data penerbitan* (nomor izin, tanggal terbit/berakhir, status awal) hanya untuk Admin Arsip dan Super Admin. Jenis izin dikunci setelah permohonan lewat tahap Diajukan. | Cermin dari trigger `guard_license_write`; database tetap penegak akhir. |
| 7 | Digitalisasi arsip izin lama: Admin memilih status awal **Aktif** atau **Berakhir**; nomor izin dan tanggal terbit wajib; tanggal berakhir dihitung dari masa berlaku jenis izin bila dikosongkan (aturan akhir bulan sama dengan PostgreSQL). | Menindaklanjuti perubahan #7 bagian 10. |
| 8 | Tombol ubah status hanya menampilkan transisi yang sah untuk role (dari `license_status_transitions`), dengan catatan wajib sesuai kolom `requires_note`. Prasyarat (dokumen terunggah/terverifikasi, nomor izin) tetap diperiksa `change_license_status()` dan pesannya ditampilkan apa adanya. | Satu sumber aturan di database. |
| 9 | Hapus pemohon/perusahaan/izin = hapus lunak oleh Super Admin. Halaman pemulihan (*restore*) dibuat bersama Audit Log di Fase 5; sementara itu data tetap ada di database. | Arsip tidak boleh hilang. |

---

## 12. Keputusan saat Fase 4 (Arsip Digital)

Migration baru: `0007_doc_status_archived.sql` (jalankan sendiri) dan `0008_archive.sql`. Suite database 69/69 lulus
(10 skenario baru, dua di antaranya diuji ulang dengan mutasi dan terbukti terdeteksi). Uji antarmuka 32/32 lulus dua
putaran berturut-turut, termasuk unggah, pratinjau, unduh, dan versi baru melalui tiruan Storage API yang memakai
policy RLS asli.

| # | Keputusan | Alasan |
|---|-----------|--------|
| 1 | Status dokumen baru **DIARSIPKAN**. Dokumen yang diunggah ke izin yang sudah melewati verifikasi (Disetujui, Diterbitkan, Aktif, Berakhir, Dicabut, Dibatalkan) langsung berstatus ini dan tidak masuk antrean verifikator. Dihitung "lengkap" di kartu kelengkapan. | `verify_document()` hanya berlaku saat izin Diajukan/Verifikasi. Tanpa status ini, Surat Izin dan hasil pindai arsip lama akan "Menunggu verifikasi" selamanya dan mengacaukan statistik dashboard. |
| 2 | Versi dokumen hanya dapat dicatat bila **file benar-benar ada di Storage** pada path itu, dengan ukuran dan MIME yang sama dengan metadata objek. | Mencegah catatan arsip "hantu" yang menunjuk file yang tidak ada atau berbeda. Pengecekan memakai fungsi baru `is_api_request()` (GUC `role` asal permintaan), karena `is_api_caller()` (`current_user`) selalu bernilai pemilik fungsi di dalam trigger `SECURITY DEFINER`. Celah ini ditemukan oleh tes, bukan asumsi. |
| 3 | RPC `create_document()` (SECURITY **INVOKER**) membuat dokumen dan versi pertama dalam satu transaksi. Semua RLS dan trigger tetap berlaku sebagai pemanggil. | Tidak ada dokumen tanpa versi bila langkah kedua gagal; tidak ada eskalasi hak. |
| 4 | Urutan unggah: **file ke Storage dulu, lalu catatan database.** Bila langkah database gagal, file yatim tertinggal di bucket (user tidak bisa menghapusnya karena tidak ada policy delete). | Urutan sebaliknya lebih buruk: catatan arsip tanpa file. File yatim tidak terlihat di aplikasi; laporan pembersihan direncanakan di Fase 7. |
| 5 | Isi file diperiksa di browser (*magic bytes* PDF/JPEG/PNG harus cocok dengan ekstensi) sebelum dikirim. Server menegakkan ukuran ≤ 10 MB, MIME header yang diizinkan, format path, hak per izin, dan kecocokan metadata. Pemeriksaan isi file di server **belum** ada. | Pemeriksaan isi di server butuh Edge Function perantara; dicatat sebagai kandidat penguatan di Fase 7. |
| 6 | Unggah memakai XHR langsung ke endpoint Storage (sama dengan `storage-js upload()`, `x-upsert: false`) agar progres persen dapat ditampilkan, dan dapat dibatalkan. | `supabase-js` belum menyediakan progres unggah. |
| 7 | Pratinjau: signed URL **5 menit**, PDF di iframe (penampil PDF bawaan browser), gambar sebagai `<img>`. Unduh: signed URL **60 detik** dengan nama file asli. Tombol *Tab baru* dan *Unduh* selalu tersedia. CSP tidak diubah (`frame-src`/`img-src` sudah mengizinkan `*.supabase.co`). | Iframe memuat dokumen dari domain Supabase, sehingga tidak mewarisi CSP aplikasi (`object-src 'none'` dapat memblokir penampil PDF bila dipakai blob URL). Perlu dicek sekali di proyek nyata: bila area pratinjau kosong, kemungkinan header Storage melarang iframe dan pratinjau akan dialihkan ke tab baru. |
| 8 | Unggah **versi baru** sudah tersedia (mis. mengganti dokumen yang ditolak; tombol *Ganti* juga muncul di kartu kelengkapan). Riwayat versi lengkap, perbandingan, dan UI verifikasi dikerjakan di Fase 5. | Alur arsip harus bisa dipakai penuh sejak fase ini. |
| 9 | Jenis dokumen tidak dapat diubah setelah diunggah (guard `guard_document_write`); judul, nomor, tanggal, dan klasifikasi dapat diubah oleh pengelola dokumen. | Jenis menentukan folder Storage dan syarat kelengkapan; mengganti jenis = dokumen baru. |
| 10 | View `v_document_search` (security_invoker) untuk halaman Arsip Digital: dokumen + versi aktif + ringkasan izin dari `v_license_search`. Viewer otomatis hanya melihat Surat Izin pada izin publik. | Satu sumber untuk tabel arsip dan pencarian lanjutan di Fase 6. |
| 11 | Batas unggah mengikuti pengaturan `max_upload_mb` (bila lebih kecil dari 10 MB). | Instansi dapat memperketat tanpa mengubah kode. |
| 12 | Bila RPC/view belum ada (migration lupa dijalankan), aplikasi menampilkan "Fitur ini membutuhkan pembaruan database…", bukan pesan teknis. `0008` diakhiri `notify pgrst, 'reload schema'`. | Ditemukan saat uji: cache skema PostgREST yang belum dimuat ulang memberi galat PGRST202. |

Perbaikan lain yang ditemukan uji di fase ini: menu tarik-turun tidak lagi tertutup sendiri saat halaman bergeser
sedikit (sekarang mengikuti posisi tombol), dan tata letak detail izin di ponsel tidak lagi melebar oleh nama file
panjang.
