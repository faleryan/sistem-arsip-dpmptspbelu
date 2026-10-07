-- ============================================================================
-- SIPAR-BELU · Migration 0012 · Kinerja RLS
-- Jalankan SETELAH 0011. Aman dijalankan ulang. Tidak mengubah SIAPA boleh melihat apa.
--
-- Masalah (terukur pada 50.000 izin): fungsi peran seperti has_role('viewer') dievaluasi
-- untuk SETIAP baris karena fungsi SECURITY DEFINER tidak pernah di-inline oleh PostgreSQL.
-- Daftar izin halaman pertama butuh ±8 detik.
-- Solusi (pola yang dianjurkan Supabase): bungkus fungsi yang tidak bergantung pada baris
-- dengan "(select …)" sehingga dihitung SEKALI per kueri (InitPlan).
-- Fungsi yang bergantung pada baris (can_manage_documents(license_id), can_read_license_file(name),
-- can_upload_license_file(name), is_orphan_object(name)) sengaja tidak dibungkus.
-- ============================================================================

-- ── 1. Policy RLS: bungkus otomatis di semua policy schema public & storage ──
create or replace function public._wrap_row_independent_calls(p_expr text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(
           regexp_replace(
             p_expr,
             -- has_role(...) dengan argumen konstanta, dan fungsi tanpa argumen
             '(?<!SELECT )(has_role\(VARIADIC ARRAY\[[^\]]*\]\)|current_role_code\(\)|is_internal\(\)|can_write_archive\(\)|auth\.uid\(\))',
             '(SELECT \1)', 'g'),
           '\s+', ' ', 'g')
$$;
revoke all on function public._wrap_row_independent_calls(text) from public, anon, authenticated;

do $$
declare
  p record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname in ('public', 'storage')
       and (qual ~ '(?<!SELECT )(has_role\(|current_role_code\(\)|is_internal\(\)|can_write_archive\(\)|auth\.uid\(\))'
         or with_check ~ '(?<!SELECT )(has_role\(|current_role_code\(\)|is_internal\(\)|can_write_archive\(\)|auth\.uid\(\))')
  loop
    v_using := case when p.qual is not null then public._wrap_row_independent_calls(p.qual) end;
    v_check := case when p.with_check is not null then public._wrap_row_independent_calls(p.with_check) end;
    v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename)
          || coalesce(' using (' || v_using || ')', '')
          || coalesce(' with check (' || v_check || ')', '');
    execute v_sql;
  end loop;
end $$;

-- ── 2. View daftar izin: hak & penyamaran dihitung sekali per kueri ─────────
create or replace view public.v_license_search as
  select l.id, l.license_number, l.application_number, l.nib, l.year, l.status,
         l.application_date, l.issue_date, l.expiry_date,
         l.license_type_id, lt.code as license_type_code, lt.name as license_type_name,
         l.district_id, dis.name as district_name,
         l.applicant_id, a.full_name as applicant_name,
         case when (select public.current_role_code()) = 'viewer' then null else a.nik end  as applicant_nik,
         case when (select public.current_role_code()) = 'viewer' then null else a.npwp end as applicant_npwp,
         l.business_id, b.name as business_name,
         l.officer_id, l.created_at
    from public.licenses l
    join public.license_types lt on lt.id = l.license_type_id
    join public.applicants a on a.id = l.applicant_id
    left join public.businesses b on b.id = l.business_id
    left join public.districts dis on dis.id = l.district_id
   where l.deleted_at is null
     and ((select public.is_internal())
          or ((select public.has_role('viewer')) and l.status in ('DITERBITKAN','AKTIF','BERAKHIR')));

create or replace view public.v_staff as
  select p.id, p.full_name, p.role, p.unit_id
    from public.profiles p
   where p.is_active and (select public.current_role_code()) is not null;

-- ── 3. document_versions: cek induk sekali (hash) alih-alih per baris ──────
-- Hak baca versi = hak baca dokumen induknya (RLS documents tetap berlaku di subkueri).
alter policy document_versions_select on public.document_versions
  using (document_id in (select d.id from public.documents d));

-- ── 4. JIT dimatikan untuk role API ─────────────────────────────────────────
-- Estimasi biaya kueri ber-RLS tinggi sehingga PostgreSQL menyalakan kompilasi JIT
-- (terukur ±0,9 detik per kueri) untuk kueri yang sebenarnya hanya butuh puluhan milidetik.
-- Aplikasi ini OLTP: JIT tidak bermanfaat. PostgREST menerapkan setelan role ini per permintaan.
do $$
begin
  alter role authenticated set jit = off;
  alter role anon set jit = off;
exception when insufficient_privilege then
  raise notice 'JIT tidak dapat dimatikan otomatis (%). Lihat docs/DEPLOY.md bagian Kinerja.', sqlerrm;
end $$;

-- ── 5. Indeks untuk urutan bawaan daftar izin (terbaru dulu) ───────────────
create index if not exists idx_licenses_created_active on public.licenses (created_at desc, id) where deleted_at is null;

analyze public.licenses, public.documents, public.document_versions, public.applicants, public.audit_logs, public.notifications;

notify pgrst, 'reload schema';
