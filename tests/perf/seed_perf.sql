-- ============================================================================
-- SIPAR-BELU · Data sintetis untuk uji performa (HANYA basis data uji lokal!)
-- psql -d sipar -v n=50000 -f tests/perf/seed_perf.sql
-- Membuat :n izin (+ n/2 pemohon, 2 dokumen/izin beserta versinya). Trigger tetap berjalan
-- (riwayat status, audit), sehingga volume tabel pendukung ikut realistis.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = warning;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111103","role":"authenticated"}', false);

insert into public.applicants (full_name, nik, phone, address, district_id)
select 'Pemohon Sintetis ' || g,
       '79' || lpad(g::text, 14, '0'),
       '0812' || lpad(g::text, 8, '0'),
       'Jl. Uji Performa No. ' || g,
       (select id from public.districts order by code offset (g % 8) limit 1)
  from generate_series(1, (:n / 2)) g
 where not exists (select 1 from public.applicants where nik like '79%');

with a as (select id, row_number() over (order by nik) - 1 rn from public.applicants where nik like '79%'),
     t as (select id, row_number() over (order by code) - 1 rn from public.license_types),
     d as (select id, row_number() over (order by code) - 1 rn from public.districts),
     s(st, w) as (values ('AKTIF',40),('BERAKHIR',15),('DITERBITKAN',5),('DIAJUKAN',10),('VERIFIKASI',8),
                         ('DISETUJUI',4),('DRAFT',8),('DITOLAK',5),('DICABUT',3),('DIBATALKAN',2)),
     sx as (select st, sum(w) over (order by st) - w lo, sum(w) over (order by st) hi from s),
     g as (select g, (g * 7919) % 100 r, date '2019-01-01' + ((g * 37) % 2800) appdate from generate_series(1, :n) g)
insert into public.licenses (license_number, application_number, license_type_id, applicant_id, district_id,
                             application_date, issue_date, expiry_date, status, nib)
select case when sx.st in ('AKTIF','BERAKHIR','DITERBITKAN','DICABUT') then 'PERF/' || g.g || '/' || extract(year from g.appdate) end,
       'PRF-' || lpad(g.g::text, 7, '0'),
       t.id, a.id, d.id,
       g.appdate,
       case when sx.st in ('AKTIF','BERAKHIR','DITERBITKAN','DICABUT') then g.appdate + 14 end,
       case when sx.st = 'BERAKHIR' then greatest(least(g.appdate + 400, current_date - 1), g.appdate + 14)
            when sx.st in ('AKTIF','DICABUT') then current_date + ((g.g * 13) % 1500)
            when sx.st = 'DITERBITKAN' then current_date + 365 end,
       sx.st::public.license_status,
       case when g.g % 3 = 0 then '91' || lpad(g.g::text, 11, '0') end
  from g
  join sx on g.r >= sx.lo and g.r < sx.hi
  join t on t.rn = g.g % (select count(*) from t)
  join a on a.rn = g.g % (select count(*) from a)
  join d on d.rn = g.g % (select count(*) from d);

-- 2 dokumen per izin: KTP (terverifikasi) + Surat Izin / Surat Permohonan. ~2% menunggu verifikasi.
insert into public.documents (license_id, document_type_id, title, status, document_number, document_date)
select l.id, dt.id, dt.name || ' ' || l.application_number,
       (case when hashtext(l.id::text || dt.code) % 50 = 0 then 'MENUNGGU_VERIFIKASI' else 'TERVERIFIKASI' end)::public.doc_status,
       'DOC/' || l.application_number || '/' || dt.code, l.application_date
  from public.licenses l
  join public.document_types dt on dt.code in ('KTP', 'SURAT_PERMOHONAN')
 where l.application_number like 'PRF-%';

insert into public.document_versions (document_id, file_name, storage_path, mime_type, size_bytes, checksum_sha256)
select d.id, lower(dt.code) || '.pdf',
       l.year || '/' || l.id || '/' || dt.storage_folder || '/' || gen_random_uuid() || '-' || lower(dt.code) || '.pdf',
       'application/pdf', 50000 + (hashtext(d.id::text) & 1048575), md5(d.id::text) || md5(d.id::text || 'x')
  from public.documents d
  join public.document_types dt on dt.id = d.document_type_id
  join public.licenses l on l.id = d.license_id
 where l.application_number like 'PRF-%';

select set_config('request.jwt.claims', '', false);
analyze;
select (select count(*) from public.licenses) licenses, (select count(*) from public.documents) documents,
       (select count(*) from public.audit_logs) audit_logs, (select count(*) from public.notifications) notifications;
