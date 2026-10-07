-- ============================================================================
-- SIPAR-BELU · Audit keamanan basis data (hanya membaca, tidak mengubah apa pun)
--
-- Cara pakai: Supabase Dashboard → SQL Editor → tempel seluruh isi file ini → Run.
-- Hasil: satu tabel temuan. Target produksi: TIDAK ADA baris TINGGI maupun SEDANG.
--   TINGGI : celah yang dapat membuka data ke pihak tanpa hak → perbaiki sebelum dipakai.
--   SEDANG : penyimpangan dari desain / kebersihan produksi → perbaiki atau putuskan sadar.
--   INFO   : keterangan untuk ditinjau.
-- Jalankan ulang setiap selesai menerapkan migration baru.
-- Daftar "diizinkan" di bawah adalah keputusan desain (docs/00-DESAIN.md); ubah hanya
-- bersamaan dengan peninjauan keamanan.
-- ============================================================================
with
-- Fungsi dicocokkan per tanda tangan lengkap (nama + tipe argumen), bukan nama saja,
-- agar overload baru dengan nama sama tetap terdeteksi sebagai belum ditinjau.
allow_anon_exec(oid) as (select to_regprocedure(x) from (values ('public.verify_license(text)')) t(x)),
allow_definer_views(v) as (values ('v_license_search'), ('v_staff')),
allow_definer_fns(oid) as (select to_regprocedure(x) from (values
  ('public.current_role_code()'), ('public.has_role(text[])'), ('public.can_manage_documents(uuid)'),
  ('public.change_license_status(uuid,public.license_status,text)'),
  ('public.verify_document(uuid,public.verification_result,text)'),
  ('public.can_read_license_file(text)'), ('public.can_upload_license_file(text)'), ('public.verify_license(text)'),
  ('public.is_orphan_object(text)'), ('public.storage_integrity_report()'), ('public.is_public_license(uuid)')) t(x)),
-- Fungsi internal: hanya dipanggil trigger/cron/fungsi lain, TIDAK boleh oleh pengguna.
internal_fns(sig) as (values
  ('public.notify_user(uuid,text,text,text,text,uuid)'), ('public.notify_roles(text[],text,text,text,text,uuid)'),
  ('public.run_daily_license_maintenance()'), ('public._wrap_row_independent_calls(text)')),
-- Policy Storage yang diharapkan persis (bentuk ekspresi setelah diurai PostgreSQL).
storage_expected(policyname, cmd, expr_re) as (values
  ('sipar_docs_select', 'SELECT', '^\(\(bucket_id = ''perizinan-documents''::text\) AND can_read_license_file\(name\)\)$'),
  ('sipar_docs_insert', 'INSERT', '^\(\(bucket_id = ''perizinan-documents''::text\) AND can_upload_license_file\(name\)\)$'),
  ('sipar_docs_delete_orphan', 'DELETE', '^\(\(bucket_id = ''perizinan-documents''::text\) AND \( SELECT has_role\(VARIADIC ARRAY\[''super_admin''::text\]\) AS has_role\) AND is_orphan_object\(name\)\)$')),
append_only(tbl, privs) as (values
  ('audit_logs', 'INSERT,UPDATE,DELETE'), ('license_status_history', 'INSERT,UPDATE,DELETE'),
  ('license_status_transitions', 'INSERT,UPDATE,DELETE'), ('document_verifications', 'INSERT,UPDATE,DELETE'),
  ('document_versions', 'UPDATE,DELETE')),
