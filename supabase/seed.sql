-- ============================================================================
-- SIPAR-BELU · seed.sql · DATA CONTOH UNTUK PENGUJIAN
-- Jalankan SETELAH 0006. Aman dijalankan ulang. HAPUS/ganti sebelum produksi.
--
-- • Semua nama, NIK, NPWP, NIB, dan nomor di sini adalah DATA DUMMY (bukan data pribadi nyata).
-- • Daftar kecamatan/desa, jenis izin, dan klasifikasi arsip hanyalah CONTOH. Ganti dengan
--   data resmi lewat menu Master Data (Fase 3) — jangan mengandalkan daftar ini.
-- • Dokumen contoh hanya berisi METADATA tanpa file fisik: pratinjau/unduh baru berfungsi untuk
--   dokumen yang Anda unggah sendiri lewat aplikasi (Fase 4).
-- ============================================================================

-- ── Master (CONTOH) ─────────────────────────────────────────────────────────
insert into public.units (name) values
  ('Bidang Pelayanan Perizinan'), ('Bidang Penanaman Modal'), ('Sekretariat')
on conflict (name) do nothing;

insert into public.districts (code, name) values
  ('K01', 'Kota Atambua'), ('K02', 'Atambua Barat'), ('K03', 'Atambua Selatan'),
  ('K04', 'Kakuluk Mesak'), ('K05', 'Tasifeto Barat'), ('K06', 'Tasifeto Timur'),
  ('K07', 'Raihat'), ('K08', 'Lamaknen')
on conflict (code) do nothing;

insert into public.villages (district_id, code, name, type)
select d.id, d.code || '-' || v.c, v.n, v.t
  from public.districts d
  cross join (values ('01', 'Desa Contoh 1', 'desa'), ('02', 'Kelurahan Contoh 2', 'kelurahan')) as v(c, n, t)
on conflict (district_id, name) do nothing;

insert into public.license_types (code, name, category, description, validity_months) values
  ('IU', 'Izin Usaha',                 'Usaha',       'CONTOH — sesuaikan dengan jenis izin resmi', 60),
  ('IO', 'Izin Operasional',           'Operasional', 'CONTOH — sesuaikan dengan jenis izin resmi', 36),
  ('IL', 'Izin Lokasi',                'Lokasi',      'CONTOH — sesuaikan dengan jenis izin resmi', 24),
  ('IT', 'Izin Tertentu Lainnya',      'Lainnya',     'CONTOH — sesuaikan dengan jenis izin resmi', null)
on conflict (code) do nothing;

insert into public.archive_classes (code, name, description) values
  ('ARS-01', 'Arsip Aktif',   'CONTOH klasifikasi'),
  ('ARS-02', 'Arsip Inaktif', 'CONTOH klasifikasi'),
  ('ARS-03', 'Arsip Vital',   'CONTOH klasifikasi')
on conflict (code) do nothing;

-- Dokumen wajib per jenis izin (CONTOH): KTP + Surat Permohonan untuk semua;
-- NIB + NPWP tambahan untuk Izin Usaha dan Izin Operasional.
insert into public.license_type_documents (license_type_id, document_type_id)
select lt.id, dt.id
  from public.license_types lt
  join public.document_types dt
    on dt.code in ('KTP', 'SURAT_PERMOHONAN')
    or (lt.code in ('IU', 'IO') and dt.code in ('NIB', 'NPWP'))
 where lt.code in ('IU', 'IO', 'IL', 'IT')
on conflict do nothing;

-- ── Pemohon & perusahaan (DUMMY) ────────────────────────────────────────────
insert into public.applicants (full_name, nik, npwp, phone, email, address, district_id, village_id)
select v.n, v.nik, v.npwp, v.ph, v.em, v.ad, d.id,
       (select vl.id from public.villages vl where vl.district_id = d.id order by vl.name limit 1)
  from (values
    ('Pemohon Contoh Satu',  '5301000000000001', '00.000.000.1-000.000', '081200000001', 'pemohon1@example.com', 'Jl. Contoh No. 1', 'K01'),
    ('Pemohon Contoh Dua',   '5301000000000002', '00.000.000.2-000.000', '081200000002', 'pemohon2@example.com', 'Jl. Contoh No. 2', 'K02'),
    ('Pemohon Contoh Tiga',  '5301000000000003', null,                   '081200000003', 'pemohon3@example.com', 'Jl. Contoh No. 3', 'K05'),
    ('Pemohon Contoh Empat', '5301000000000004', '00.000.000.4-000.000', '081200000004', 'pemohon4@example.com', 'Jl. Contoh No. 4', 'K04'),
    ('Pemohon Contoh Lima',  '5301000000000005', null,                   '081200000005', 'pemohon5@example.com', 'Jl. Contoh No. 5', 'K07')
  ) as v(n, nik, npwp, ph, em, ad, dc)
  join public.districts d on d.code = v.dc
on conflict do nothing;

insert into public.businesses (name, nib, npwp, entity_type, address, district_id, phone, email, person_in_charge)
select v.n, v.nib, v.npwp, v.et, v.ad, d.id, v.ph, v.em, v.pic
  from (values
    ('PT Contoh Belu Sejahtera',    '9120000000001', '00.000.001.0-000.000', 'PT', 'Jl. Usaha Contoh No. 10', 'K01', '0389000001', 'usaha1@example.com', 'Pemohon Contoh Satu'),
    ('CV Contoh Atambua Jaya',      '9120000000002', '00.000.002.0-000.000', 'CV', 'Jl. Usaha Contoh No. 20', 'K02', '0389000002', 'usaha2@example.com', 'Pemohon Contoh Dua'),
    ('UD Contoh Tasifeto Mandiri',  '9120000000003', null,                   'UD', 'Jl. Usaha Contoh No. 30', 'K05', '0389000003', 'usaha3@example.com', 'Pemohon Contoh Empat')
  ) as v(n, nib, npwp, et, ad, dc, ph, em, pic)
  join public.districts d on d.code = v.dc
