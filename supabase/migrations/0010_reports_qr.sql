-- ============================================================================
-- SIPAR-BELU · Migration 0010 · Verifikasi QR (tanggal berakhir) & fungsi laporan (Fase 6)
-- Jalankan SETELAH 0009. Aman dijalankan ulang.
-- ============================================================================

-- ── 1. Halaman publik QR: tambah tanggal berakhir ──────────────────────────
-- Tanggal berakhir tercetak di surat izin, jadi aman untuk publik dan penting bagi pemeriksa
-- ("apakah izin ini masih berlaku?"). Tipe hasil berubah → fungsi harus di-drop dulu.
drop function if exists public.verify_license(text);
create function public.verify_license(p_code text)
returns table (
  license_number text, license_type text, holder_name text,
  issue_date date, expiry_date date, status text, agency text
)
language sql stable security definer set search_path = public as $$
  select l.license_number, lt.name, coalesce(b.name, a.full_name), l.issue_date, l.expiry_date, l.status::text,
         coalesce((select s.value #>> '{}' from public.system_settings s where s.key = 'agency_name'),
                  'DPMPTSP Kabupaten Belu')
    from public.licenses l
    join public.license_types lt on lt.id = l.license_type_id
    join public.applicants a on a.id = l.applicant_id
    left join public.businesses b on b.id = l.business_id
   where p_code ~* '^[A-Z0-9]{12}$'
     and l.verification_code = upper(p_code)
     and l.deleted_at is null
     and l.status in ('DITERBITKAN','AKTIF','BERAKHIR','DICABUT')
$$;
revoke all on function public.verify_license(text) from public;
grant execute on function public.verify_license(text) to anon, authenticated;

-- ── 2. Fungsi laporan ──────────────────────────────────────────────────────
-- Semuanya SECURITY INVOKER dan membaca view yang sudah menyaring baris per role
-- (v_license_search, v_document_search), jadi hasilnya mengikuti hak pemanggil.

-- Rekap jumlah izin per jenis izin × kecamatan × status dalam periode.
-- p_basis: 'application' (tanggal permohonan) atau 'issue' (tanggal terbit).
create or replace function public.report_license_summary(
  p_from        date default null,
  p_to          date default null,
  p_basis       text default 'application',
  p_district_id uuid default null
) returns table (
  license_type_id uuid, license_type_name text,
  district_id uuid, district_name text,
  status public.license_status, total bigint
)
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_basis not in ('application', 'issue') then
    raise exception 'Dasar tanggal laporan tidak dikenal: %', p_basis using errcode = '22023';
  end if;
  return query
    select v.license_type_id, v.license_type_name, v.district_id, v.district_name, v.status, count(*)::bigint
      from public.v_license_search v
     where (p_district_id is null or v.district_id = p_district_id)
       and (p_from is null or (case when p_basis = 'issue' then v.issue_date else v.application_date end) >= p_from)
       and (p_to   is null or (case when p_basis = 'issue' then v.issue_date else v.application_date end) <= p_to)
     group by 1, 2, 3, 4, 5;
end $$;

-- Tren bulanan dalam satu tahun: jumlah permohonan masuk dan izin terbit per bulan.
create or replace function public.report_monthly(p_year integer)
returns table (month integer, submitted bigint, issued bigint)
language sql stable security invoker set search_path = public as $$
  with v as (
    select application_date, issue_date
      from public.v_license_search
     where extract(year from application_date) = p_year
        or extract(year from issue_date) = p_year
  )
  select m.m,
         count(*) filter (where extract(year from v.application_date) = p_year
                            and extract(month from v.application_date) = m.m),
         count(*) filter (where extract(year from v.issue_date) = p_year
                            and extract(month from v.issue_date) = m.m)
    from generate_series(1, 12) as m(m)
    left join v on true
   group by m.m
   order by m.m
$$;

-- Rekap dokumen arsip per jenis dokumen × status (tanggal unggah dokumen dalam periode).
create or replace function public.report_document_summary(p_from date default null, p_to date default null)
returns table (document_type_name text, status public.doc_status, total bigint)
language sql stable security invoker set search_path = public as $$
  select d.document_type_name, d.status, count(*)::bigint
    from public.v_document_search d
   where (p_from is null or d.created_at >= p_from::timestamp at time zone 'Asia/Makassar')
     and (p_to   is null or d.created_at <  (p_to + 1)::timestamp at time zone 'Asia/Makassar')
   group by 1, 2
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.report_license_summary(date, date, text, uuid)',
    'public.report_monthly(integer)',
    'public.report_document_summary(date, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Laporan "akan berakhir" menyaring izin aktif berdasarkan tanggal berakhir.
create index if not exists idx_licenses_expiry_active
  on public.licenses (expiry_date) where status = 'AKTIF' and deleted_at is null;

notify pgrst, 'reload schema';