rel as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.reloptions
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')),
fn as (
  select p.oid, p.proname, p.prosecdef, p.proconfig, p.prorettype = 'trigger'::regtype as is_trigger
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
findings(tingkat, pemeriksaan, objek, rincian) as (
  -- 1. Setiap tabel public wajib RLS
  select 'TINGGI', 'RLS nonaktif', relname::text, 'Aktifkan: alter table public.' || relname || ' enable row level security'
    from rel where relkind in ('r', 'p') and not relrowsecurity
  union all
  -- 2. anon tidak boleh punya hak apa pun atas tabel/view
  select 'TINGGI', 'Hak tabel untuk anon', relname::text, 'Cabut: revoke all on public.' || relname || ' from anon'
    from rel where relkind in ('r', 'p', 'v', 'm')
     and (has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          or has_any_column_privilege('anon', oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
  union all
  -- 2b. View hanya-baca: view pemilik (definer) yang dapat ditulis melewati RLS tabel dasarnya
  select 'TINGGI', 'View dapat ditulis pengguna', relname::text,
         'Cabut: revoke insert, update, delete, truncate on public.' || relname || ' from authenticated'
    from rel where relkind in ('v', 'm')
     and (has_table_privilege('authenticated', oid, 'INSERT,UPDATE,DELETE,TRUNCATE')
          or has_any_column_privilege('authenticated', oid, 'INSERT,UPDATE'))
  union all
  select 'SEDANG', 'Hak sequence untuk anon', relname::text, 'Cabut: revoke all on sequence public.' || relname || ' from anon'
    from rel where case when relkind = 'S' then has_sequence_privilege('anon', oid, 'USAGE,SELECT,UPDATE') else false end
  union all
  -- 3. Policy untuk anon/public
  select 'TINGGI', 'Policy terbuka untuk anon/public', schemaname || '.' || tablename || ' · ' || policyname,
         'Policy berlaku untuk ' || array_to_string(roles, ',') || '; desain hanya memakai role authenticated'
    from pg_policies
   where schemaname in ('public', 'storage') and roles && array['anon', 'public']::name[]
  union all
  -- 4. Fungsi yang dapat dipanggil anon
  select 'TINGGI', 'Fungsi dapat dipanggil anon', f.oid::regprocedure::text,
         'Cabut: revoke all on function ' || f.oid::regprocedure::text || ' from public, anon'
    from fn f
   where not f.is_trigger and has_function_privilege('anon', f.oid, 'EXECUTE')
     and f.oid not in (select a.oid from allow_anon_exec a where a.oid is not null)
  union all
  -- 4b. Fungsi internal tidak boleh dapat dipanggil pengguna login
  select 'TINGGI', 'Fungsi internal dapat dipanggil pengguna', i.sig,
         'Cabut: revoke all on function ' || i.sig || ' from public, anon, authenticated'
    from internal_fns i
   where to_regprocedure(i.sig) is not null and has_function_privilege('authenticated', to_regprocedure(i.sig), 'EXECUTE')
  union all
  -- 5. SECURITY DEFINER tanpa search_path tetap
  select 'TINGGI', 'SECURITY DEFINER tanpa search_path', f.oid::regprocedure::text,
         'Tambahkan "set search_path = public" pada definisi fungsi'
    from fn f
   where f.prosecdef and not exists (select 1 from unnest(coalesce(f.proconfig, '{}')) c where c like 'search_path=%')
  union all
  -- 6. SECURITY DEFINER baru yang belum ditinjau
  select 'SEDANG', 'SECURITY DEFINER belum ditinjau', f.oid::regprocedure::text,
         'Fungsi melewati RLS. Tinjau pemeriksaan hak di dalamnya, lalu tambahkan ke daftar yang diizinkan'
    from fn f
   where f.prosecdef and not f.is_trigger and has_function_privilege('authenticated', f.oid, 'EXECUTE')
     and f.oid not in (select a.oid from allow_definer_fns a where a.oid is not null)
  union all
  -- 7. View yang berjalan dengan hak pemilik (melewati RLS)
  select 'SEDANG', 'View tanpa security_invoker', relname::text,
         'View melewati RLS. Tambahkan "with (security_invoker = true)" atau saring baris di dalam view'
    from rel
   where relkind = 'v' and not coalesce('security_invoker=true' = any (reloptions) or 'security_invoker=on' = any (reloptions), false)
     and relname not in (select v from allow_definer_views)
  union all
  -- 7b. Kinerja: fungsi peran tanpa "(select …)" dievaluasi per baris (lihat 0012)
  select 'SEDANG', 'Policy memanggil fungsi peran per baris', schemaname || '.' || tablename || ' · ' || policyname,
         'Bungkus has_role()/current_role_code()/is_internal()/auth.uid() dengan (select …) agar dihitung sekali per kueri'
    from pg_policies
   where schemaname in ('public', 'storage')
     and (coalesce(qual, '') ~ '(?<!SELECT )(has_role\(|current_role_code\(\)|is_internal\(\)|can_write_archive\(\)|auth\.uid\(\))'
       or coalesce(with_check, '') ~ '(?<!SELECT )(has_role\(|current_role_code\(\)|is_internal\(\)|can_write_archive\(\)|auth\.uid\(\))')
  union all
  select 'SEDANG', 'JIT aktif untuk role API', r.rolname::text,
         'Kompilasi JIT memperlambat kueri ber-RLS. Jalankan: alter role ' || r.rolname || ' set jit = off'
    from pg_roles r
   where r.rolname in ('anon', 'authenticated')
     and not exists (select 1 from pg_db_role_setting s
                      where s.setrole = r.oid and s.setdatabase = 0 and 'jit=off' = any (s.setconfig))
  union all
  -- 8. Hak berbahaya untuk authenticated (TRUNCATE tidak tunduk pada RLS)
  select 'SEDANG', 'Hak TRUNCATE/REFERENCES/TRIGGER untuk authenticated', relname::text,
         'Cabut: revoke truncate, references, trigger on public.' || relname || ' from authenticated'
    from rel where relkind in ('r', 'p') and has_table_privilege('authenticated', oid, 'TRUNCATE,REFERENCES,TRIGGER')
  union all
  -- 9. Tabel riwayat wajib append-only
  select 'TINGGI', 'Tabel riwayat dapat diubah langsung', r.relname::text,
         'authenticated memiliki salah satu hak ' || a.privs || '; riwayat hanya boleh ditulis oleh trigger/fungsi'
    from rel r join append_only a on a.tbl = r.relname
   where has_table_privilege('authenticated', r.oid, a.privs)
      or has_any_column_privilege('authenticated', r.oid,
                                  case when a.privs like '%INSERT%' then 'INSERT,UPDATE' else 'UPDATE' end)
  union all
  -- 10. Bucket dokumen
  select 'TINGGI', 'Bucket dokumen tidak ada', 'perizinan-documents', 'Jalankan migration 0005_storage.sql'
   where not exists (select 1 from storage.buckets where id = 'perizinan-documents')
  union all
  select 'TINGGI', 'Bucket dokumen publik', id, 'File dapat diunduh tanpa login. Jalankan: update storage.buckets set public = false where id = ''perizinan-documents'''
    from storage.buckets where id = 'perizinan-documents' and public
  union all
  select 'SEDANG', 'Batas ukuran bucket', id, 'file_size_limit = ' || coalesce(file_size_limit::text, 'tidak dibatasi') || '; desain: 10485760 (10 MB)'
    from storage.buckets where id = 'perizinan-documents' and (file_size_limit is null or file_size_limit > 10485760)
  union all
  select 'SEDANG', 'Jenis file bucket', id, 'allowed_mime_types = ' || coalesce(array_to_string(allowed_mime_types, ','), 'semua') || '; desain: pdf, jpeg, png'
    from storage.buckets
   where id = 'perizinan-documents'
     and (allowed_mime_types is null or not allowed_mime_types <@ array['application/pdf', 'image/jpeg', 'image/png'])
  union all
  -- 11. Policy Storage harus persis sesuai desain: baca/unggah lewat fungsi hak akses,
  --     hapus hanya file yatim oleh Super Admin, tanpa UPDATE (file tidak pernah ditimpa).
  select 'TINGGI', 'Policy Storage tidak sesuai desain', p.tablename || ' · ' || p.policyname,
         'Perintah ' || p.cmd || ' untuk ' || array_to_string(p.roles, ',') || ': '
         || left(coalesce(p.qual, p.with_check, '-'), 200)
    from pg_policies p
    left join storage_expected e on e.policyname = p.policyname and e.cmd = p.cmd
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and (e.policyname is null
          or p.roles <> array['authenticated']::name[]
          or coalesce(p.qual, p.with_check, '') !~ e.expr_re
          or (p.qual is not null and p.with_check is not null))
  union all
  select 'TINGGI', 'Policy Storage hilang', 'objects · ' || e.policyname, 'Jalankan ulang migration 0005/0011'
    from storage_expected e
   where not exists (select 1 from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
                        and p.policyname = e.policyname)
  union all
  -- 12. Kebersihan produksi
  select 'SEDANG', 'Akun uji masih ada', u.email::text,
         'Hapus lewat Authentication → Users (akun dari seed_test_users.sql)'
    from auth.users u
   where u.email in ('superadmin@example.com', 'adminarsip@example.com', 'petugas@example.com',
                     'verifikator@example.com', 'pimpinan@example.com', 'viewer@example.com')
  union all
  select 'SEDANG', 'Data contoh masih ada', count(*)::text || ' pemohon contoh',
         'Data dari seed.sql (NIK 530100000000000x). Hapus sebelum produksi (docs/DEPLOY.md)'
    from public.applicants where nik like '530100000000000_'
  having count(*) > 0
  union all
  select 'SEDANG', 'Belum ada Super Admin aktif', '-', 'Tetapkan minimal satu akun super_admin (docs/DEPLOY.md)'
   where not exists (select 1 from public.profiles where role = 'super_admin' and is_active)
  union all
  select 'INFO', 'Jumlah Super Admin aktif', count(*)::text || ' akun',
         'Batasi seminimal mungkin (disarankan 1–2 orang)'
    from public.profiles where role = 'super_admin' and is_active
  union all
  select 'INFO', 'Jadwal pemeliharaan harian', 'pg_cron',
         case when to_regclass('cron.job') is null then 'Ekstensi pg_cron belum aktif; status izin AKTIF/BERAKHIR tidak diperbarui otomatis'
              else 'pg_cron aktif; pastikan job sipar-daily-maintenance terdaftar (select * from cron.job)' end
)
select tingkat, pemeriksaan, objek, rincian
  from (select * from findings
        union all
        select 'INFO', 'Ringkasan', '-', 'Tidak ada temuan TINGGI/SEDANG'
         where not exists (select 1 from findings where tingkat in ('TINGGI', 'SEDANG'))) hasil
 order by case tingkat when 'TINGGI' then 1 when 'SEDANG' then 2 else 3 end, pemeriksaan, objek;
