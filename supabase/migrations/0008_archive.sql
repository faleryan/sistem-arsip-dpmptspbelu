-- ============================================================================
-- SIPAR-BELU · Migration 0008 · Arsip digital (Fase 4)
-- Jalankan SETELAH 0007. Aman dijalankan ulang.
--
-- Isi:
--   1. Penjaga dokumen: jenis dokumen harus aktif; judul dibatasi panjangnya.
--   2. Versi dokumen hanya dapat dicatat bila file BENAR-BENAR ada di Storage pada path
--      tersebut, dengan ukuran dan jenis file yang sama (mencegah catatan "hantu").
--   3. Status awal dokumen mengikuti tahap izin (MENUNGGU_VERIFIKASI atau DIARSIPKAN).
--   4. RPC create_document(): dokumen + versi pertama dalam satu transaksi.
--   5. View v_document_search untuk halaman Arsip Digital.
-- ============================================================================

-- ── 1. Batasan tambahan ─────────────────────────────────────────────────────
do $$ begin
  alter table public.documents
    add constraint documents_title_len check (length(title) <= 300);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.documents
    add constraint documents_number_len check (document_number is null or length(document_number) <= 100);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.document_versions
    add constraint document_versions_checksum_fmt
    check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$');
exception when duplicate_object then null; end $$;

create or replace function public.guard_document_write()
returns trigger language plpgsql as $$
begin
  if not public.is_api_caller() then return new; end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.document_types where id = new.document_type_id and is_active) then
      raise exception 'Jenis dokumen tidak aktif atau tidak ditemukan.' using errcode = '22023';
    end if;
    new.status := 'MENUNGGU_VERIFIKASI';
    new.current_version_id := null;
    return new;
  end if;
  if new.status is distinct from old.status
     or new.current_version_id is distinct from old.current_version_id
     or new.license_id is distinct from old.license_id
     or new.document_type_id is distinct from old.document_type_id then
    raise exception 'Status, versi aktif, izin, dan jenis dokumen tidak dapat diubah langsung.'
      using errcode = '42501';
  end if;
  return new;
end $$;

-- ── 2. Versi: lokasi cocok + file benar-benar ada di Storage ────────────────
-- is_api_caller() memakai current_user, yang di dalam fungsi SECURITY DEFINER selalu
-- bernilai pemilik fungsi. Untuk trigger definer dibutuhkan peran ASAL permintaan:
-- PostgREST memasang GUC `role` (authenticated/anon) dan nilainya tidak berubah saat
-- masuk ke fungsi definer. SQL Editor/seed: `none` → jatuh ke session_user (postgres).
create or replace function public.is_api_request()
returns boolean language sql stable as $$
  select coalesce(nullif(current_setting('role', true), 'none'), session_user::text)
         in ('authenticated', 'anon')
$$;
revoke all on function public.is_api_request() from public, anon;
grant execute on function public.is_api_request() to authenticated;

create or replace function public.document_versions_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare d public.documents; v_folder text; v_meta jsonb;
begin
  select * into d from public.documents where id = new.document_id for update;
  if not found or d.deleted_at is not null then
    raise exception 'Dokumen tidak ditemukan.' using errcode = 'P0002';
  end if;
  select storage_folder into v_folder from public.document_types where id = d.document_type_id;
  if split_part(new.storage_path, '/', 2) <> d.license_id::text
     or split_part(new.storage_path, '/', 3) <> v_folder then
    raise exception 'Lokasi file tidak sesuai dengan izin/jenis dokumen.' using errcode = '22023';
  end if;

  -- Klien hanya boleh mencatat file yang sudah terunggah. SQL Editor/seed tidak dibatasi.
  if public.is_api_request() then
    select o.metadata into v_meta
      from storage.objects o
     where o.bucket_id = 'perizinan-documents' and o.name = new.storage_path;
    if not found then
      raise exception 'File belum ada di penyimpanan. Ulangi unggah.' using errcode = '22023';
    end if;
    if v_meta ? 'size' and (v_meta ->> 'size')::bigint <> new.size_bytes then
      raise exception 'Ukuran file tidak sesuai dengan file yang terunggah.' using errcode = '22023';
    end if;
    if v_meta ? 'mimetype' and (v_meta ->> 'mimetype') <> new.mime_type then
      raise exception 'Jenis file tidak sesuai dengan file yang terunggah.' using errcode = '22023';
    end if;
  end if;

  select coalesce(max(version_no), 0) + 1 into new.version_no
    from public.document_versions where document_id = new.document_id;
  update public.document_versions set is_current = false
    where document_id = new.document_id and is_current;
  new.is_current := true;
  new.uploaded_at := now();
  if auth.uid() is not null then new.uploaded_by := auth.uid(); end if;
  return new;
end $$;

