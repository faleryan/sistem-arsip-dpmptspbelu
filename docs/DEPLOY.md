# Panduan Deploy Produksi SIPAR-BELU

Panduan langkah demi langkah dari nol sampai aplikasi dipakai pegawai, ditambah daftar periksa sebelum dan
sesudah *go-live*. Perkiraan waktu: 1–2 jam untuk pertama kali.

> **Prinsip:** gunakan **dua proyek Supabase terpisah** — satu untuk **uji** (boleh berisi `seed.sql` dan akun
> uji) dan satu untuk **produksi** (hanya migration, tanpa data contoh). Jangan pernah menjalankan
> `seed.sql` atau `seed_test_users.sql` di proyek produksi.

Daftar isi:
1. [Yang perlu disiapkan](#1-yang-perlu-disiapkan)
2. [Proyek Supabase produksi](#2-proyek-supabase-produksi)
3. [Database: migration](#3-database-migration)
4. [Autentikasi](#4-autentikasi)
5. [Edge Function pembuat akun](#5-edge-function-pembuat-akun)
6. [Super Admin pertama](#6-super-admin-pertama)
7. [Vercel](#7-vercel)
8. [Domain sendiri (opsional)](#8-domain-sendiri-opsional)
9. [Data awal](#9-data-awal)
10. [Audit keamanan & daftar periksa go-live](#10-audit-keamanan--daftar-periksa-go-live)
11. [Memperbarui aplikasi](#11-memperbarui-aplikasi)
12. [Pemecahan masalah](#12-pemecahan-masalah)

---

## 1. Yang perlu disiapkan

| Kebutuhan | Keterangan |
|---|---|
| Akun **GitHub** | Tempat kode. Repository boleh privat. |
| Akun **Vercel** | Hosting frontend. Paket Hobby cukup untuk mencoba; untuk instansi pertimbangkan Pro (lihat ketentuan Vercel tentang penggunaan non-pribadi). |
| Akun **Supabase** | Database, login, penyimpanan file. **Pro** disarankan untuk produksi: backup harian otomatis 7 hari (paket Free **tidak** punya backup otomatis) dan proyek tidak dijeda saat tidak aktif. |
| **Layanan email (SMTP)** | Wajib untuk produksi (email lupa kata sandi). Bisa SMTP instansi atau layanan seperti Resend/Brevo/SendGrid/AWS SES. |
| (Opsional) **Domain** | Mis. `sipar.belukab.go.id`. Tetapkan **sebelum** mencetak QR massal. |

## 2. Proyek Supabase produksi

1. supabase.com → **New project**. Region: **Southeast Asia (Singapore)** (terdekat dengan NTT).
2. Simpan **Database password** di pengelola kata sandi instansi (dibutuhkan untuk `pg_dump`/backup).
3. **Project Settings → API**: catat **Project URL** dan **anon / publishable key**.
   Kunci **service_role / secret** tidak dipakai di frontend; hanya untuk alat backup di komputer admin
   (lihat [`BACKUP.md`](BACKUP.md)).

## 3. Database: migration

Buka **SQL Editor**, lalu jalankan isi setiap file di `supabase/migrations/` **berurutan, satu file per Run**:

```
0001 → 0002 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 → 0011 → 0012 → 0013
```

- `0007` **harus dijalankan sendiri** (PostgreSQL tidak mengizinkan nilai enum baru dipakai pada eksekusi yang sama).
- Semua file aman dijalankan ulang.
- **Penjadwalan harian (pg_cron)**: bila muncul catatan bahwa `pg_cron` belum aktif, aktifkan di
  **Database → Extensions** (cari `pg_cron`), lalu jalankan ulang `0003`. Job `sipar-daily-maintenance`
  berjalan pukul 00.05 WITA: izin *Diterbitkan* → *Aktif*, *Aktif* yang lewat masa berlaku → *Berakhir*, dan
  notifikasi "akan berakhir". Periksa dengan `select * from cron.job;`.
- `0012` mematikan JIT PostgreSQL untuk role API (terukur memperlambat kueri ±0,9 detik). Bila muncul catatan
  bahwa JIT tidak dapat dimatikan, jalankan di SQL Editor:
  `alter role authenticated set jit = off; alter role anon set jit = off;`

Sudah memakai fase sebelumnya? Cukup jalankan file yang belum: Fase 7 = `0011`, `0012`, `0013`.

## 4. Autentikasi

1. **Authentication → Sign In / Providers → Email**: matikan **Allow new users to sign up**.
   Akun hanya dibuat oleh Super Admin dari menu *Pengguna & Role*.
2. **Authentication → URL Configuration** (isi setelah domain Vercel diketahui, langkah 7):
   - **Site URL**: `https://domain-anda`
   - **Redirect URLs**: `https://domain-anda/reset-password`
3. **SMTP kustom** — **wajib untuk produksi**. Layanan email bawaan Supabase hanya mengirim ke alamat anggota
   tim proyek dan dibatasi sekitar 2 email per jam, tanpa jaminan pengiriman. Atur di
   **Authentication → Emails → SMTP Settings**: host, port, user, password, alamat pengirim
   (mis. `no-reply@belukab.go.id`). Setelah SMTP kustom aktif, batas awalnya 30 email per jam; ubah di
   **Authentication → Rate Limits** bila perlu. Uji dengan fitur *Lupa kata sandi*.
4. (Disarankan) **Authentication → Policies/Password**: panjang minimal kata sandi 10 (sama dengan aplikasi).

## 5. Edge Function pembuat akun

Satu-satunya jalur pembuatan akun dan reset kata sandi oleh Super Admin.

- **Dashboard**: Edge Functions → *Deploy a new function* → nama **`admin-create-user`** → tempel isi
  `supabase/functions/admin-create-user/index.ts` → Deploy. Biarkan **Verify JWT** aktif.
- **atau CLI**: `supabase functions deploy admin-create-user --project-ref <ref>`.
- **Secret** (Edge Functions → Secrets / Manage secrets): `ALLOWED_ORIGINS` =
  `https://domain-anda,https://nama-proyek.vercel.app` (dipisah koma, tanpa garis miring di akhir).
  Kunci service_role disuntik otomatis oleh Supabase — jangan menyalinnya ke mana pun.

## 6. Super Admin pertama

1. **Authentication → Users → Add user → Create new user**: email dan kata sandi kuat, centang *Auto Confirm*.
2. SQL Editor:
   ```sql
   insert into public.profiles (id, full_name, role, email)
   select id, 'Nama Lengkap Super Admin', 'super_admin', email
     from auth.users where email = 'email-anda@belukab.go.id'
   on conflict (id) do update set role = 'super_admin', is_active = true;
   ```
3. Akun lain dibuat dari aplikasi (*Pengguna & Role*). Batasi Super Admin 1–2 orang.

## 7. Vercel

1. Push folder proyek ke GitHub (root repository = folder ini).
2. vercel.com → **Add New → Project** → pilih repository. Framework terdeteksi **Vite**; build `npm run build`,
   output `dist` (sudah diatur di `vercel.json`).
3. **Environment Variables** (centang Production dan Preview):

   | Nama | Nilai |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL, mis. `https://abcdefgh.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | anon / publishable key |
   | `VITE_PUBLIC_APP_URL` | (opsional) domain yang dicetak di QR, mis. `https://sipar.belukab.go.id` |

   **Jangan** menambahkan kunci service_role/secret di Vercel. Semua variabel `VITE_*` ikut terkirim ke peramban.
4. **Deploy**. Setelah selesai, isi Site URL & Redirect URLs di Supabase (langkah 4.2).
5. **Kunci CSP ke proyek Anda** (disarankan): di `vercel.json`, ganti setiap `*.supabase.co` pada
   `Content-Security-Policy` dengan host proyek Anda, mis. `https://abcdefgh.supabase.co` dan
   `wss://abcdefgh.supabase.co`, lalu commit. Dengan begitu halaman hanya dapat berbicara dengan proyek Supabase
   Anda sendiri.
6. Setiap mengubah environment variable → **Redeploy** (nilai `VITE_*` ditanam saat build).

## 8. Domain sendiri (opsional)

1. Vercel → Project → **Settings → Domains** → tambahkan `sipar.belukab.go.id`; ikuti instruksi DNS
   (CNAME ke `cname.vercel-dns.com` untuk subdomain). HTTPS dibuat otomatis.
2. Perbarui: Supabase Site URL & Redirect URLs, secret `ALLOWED_ORIGINS`, dan `VITE_PUBLIC_APP_URL` → Redeploy.
3. Tetapkan domain final **sebelum** mencetak label QR: QR yang tercetak memuat domain saat dicetak.

## 9. Data awal

Masuk sebagai Super Admin, lalu isi lewat **Master Data**:

1. **Kecamatan & Desa/Kelurahan** Kabupaten Belu (daftar resmi).
2. **Jenis Izin** beserta masa berlaku (bulan) dan **dokumen wajib** tiap jenis izin.
3. **Jenis Dokumen** (sudah ada bawaan: KTP, NIB, NPWP, Surat Permohonan, Surat Izin, dst. — sesuaikan).
4. **Klasifikasi Arsip** sesuai pedoman kearsipan instansi.
5. **Unit/Bidang**.
6. **Pengaturan**: nama instansi (kop laporan & label QR), batas unggah, hari peringatan masa berlaku.
7. Buat akun pegawai di **Pengguna & Role**.

Arsip izin lama dapat dimasukkan Admin Arsip lewat *Tambah Perizinan* dengan status Aktif/Berakhir (impor arsip),
lalu unggah pindaian surat izinnya.

## 10. Audit keamanan & daftar periksa go-live

Jalankan **`supabase/audit/security_audit.sql`** di SQL Editor proyek produksi. Target: **tidak ada baris
TINGGI maupun SEDANG**. Skrip hanya membaca katalog (tidak mengubah apa pun) dan memeriksa antara lain: RLS di
semua tabel, tidak ada akses anon selain `verify_license`, view hanya-baca, fungsi SECURITY DEFINER tertinjau
dan ber-`search_path`, fungsi internal tertutup, policy Storage persis sesuai desain, bucket privat 10 MB
PDF/JPG/PNG, tabel riwayat append-only, akun uji/data contoh tidak ada, JIT mati, dan pg_cron.

Daftar periksa:

- [ ] Audit keamanan: 0 TINGGI, 0 SEDANG.
- [ ] *Allow new users to sign up* = **off**.
- [ ] SMTP kustom aktif; email lupa kata sandi diterima dan tautannya kembali ke `/reset-password`.
- [ ] Site URL & Redirect URLs berisi domain produksi.
- [ ] Edge Function `admin-create-user` ter-deploy; `ALLOWED_ORIGINS` diisi; membuat 1 akun uji coba berhasil
      lalu akun itu dinonaktifkan.
- [ ] Vercel: hanya `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, (opsional) `VITE_PUBLIC_APP_URL`.
- [ ] CSP `vercel.json` dikunci ke host proyek.
- [ ] `pg_cron` aktif dan job `sipar-daily-maintenance` terdaftar.
- [ ] Uji asap per role: login → unggah PDF di detail izin → pratinjau → verifikasi → terbitkan → pindai QR dari
      ponsel → ekspor laporan PDF/Excel.
- [ ] Bila pratinjau PDF tampil kosong di peramban tertentu, tombol **Tab baru**/**Unduh** tersedia; laporkan.
- [ ] **Pengaturan → Integritas penyimpanan → Periksa sekarang**: tidak ada temuan.
- [ ] Rencana backup berjalan (paket Pro/PITR dan/atau `pg_dump` + `backup-storage.mjs`, lihat [`BACKUP.md`](BACKUP.md)).
- [ ] **Pengaturan → Informasi sistem** menampilkan versi & waktu build terbaru.

## 11. Memperbarui aplikasi

1. Baca catatan rilis: migration baru dijalankan **lebih dulu** di proyek uji, lalu produksi (urutan nomor).
2. Jalankan ulang `security_audit.sql` setelah setiap migration.
3. Push ke GitHub → Vercel membangun dan men-deploy otomatis. Pengguna yang sedang membuka aplikasi versi lama
   akan dimuat ulang otomatis sekali ketika membuka halaman yang file-nya sudah berganti.
4. Rollback frontend: Vercel → Deployments → pilih deploy sebelumnya → **Promote to Production**.
   Migration database tidak di-rollback otomatis; pulihkan dari backup bila benar-benar perlu.

## 12. Pemecahan masalah

| Gejala | Penyebab umum & solusi |
|---|---|
| Layar "Konfigurasi belum lengkap" | `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` belum diisi → isi lalu Redeploy. |
| "Fitur ini membutuhkan pembaruan database" | Migration terbaru belum dijalankan, atau cache skema API belum dimuat ulang → jalankan migration; atau SQL Editor: `notify pgrst, 'reload schema';` |
| Menambah pengguna gagal: "Edge Function … belum di-deploy" / "Tidak dapat menghubungi Edge Function" | Langkah 5. Periksa nama fungsi persis `admin-create-user` dan isi `ALLOWED_ORIGINS` (domain persis, termasuk `https://`). |
| Email lupa kata sandi tidak sampai | SMTP kustom belum diatur / batas laju email; periksa Authentication → Logs. |
| Tautan email membuka localhost | Site URL belum diganti ke domain produksi. |
| Daftar terasa lambat setelah data besar | Pastikan `0012` sudah dijalankan dan JIT mati (`show jit;` sebagai role authenticated). |
| Unggah ditolak "batas" | File > batas di Pengaturan (maks. 10 MB) atau > 20 unggahan tanpa catatan pada satu izin dalam 24 jam (unggahan yang gagal disimpan). |
| Ingin menghapus akun uji | Authentication → Users → hapus. Super Admin aktif terakhir tidak dapat dihapus. |

Sumber (diperiksa Oktober 2026): [Supabase — Database Backups](https://supabase.com/docs/guides/platform/backups),
[Supabase — Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
