-- ============================================================================
-- SIPAR-BELU · Migration 0006 · Data referensi yang WAJIB ada agar aplikasi berfungsi
-- (role, hak akses, jenis dokumen, matriks transisi, pengaturan). Bukan data uji.
-- Jalankan SETELAH 0005. Aman dijalankan ulang (on conflict do nothing).
-- ============================================================================

insert into public.roles (code, label, description) values
  ('super_admin', 'Super Admin',  'Akses seluruh sistem'),
  ('admin_arsip', 'Admin Arsip',  'Mengelola perizinan, dokumen, dan arsip'),
  ('petugas',     'Petugas',      'Input data dan unggah dokumen pada izin miliknya'),
  ('verifikator', 'Verifikator',  'Memeriksa dan memverifikasi dokumen'),
  ('pimpinan',    'Pimpinan',     'Melihat dashboard, laporan, dan arsip (hanya baca)'),
  ('viewer',      'Viewer',       'Hanya melihat izin yang sudah terbit')
on conflict (code) do nothing;

insert into public.permissions (code, module, label) values
  ('dashboard.view',  'dashboard',  'Melihat dashboard'),
  ('license.view',    'perizinan',  'Melihat data perizinan'),
  ('license.create',  'perizinan',  'Membuat perizinan'),
  ('license.update',  'perizinan',  'Mengubah perizinan'),
  ('license.delete',  'perizinan',  'Menghapus perizinan (soft delete)'),
  ('license.submit',  'perizinan',  'Mengajukan perizinan'),
  ('license.review',  'perizinan',  'Memproses verifikasi dan persetujuan izin'),
  ('license.publish', 'perizinan',  'Menerbitkan dan mengaktifkan izin'),
  ('license.revoke',  'perizinan',  'Mencabut izin'),
  ('license.cancel',  'perizinan',  'Membatalkan izin'),
  ('party.view',      'pemohon',    'Melihat pemohon dan perusahaan'),
  ('party.manage',    'pemohon',    'Mengelola pemohon dan perusahaan'),
  ('document.view',   'arsip',      'Melihat dokumen'),
  ('document.upload', 'arsip',      'Mengunggah dokumen dan versi baru'),
  ('document.delete', 'arsip',      'Menghapus dokumen (soft delete)'),
  ('document.verify', 'arsip',      'Memverifikasi dokumen'),
  ('report.view',     'laporan',    'Melihat laporan'),
  ('report.export',   'laporan',    'Mengekspor laporan'),
  ('master.view',     'master',     'Melihat master data'),
  ('master.manage',   'master',     'Mengelola master data'),
  ('user.manage',     'pengguna',   'Mengelola pengguna dan role'),
  ('audit.view',      'audit',      'Melihat audit log'),
  ('settings.manage', 'pengaturan', 'Mengelola pengaturan sistem')
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
select 'super_admin', code from public.permissions
on conflict do nothing;

insert into public.role_permissions (role_code, permission_code)
select m.role_code, p.code
  from (values
    ('admin_arsip', array['dashboard.view','license.view','license.create','license.update','license.submit',
                          'license.publish','license.cancel','party.view','party.manage','document.view',
                          'document.upload','document.delete','report.view','report.export','master.view','audit.view']),
    ('petugas',     array['dashboard.view','license.view','license.create','license.update','license.submit',
                          'party.view','party.manage','document.view','document.upload','report.view','master.view']),
    ('verifikator', array['dashboard.view','license.view','license.review','party.view','document.view',
                          'document.verify','report.view','master.view']),
    ('pimpinan',    array['dashboard.view','license.view','party.view','document.view','report.view',
                          'report.export','master.view','audit.view']),
    ('viewer',      array['dashboard.view','license.view','document.view','master.view'])
  ) as m(role_code, perms)
  cross join lateral unnest(m.perms) as p(code)
on conflict do nothing;

-- Folder penyimpanan adalah bagian dari kontrak storage (lihat 0005), jadi jenis dokumen
-- dasar ini bersifat struktural.
insert into public.document_types (code, name, storage_folder, viewer_visible) values
  ('KTP',              'KTP',                'ktp',               false),
  ('NIB',              'NIB',                'nib',               false),
  ('NPWP',             'NPWP',               'npwp',              false),
  ('SURAT_PERMOHONAN', 'Surat Permohonan',   'surat-permohonan',  false),
  ('SURAT_IZIN',       'Surat Izin',         'surat-izin',        true),
  ('DOK_PENDUKUNG',    'Dokumen Pendukung',  'dokumen-pendukung', false)
on conflict (code) do nothing;

insert into public.system_settings (key, value, description) values
  ('agency_name',         to_jsonb('Dinas Penanaman Modal dan Pelayanan Terpadu Satu Pintu Kabupaten Belu'::text),
                          'Nama instansi penerbit (tampil di halaman verifikasi publik)'),
  ('agency_short_name',   to_jsonb('DPMPTSP Kabupaten Belu'::text), 'Nama singkat instansi'),
  ('max_upload_mb',       to_jsonb(10),  'Batas ukuran file unggahan (MB). Batas keras 10 MB ditegakkan di bucket dan tabel.'),
  ('expiry_warning_days', to_jsonb(30),  'Berapa hari sebelum berakhir notifikasi "izin akan berakhir" dibuat')
on conflict (key) do nothing;

-- Matriks transisi status izin (lihat docs/00-DESAIN.md bagian 7).
insert into public.license_status_transitions (from_status, to_status, allowed_roles, requires_note)
select v.f::public.license_status, v.t::public.license_status, v.r, v.n
  from (values
    ('DRAFT',       'DIAJUKAN',    array['petugas','admin_arsip','super_admin'], false),
    ('DIAJUKAN',    'VERIFIKASI',  array['verifikator','super_admin'],           false),
    ('VERIFIKASI',  'DISETUJUI',   array['verifikator','super_admin'],           false),
    ('VERIFIKASI',  'DITOLAK',     array['verifikator','super_admin'],           true),
    ('DITOLAK',     'DRAFT',       array['petugas','admin_arsip','super_admin'], false),
    ('DISETUJUI',   'DITERBITKAN', array['admin_arsip','super_admin'],           false),
    ('DITERBITKAN', 'AKTIF',       array['admin_arsip','super_admin'],           false),
    ('AKTIF',       'BERAKHIR',    array['super_admin'],                         false),
    ('AKTIF',       'DICABUT',     array['super_admin'],                         true),
    ('DITERBITKAN', 'DICABUT',     array['super_admin'],                         true),
    ('DRAFT',       'DIBATALKAN',  array['admin_arsip','super_admin'],           true),
    ('DIAJUKAN',    'DIBATALKAN',  array['admin_arsip','super_admin'],           true),
    ('VERIFIKASI',  'DIBATALKAN',  array['admin_arsip','super_admin'],           true),
    ('DISETUJUI',   'DIBATALKAN',  array['admin_arsip','super_admin'],           true)
  ) as v(f, t, r, n)
on conflict (from_status, to_status) do nothing;