-- ── 3. Status awal dokumen mengikuti tahap izin ────────────────────────────
create or replace function public.document_versions_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare d public.documents; l public.licenses; v_status public.doc_status;
begin
  select * into d from public.documents where id = new.document_id;
  select * into l from public.licenses where id = d.license_id;
  v_status := case
    when l.status in ('DISETUJUI','DITERBITKAN','AKTIF','BERAKHIR','DICABUT','DIBATALKAN')
      then 'DIARSIPKAN'::public.doc_status
    else 'MENUNGGU_VERIFIKASI'::public.doc_status
  end;

  update public.documents set current_version_id = new.id, status = v_status where id = d.id;

  if v_status = 'MENUNGGU_VERIFIKASI' and l.status in ('DIAJUKAN','VERIFIKASI') then
    perform public.notify_roles(
      array['verifikator'], 'dokumen_menunggu', 'Dokumen menunggu verifikasi',
      new.file_name || ' pada permohonan ' || coalesce(l.license_number, l.application_number),
      '/perizinan/' || l.id, auth.uid());
  end if;
  return new;
end $$;

-- ── 4. RPC: dokumen baru + versi pertama, atomik ───────────────────────────
-- SECURITY INVOKER: semua RLS, trigger penjaga, dan pengecekan Storage tetap berlaku
-- sebagai pemanggil. Fungsi ini hanya memastikan keduanya berhasil atau keduanya batal.
create or replace function public.create_document(
  p_license_id       uuid,
  p_document_type_id uuid,
  p_title            text,
  p_file_name        text,
  p_storage_path     text,
  p_mime_type        text,
  p_size_bytes       bigint,
  p_checksum_sha256  text default null,
  p_document_number  text default null,
  p_document_date    date default null,
  p_archive_class_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_doc uuid;
begin
  insert into public.documents
    (license_id, document_type_id, archive_class_id, document_number, document_date, title)
  values
    (p_license_id, p_document_type_id, p_archive_class_id,
     nullif(btrim(p_document_number), ''), p_document_date, btrim(p_title))
  returning id into v_doc;

  insert into public.document_versions
    (document_id, file_name, storage_path, mime_type, size_bytes, checksum_sha256)
  values
    (v_doc, p_file_name, p_storage_path, p_mime_type, p_size_bytes, nullif(p_checksum_sha256, ''));

  return v_doc;
end $$;

revoke all on function public.create_document(uuid, uuid, text, text, text, text, bigint, text, text, date, uuid)
  from public, anon;
grant execute on function public.create_document(uuid, uuid, text, text, text, text, bigint, text, text, date, uuid)
  to authenticated;

-- ── 5. View pencarian arsip ────────────────────────────────────────────────
-- security_invoker: mengikuti RLS dokumen pemanggil (Viewer hanya Surat Izin pada izin publik).
-- Data izin diambil lewat v_license_search yang sudah menyaring baris per role.
create or replace view public.v_document_search with (security_invoker = true) as
  select d.id, d.license_id, d.title, d.document_number, d.document_date, d.status,
         d.created_at, d.updated_at, d.created_by,
         d.document_type_id, dt.code as document_type_code, dt.name as document_type_name,
         dt.storage_folder,
         d.archive_class_id, ac.code as archive_class_code, ac.name as archive_class_name,
         v.id as version_id, v.version_no, v.file_name, v.mime_type, v.size_bytes,
         v.storage_path, v.checksum_sha256, v.uploaded_at, v.uploaded_by,
         ls.application_number, ls.license_number, ls.license_type_name, ls.status as license_status,
         ls.applicant_name, ls.business_name, ls.year
    from public.documents d
    join public.document_types dt on dt.id = d.document_type_id
    left join public.archive_classes ac on ac.id = d.archive_class_id
    left join public.document_versions v on v.id = d.current_version_id
    join public.v_license_search ls on ls.id = d.license_id
   where d.deleted_at is null;

revoke all on public.v_document_search from anon;
grant select on public.v_document_search to authenticated;

-- Kelengkapan: dokumen arsip dianggap lengkap seperti dokumen terverifikasi.
create or replace view public.v_license_completeness with (security_invoker = true) as
  select l.id as license_id,
    (select count(*) from public.license_type_documents r
      where r.license_type_id = l.license_type_id) as required_count,
    (select count(*) from public.license_type_documents r
      where r.license_type_id = l.license_type_id
        and exists (select 1 from public.documents d
                     where d.license_id = l.id and d.document_type_id = r.document_type_id
                       and d.deleted_at is null)) as uploaded_count,
    (select count(*) from public.license_type_documents r
      where r.license_type_id = l.license_type_id
        and exists (select 1 from public.documents d
                     where d.license_id = l.id and d.document_type_id = r.document_type_id
                       and d.deleted_at is null and d.status in ('TERVERIFIKASI','DIARSIPKAN'))) as verified_count
    from public.licenses l
   where l.deleted_at is null;

-- Indeks pencarian judul/nama file arsip.
create index if not exists idx_documents_title_trgm
  on public.documents using gin (title extensions.gin_trgm_ops);
create index if not exists idx_doc_versions_file_trgm
  on public.document_versions using gin (file_name extensions.gin_trgm_ops);

-- Muat ulang cache skema PostgREST agar RPC/view baru langsung tersedia lewat API.
notify pgrst, 'reload schema';