on conflict do nothing;

-- ── Perizinan (DUMMY) ───────────────────────────────────────────────────────
-- Dijalankan sebagai pemilik database, sehingga status boleh diisi langsung (impor arsip).
insert into public.licenses
  (license_number, application_number, license_type_id, applicant_id, business_id, district_id,
   application_date, issue_date, expiry_date, status, notes)
select v.ln, v.an,
       (select id from public.license_types where code = v.tc),
       (select id from public.applicants    where nik  = v.nik),
       (select id from public.businesses    where nib  = v.nib),
       (select id from public.districts     where code = v.dc),
       v.ad, v.idt, v.edt, v.st::public.license_status,
       '[SEED] data contoh untuk pengujian'
  from (values
    ('IZIN/IU/0001/2026', 'PMH-2026-90001', 'IU', '5301000000000001', '9120000000001', 'K01',
       (current_date - 210), (current_date - 200), (current_date - 200 + interval '60 months')::date, 'AKTIF'),
    ('IZIN/IO/0002/2026', 'PMH-2026-90002', 'IO', '5301000000000002', '9120000000002', 'K02',
       (current_date - 400), (current_date - 390), (current_date + 20), 'AKTIF'),
    ('IZIN/IL/0003/2021', 'PMH-2021-90003', 'IL', '5301000000000003', null,            'K05',
       date '2021-01-15', date '2021-02-01', date '2024-02-01', 'BERAKHIR'),
    (null,                'PMH-2026-90004', 'IU', '5301000000000004', '9120000000003', 'K04',
       current_date, null::date, null::date, 'DRAFT'),
    (null,                'PMH-2026-90005', 'IO', '5301000000000005', null,            'K07',
       (current_date - 5), null::date, null::date, 'DIAJUKAN'),
    (null,                'PMH-2026-90006', 'IU', '5301000000000001', '9120000000001', 'K01',
       (current_date - 12), null::date, null::date, 'VERIFIKASI')
  ) as v(ln, an, tc, nik, nib, dc, ad, idt, edt, st)
on conflict (application_number) do nothing;

-- ── Dokumen contoh (metadata saja; tanpa file fisik) ────────────────────────
create or replace function pg_temp.seed_doc(
  p_app_no text, p_type text, p_number text, p_final public.doc_status,
  p_versions int default 1, p_reject_first boolean default false
) returns void language plpgsql as $$
declare
  l public.licenses; dt public.document_types; v_doc uuid; v_ver uuid; n int;
begin
  select * into l  from public.licenses       where application_number = p_app_no;
  select * into dt from public.document_types where code = p_type;
  if l.id is null or dt.id is null then return; end if;
  if exists (select 1 from public.documents where license_id = l.id and document_type_id = dt.id) then return; end if;

  insert into public.documents (license_id, document_type_id, title, document_number, document_date, archive_class_id)
  values (l.id, dt.id, dt.name || ' (contoh)', p_number, current_date - 30,
          (select id from public.archive_classes where code = 'ARS-01'))
  returning id into v_doc;

  for n in 1 .. p_versions loop
    insert into public.document_versions (document_id, file_name, storage_path, mime_type, size_bytes)
    values (v_doc, dt.code || '_Contoh_v' || n || '.pdf',
            format('%s/%s/%s/%s-%s', l.year, l.id, dt.storage_folder, gen_random_uuid(), dt.code || '_Contoh_v' || n || '.pdf'),
            'application/pdf', 120000 + n)
    returning id into v_ver;
    if p_reject_first and n = 1 and p_versions > 1 then
      insert into public.document_verifications (document_version_id, result, note)
      values (v_ver, 'DITOLAK', 'Dokumen tidak terbaca.');
      update public.documents set status = 'DITOLAK' where id = v_doc;
    end if;
  end loop;

  if p_final = 'TERVERIFIKASI' then
    insert into public.document_verifications (document_version_id, result)
    values (v_ver, 'TERVERIFIKASI');
  end if;
  update public.documents set status = p_final where id = v_doc;
end $$;

select pg_temp.seed_doc('PMH-2026-90001', t, 'DOK-' || t || '-001', 'TERVERIFIKASI')
  from unnest(array['KTP','NIB','NPWP','SURAT_PERMOHONAN','SURAT_IZIN']) as t;
select pg_temp.seed_doc('PMH-2026-90002', t, 'DOK-' || t || '-002', 'TERVERIFIKASI')
  from unnest(array['KTP','NIB','NPWP','SURAT_PERMOHONAN','SURAT_IZIN']) as t;
select pg_temp.seed_doc('PMH-2021-90003', t, 'DOK-' || t || '-003', 'TERVERIFIKASI')
  from unnest(array['KTP','SURAT_PERMOHONAN','SURAT_IZIN']) as t;

select pg_temp.seed_doc('PMH-2026-90005', 'KTP', 'DOK-KTP-005', 'MENUNGGU_VERIFIKASI');

select pg_temp.seed_doc('PMH-2026-90006', 'KTP',              'DOK-KTP-006', 'TERVERIFIKASI');
select pg_temp.seed_doc('PMH-2026-90006', 'SURAT_PERMOHONAN', 'DOK-SP-006',  'MENUNGGU_VERIFIKASI');
-- Dua versi: v1 ditolak ("tidak terbaca"), v2 menunggu verifikasi — contoh versioning.
select pg_temp.seed_doc('PMH-2026-90006', 'NIB',              'DOK-NIB-006', 'MENUNGGU_VERIFIKASI', 2, true);
