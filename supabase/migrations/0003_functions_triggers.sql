-- ============================================================================
-- SIPAR-BELU · Migration 0003 · Fungsi, trigger, workflow, audit trail, view
-- Jalankan SETELAH 0002. Aman dijalankan ulang (create or replace / drop if exists).
--
-- Catatan desain penting:
--  • "API caller" = request lewat PostgREST (role `authenticated`/`anon`). Trigger penjaga
--    hanya membatasi API caller; SQL Editor (postgres) dan service_role tidak dibatasi.
--  • Fungsi SECURITY DEFINER berjalan sebagai pemilik, sehingga current_user = pemilik,
--    dan trigger penjaga tidak aktif di dalamnya. Itulah cara workflow "resmi" melewati
--    penjagaan yang menutup update langsung dari klien.
-- ============================================================================

-- ── Fungsi bantu umum ───────────────────────────────────────────────────────
create or replace function public.is_api_caller()
returns boolean language sql stable as $$
  select current_user in ('authenticated', 'anon')
$$;

create or replace function public.local_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Makassar')::date
$$;

create or replace function public.is_internal()
returns boolean language sql stable as $$
  select public.has_role('super_admin','admin_arsip','petugas','verifikator','pimpinan')
$$;

create or replace function public.can_write_archive()
returns boolean language sql stable as $$
  select public.has_role('super_admin','admin_arsip','petugas')
$$;

-- Petugas hanya boleh mengelola dokumen pada izin miliknya selama izin belum disetujui.
create or replace function public.can_manage_documents(p_license_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.has_role('super_admin','admin_arsip') then
      exists (select 1 from public.licenses where id = p_license_id and deleted_at is null)
    when public.has_role('petugas') then
      exists (
        select 1 from public.licenses l
        where l.id = p_license_id and l.deleted_at is null
          and l.status in ('DRAFT','DIAJUKAN','VERIFIKASI')
          and (l.officer_id = auth.uid() or l.created_by = auth.uid())
      )
    else false
  end
$$;

-- ── updated_at ──────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'units','districts','villages','applicants','businesses','license_types',
    'document_types','archive_classes','licenses','documents','system_settings'
  ] loop
    execute format('drop trigger if exists trg_zz_updated_at on public.%I', t);
    execute format(
      'create trigger trg_zz_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ── Notifikasi (internal, tidak dapat dipanggil dari API) ──────────────────
create or replace function public.notify_user(
  p_user uuid, p_type text, p_title text, p_body text, p_link text, p_exclude uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user is not distinct from p_exclude then return; end if;
  insert into public.notifications (user_id, type, title, body, link)
  select p.id, p_type, p_title, p_body, p_link from public.profiles p
  where p.id = p_user and p.is_active;
end $$;

create or replace function public.notify_roles(
  p_roles text[], p_type text, p_title text, p_body text, p_link text, p_exclude uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select p.id, p_type, p_title, p_body, p_link from public.profiles p
  where p.is_active and p.role::text = any (p_roles) and p.id is distinct from p_exclude;
end $$;

-- ── Penjaga profil ──────────────────────────────────────────────────────────
create or replace function public.guard_profile_update()
returns trigger language plpgsql as $$
begin
  if not public.is_api_caller() then return new; end if;

  -- Jangan sampai sistem kehilangan Super Admin aktif terakhir.
  if old.role = 'super_admin' and old.is_active
     and (new.role <> 'super_admin' or not new.is_active)
     and not exists (
       select 1 from public.profiles
       where role = 'super_admin' and is_active and id <> old.id
     ) then
    raise exception 'Tidak dapat menonaktifkan atau menurunkan Super Admin aktif terakhir.'
      using errcode = '42501';
  end if;

  if public.has_role('super_admin') then return new; end if;

  if new.id is distinct from old.id or new.role is distinct from old.role
     or new.is_active is distinct from old.is_active or new.unit_id is distinct from old.unit_id
     or new.email is distinct from old.email or new.nip is distinct from old.nip then
    raise exception 'Anda hanya dapat mengubah nama dan nomor telepon profil sendiri.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ── Penjaga umum: created_by dipaksa, soft delete dibatasi ─────────────────
create or replace function public.force_created_by()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  return new;
end $$;

-- Argumen trigger: daftar role yang boleh soft delete/restore, dipisah koma.
create or replace function public.guard_soft_delete()
returns trigger language plpgsql as $$
begin
  if public.is_api_caller()
     and new.deleted_at is distinct from old.deleted_at
     and not public.has_role(variadic string_to_array(tg_argv[0], ',')) then
    raise exception 'Anda tidak berwenang menghapus/memulihkan data ini.' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text; roles text;
begin
  foreach t in array array['applicants','businesses','licenses','documents'] loop
    execute format('drop trigger if exists trg_00_created_by on public.%I', t);
    execute format(
      'create trigger trg_00_created_by before insert on public.%I
         for each row execute function public.force_created_by()', t);

    roles := case when t = 'documents' then 'super_admin,admin_arsip' else 'super_admin' end;
    execute format('drop trigger if exists trg_01_soft_delete on public.%I', t);
    execute format(
      'create trigger trg_01_soft_delete before update on public.%I
         for each row execute function public.guard_soft_delete(%L)', t, roles);
  end loop;
end $$;

-- ── Perizinan: penjaga, nilai default, riwayat status ──────────────────────
create sequence if not exists public.application_number_seq;

create or replace function public.guard_license_write()
returns trigger language plpgsql as $$
begin
  if not public.is_api_caller() then return new; end if;

  if tg_op = 'INSERT' then
    -- Kode verifikasi selalu dibuat server; klien tidak boleh menentukannya.
    new.verification_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    if not public.has_role('super_admin','admin_arsip') then
      -- Petugas hanya boleh membuat DRAFT tanpa data penerbitan.
      if new.status <> 'DRAFT'
         or new.license_number is not null or new.issue_date is not null or new.expiry_date is not null then
        raise exception 'Petugas hanya dapat membuat izin berstatus DRAFT tanpa data penerbitan.'
          using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'Status izin hanya dapat diubah melalui change_license_status().'
      using errcode = '42501';
  end if;
  if new.verification_code is distinct from old.verification_code then
    raise exception 'Kode verifikasi tidak dapat diubah.' using errcode = '42501';
  end if;
  if (new.license_number, new.issue_date, new.expiry_date, new.officer_id)
       is distinct from (old.license_number, old.issue_date, old.expiry_date, old.officer_id)
     and not public.has_role('super_admin','admin_arsip') then
    raise exception 'Nomor izin, tanggal terbit/berakhir, dan petugas hanya dapat diubah oleh Admin Arsip.'
      using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.licenses_set_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.application_number is null or btrim(new.application_number) = '' then
      new.application_number := 'PMH-' || to_char(public.local_today(), 'YYYY') || '-'
        || lpad(nextval('public.application_number_seq')::text, 5, '0');
    end if;
    if new.application_date is null then new.application_date := public.local_today(); end if;
  end if;
  if new.nib is null and new.business_id is not null then
    select b.nib into new.nib from public.businesses b where b.id = new.business_id;
  end if;
  new.year := extract(year from coalesce(new.issue_date, new.application_date, public.local_today()))::int;
  return new;
end $$;

create or replace function public.licenses_log_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_note text := nullif(current_setting('sipar.status_note', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.license_status_history (license_id, from_status, to_status, note, changed_by)
    values (new.id, null, new.status, coalesce(v_note, 'Data perizinan dibuat'), auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.license_status_history (license_id, from_status, to_status, note, changed_by)
    values (new.id, old.status, new.status, v_note, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_licenses_01_guard on public.licenses;
create trigger trg_licenses_01_guard before insert or update on public.licenses
  for each row execute function public.guard_license_write();

drop trigger if exists trg_licenses_02_defaults on public.licenses;
create trigger trg_licenses_02_defaults before insert or update on public.licenses
  for each row execute function public.licenses_set_defaults();

drop trigger if exists trg_licenses_90_history on public.licenses;
create trigger trg_licenses_90_history after insert or update of status on public.licenses
  for each row execute function public.licenses_log_status();

-- ── Dokumen: penjaga dan versioning ────────────────────────────────────────
create or replace function public.guard_document_write()
returns trigger language plpgsql as $$
begin
  if not public.is_api_caller() then return new; end if;
  if tg_op = 'INSERT' then
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

drop trigger if exists trg_documents_02_guard on public.documents;
create trigger trg_documents_02_guard before insert or update on public.documents
  for each row execute function public.guard_document_write();

create or replace function public.document_versions_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare d public.documents; v_folder text;
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

  select coalesce(max(version_no), 0) + 1 into new.version_no
    from public.document_versions where document_id = new.document_id;
  update public.document_versions set is_current = false
    where document_id = new.document_id and is_current;
  new.is_current := true;
  new.uploaded_at := now();
  if auth.uid() is not null then new.uploaded_by := auth.uid(); end if;
  return new;
end $$;

create or replace function public.document_versions_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare d public.documents; l public.licenses;
begin
  update public.documents
     set current_version_id = new.id, status = 'MENUNGGU_VERIFIKASI'
   where id = new.document_id
   returning * into d;
  select * into l from public.licenses where id = d.license_id;
  if l.status in ('DIAJUKAN','VERIFIKASI') then
    perform public.notify_roles(
      array['verifikator'], 'dokumen_menunggu', 'Dokumen menunggu verifikasi',
      new.file_name || ' pada permohonan ' || coalesce(l.license_number, l.application_number),
      '/perizinan/' || l.id, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_versions_01_before on public.document_versions;
create trigger trg_versions_01_before before insert on public.document_versions
  for each row execute function public.document_versions_before_insert();

drop trigger if exists trg_versions_90_after on public.document_versions;
create trigger trg_versions_90_after after insert on public.document_versions
  for each row execute function public.document_versions_after_insert();

-- ── Penjaga notifikasi: pemilik hanya boleh menandai dibaca ────────────────
create or replace function public.guard_notification_update()
returns trigger language plpgsql as $$
begin
  if public.is_api_caller() and (
       new.user_id is distinct from old.user_id or new.type is distinct from old.type
    or new.title is distinct from old.title or new.body is distinct from old.body
    or new.link is distinct from old.link) then
    raise exception 'Hanya status baca yang dapat diubah.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_notifications_guard on public.notifications;
create trigger trg_notifications_guard before update on public.notifications
  for each row execute function public.guard_notification_update();

-- ── Workflow: ubah status izin ─────────────────────────────────────────────
create or replace function public.change_license_status(
  p_license_id uuid,
  p_new_status public.license_status,
  p_note       text default null
) returns public.licenses
language plpgsql security definer set search_path = public as $$
declare
  v_role    text := public.current_role_code();
  v_uid     uuid := auth.uid();
  l         public.licenses;
  t         public.license_status_transitions;
  v_type    public.license_types;
  v_missing int;
  v_expiry  date;
  v_label   text;
begin
  if v_role is null then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;

  select * into l from public.licenses where id = p_license_id and deleted_at is null for update;
  if not found then
    raise exception 'Data perizinan tidak ditemukan.' using errcode = 'P0002';
  end if;

  select * into t from public.license_status_transitions
   where from_status = l.status and to_status = p_new_status;
  if not found then
    raise exception 'Perubahan status % ke % tidak diizinkan.', l.status, p_new_status
      using errcode = '22023';
  end if;
  if not (v_role = any (t.allowed_roles)) then
    raise exception 'Role % tidak berwenang melakukan perubahan status ini.', v_role
      using errcode = '42501';
  end if;
  if v_role = 'petugas'
     and l.officer_id is distinct from v_uid and l.created_by is distinct from v_uid then
    raise exception 'Petugas hanya dapat memproses izin miliknya.' using errcode = '42501';
  end if;
  if t.requires_note and (p_note is null or btrim(p_note) = '') then
    raise exception 'Catatan wajib diisi untuk perubahan status ini.' using errcode = '22023';
  end if;

  -- Prasyarat per status tujuan
  if p_new_status = 'VERIFIKASI' then
    if not exists (select 1 from public.documents where license_id = l.id and deleted_at is null) then
      raise exception 'Belum ada dokumen yang diunggah.' using errcode = '22023';
    end if;
  elsif p_new_status = 'DISETUJUI' then
    select count(*) into v_missing
      from public.license_type_documents r
      join public.document_types dt on dt.id = r.document_type_id and dt.is_active
     where r.license_type_id = l.license_type_id
       and not exists (
         select 1 from public.documents d
          where d.license_id = l.id and d.document_type_id = r.document_type_id
            and d.deleted_at is null and d.status = 'TERVERIFIKASI');
    if v_missing > 0 then
      raise exception '% dokumen wajib belum terverifikasi.', v_missing using errcode = '22023';
    end if;
  elsif p_new_status = 'DITERBITKAN' then
    if l.license_number is null or btrim(l.license_number) = '' or l.issue_date is null then
      raise exception 'Nomor izin dan tanggal terbit wajib diisi sebelum diterbitkan.'
        using errcode = '22023';
    end if;
    select * into v_type from public.license_types where id = l.license_type_id;
    v_expiry := l.expiry_date;
    if v_expiry is null and v_type.validity_months is not null then
      v_expiry := (l.issue_date + make_interval(months => v_type.validity_months))::date;
    end if;
  end if;

  perform set_config('sipar.status_note', coalesce(p_note, ''), true);
  if p_new_status = 'DITERBITKAN' then
    update public.licenses set status = 'DITERBITKAN', expiry_date = v_expiry where id = l.id;
    if l.issue_date <= public.local_today() then
      perform set_config('sipar.status_note', 'Aktif otomatis pada tanggal terbit', true);
      update public.licenses set status = 'AKTIF' where id = l.id;
    end if;
  else
    update public.licenses set status = p_new_status where id = l.id;
  end if;
  perform set_config('sipar.status_note', '', true);

  -- Notifikasi
  v_label := coalesce(l.license_number, l.application_number);
  if p_new_status = 'DIAJUKAN' then
    perform public.notify_roles(array['verifikator'], 'izin_diajukan', 'Permohonan menunggu verifikasi',
      'Permohonan ' || v_label || ' telah diajukan.', '/perizinan/' || l.id, v_uid);
  elsif p_new_status = 'DISETUJUI' then
    perform public.notify_roles(array['admin_arsip'], 'izin_disetujui', 'Izin disetujui, siap diterbitkan',
      'Permohonan ' || v_label || ' telah disetujui.', '/perizinan/' || l.id, v_uid);
    perform public.notify_user(l.officer_id, 'izin_disetujui', 'Permohonan disetujui',
      'Permohonan ' || v_label || ' telah disetujui.', '/perizinan/' || l.id, v_uid);
  elsif p_new_status = 'DITOLAK' then
    perform public.notify_user(l.officer_id, 'izin_ditolak', 'Permohonan ditolak',
      v_label || ': ' || coalesce(p_note, ''), '/perizinan/' || l.id, v_uid);
  elsif p_new_status = 'DITERBITKAN' then
    perform public.notify_user(l.officer_id, 'izin_terbit', 'Izin diterbitkan',
      'Izin ' || v_label || ' telah diterbitkan.', '/perizinan/' || l.id, v_uid);
  end if;

  select * into l from public.licenses where id = p_license_id;
  return l;
end $$;

-- ── Workflow: verifikasi dokumen ───────────────────────────────────────────
create or replace function public.verify_document(
  p_version_id uuid,
  p_result     public.verification_result,
  p_note       text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.current_role_code();
  v_uid  uuid := auth.uid();
  v      public.document_versions;
  d      public.documents;
  l      public.licenses;
  v_id   uuid;
begin
  if v_role is null or v_role not in ('verifikator','super_admin') then
    raise exception 'Hanya Verifikator yang dapat memverifikasi dokumen.' using errcode = '42501';
  end if;
  if p_result = 'DITOLAK' and (p_note is null or btrim(p_note) = '') then
    raise exception 'Alasan penolakan wajib diisi.' using errcode = '22023';
  end if;

  select * into v from public.document_versions where id = p_version_id;
  if not found then raise exception 'Versi dokumen tidak ditemukan.' using errcode = 'P0002'; end if;
  if not v.is_current then
    raise exception 'Hanya versi terbaru yang dapat diverifikasi.' using errcode = '22023';
  end if;

  select * into d from public.documents where id = v.document_id and deleted_at is null for update;
  if not found then raise exception 'Dokumen tidak ditemukan.' using errcode = 'P0002'; end if;
  select * into l from public.licenses where id = d.license_id and deleted_at is null for update;
  if not found then raise exception 'Data perizinan tidak ditemukan.' using errcode = 'P0002'; end if;

  if l.status not in ('DIAJUKAN','VERIFIKASI') then
    raise exception 'Dokumen hanya dapat diverifikasi saat izin berstatus DIAJUKAN atau VERIFIKASI.'
      using errcode = '22023';
  end if;
  if d.status <> 'MENUNGGU_VERIFIKASI' and v_role <> 'super_admin' then
    raise exception 'Dokumen ini sudah diverifikasi. Unggah versi baru untuk memeriksa ulang.'
      using errcode = '22023';
  end if;

  insert into public.document_verifications (document_version_id, result, note, verified_by)
  values (p_version_id, p_result, nullif(btrim(p_note), ''), v_uid)
  returning id into v_id;

  update public.documents
     set status = case when p_result = 'DITOLAK' then 'DITOLAK'::public.doc_status
                       else 'TERVERIFIKASI'::public.doc_status end
   where id = d.id;

  if l.status = 'DIAJUKAN' then
    perform set_config('sipar.status_note', 'Verifikasi dimulai', true);
    update public.licenses set status = 'VERIFIKASI' where id = l.id;
    perform set_config('sipar.status_note', '', true);
  end if;

  perform public.notify_user(
    v.uploaded_by,
    case when p_result = 'DITOLAK' then 'dokumen_ditolak' else 'dokumen_terverifikasi' end,
    case when p_result = 'DITOLAK' then 'Dokumen ditolak' else 'Dokumen terverifikasi' end,
    v.file_name || coalesce(': ' || nullif(btrim(p_note), ''), ''),
    '/perizinan/' || l.id, v_uid);

  return v_id;
end $$;

-- ── Halaman publik QR ──────────────────────────────────────────────────────
-- Hanya mengembalikan kolom aman. Kode tidak valid / izin belum terbit → nol baris.
create or replace function public.verify_license(p_code text)
returns table (
  license_number text, license_type text, holder_name text,
  issue_date date, status text, agency text
)
language sql stable security definer set search_path = public as $$
  select l.license_number, lt.name, coalesce(b.name, a.full_name), l.issue_date, l.status::text,
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

-- ── Pemeliharaan harian (dijadwalkan pg_cron di bawah) ─────────────────────
create or replace function public.run_daily_license_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_today  date := public.local_today();
  v_warn   int;
  n_active int := 0;
  n_exp    int := 0;
  n_notif  int := 0;
begin
  select (s.value #>> '{}')::int into v_warn from public.system_settings s where s.key = 'expiry_warning_days';
  v_warn := coalesce(v_warn, 30);

  for r in select id from public.licenses
            where status = 'DITERBITKAN' and deleted_at is null
              and issue_date is not null and issue_date <= v_today loop
    perform set_config('sipar.status_note', 'Aktif otomatis pada tanggal terbit', true);
    update public.licenses set status = 'AKTIF' where id = r.id;
    n_active := n_active + 1;
  end loop;

  for r in select id, coalesce(license_number, application_number) as label, officer_id
             from public.licenses
            where status = 'AKTIF' and deleted_at is null
              and expiry_date is not null and expiry_date < v_today loop
    perform set_config('sipar.status_note', 'Berakhir otomatis (masa berlaku habis)', true);
    update public.licenses set status = 'BERAKHIR' where id = r.id;
    perform public.notify_roles(array['admin_arsip','super_admin'], 'izin_berakhir', 'Izin berakhir',
      'Izin ' || r.label || ' telah berakhir masa berlakunya.', '/perizinan/' || r.id);
    perform public.notify_user(r.officer_id, 'izin_berakhir', 'Izin berakhir',
      'Izin ' || r.label || ' telah berakhir masa berlakunya.', '/perizinan/' || r.id);
    n_exp := n_exp + 1;
  end loop;
  perform set_config('sipar.status_note', '', true);

  insert into public.notifications (user_id, type, title, body, link, dedupe_key)
  select p.id, 'izin_akan_berakhir', 'Izin akan berakhir',
         'Izin ' || coalesce(l.license_number, l.application_number)
           || ' berakhir pada ' || to_char(l.expiry_date, 'DD-MM-YYYY') || '.',
         '/perizinan/' || l.id, 'exp:' || l.id || ':' || l.expiry_date
    from public.licenses l
    join public.profiles p on p.is_active
         and (p.role in ('admin_arsip','super_admin') or p.id = l.officer_id)
   where l.status = 'AKTIF' and l.deleted_at is null
     and l.expiry_date between v_today and v_today + v_warn
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n_notif = row_count;

  return jsonb_build_object('activated', n_active, 'expired', n_exp, 'expiry_warnings', n_notif);
end $$;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron tidak dapat diaktifkan otomatis (%). Aktifkan di Dashboard → Database → Extensions, lalu jalankan ulang file ini.', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 16:05 UTC = 00:05 WITA
    perform cron.schedule('sipar-daily-maintenance', '5 16 * * *',
                          'select public.run_daily_license_maintenance()');
  end if;
exception when others then
  raise notice 'Penjadwalan pg_cron dilewati: %', sqlerrm;
end $$;

-- ── Audit trail ────────────────────────────────────────────────────────────
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ofull  jsonb;
  v_nfull  jsonb;
  v_row    jsonb;
  v_old    jsonb;
  v_new    jsonb;
  v_action text;
  v_desc   text;
  v_label  text;
  v_name   text;
  v_file   text;
  v_uid    uuid := auth.uid();
  v_uname  text;
  v_urole  text;
  v_headers json;
  v_ip     text;
  v_ua     text;
begin
  if tg_op = 'INSERT' then
    v_nfull := to_jsonb(new); v_row := v_nfull; v_new := v_nfull;
  elsif tg_op = 'DELETE' then
    v_ofull := to_jsonb(old); v_row := v_ofull; v_old := v_ofull;
  else
    v_ofull := to_jsonb(old); v_nfull := to_jsonb(new); v_row := v_nfull;
    select jsonb_object_agg(n.key, n.value), jsonb_object_agg(n.key, v_ofull -> n.key)
      into v_new, v_old
      from jsonb_each(v_nfull) n
     where n.key <> 'updated_at' and (v_ofull -> n.key) is distinct from n.value;
    if v_new is null then return new; end if;                       -- tidak ada perubahan berarti
    if tg_table_name = 'document_versions' then return new; end if;  -- flip is_current: bukan kejadian bisnis
    if tg_table_name = 'documents'
       and not exists (select 1 from jsonb_object_keys(v_new) k where k not in ('status','current_version_id')) then
      return new;                                                    -- dicatat lewat versi/verifikasi
    end if;
  end if;

  v_label := case tg_table_name
    when 'profiles' then 'pengguna'        when 'applicants' then 'pemohon'
    when 'businesses' then 'perusahaan'    when 'licenses' then 'perizinan'
    when 'documents' then 'dokumen'        when 'document_versions' then 'versi dokumen'
    when 'document_verifications' then 'verifikasi dokumen'
    when 'license_types' then 'jenis izin' when 'document_types' then 'jenis dokumen'
    when 'archive_classes' then 'klasifikasi arsip' when 'districts' then 'kecamatan'
    when 'villages' then 'desa/kelurahan'  when 'units' then 'unit/bidang'
    when 'role_permissions' then 'hak akses role' when 'system_settings' then 'pengaturan'
    else tg_table_name end;

  v_name := coalesce(
    v_row ->> 'license_number', v_row ->> 'application_number', v_row ->> 'full_name',
    v_row ->> 'name', v_row ->> 'title', v_row ->> 'file_name', v_row ->> 'key',
    case when tg_table_name = 'role_permissions'
         then (v_row ->> 'role_code') || ' / ' || (v_row ->> 'permission_code') end,
    v_row ->> 'code', v_row ->> 'id');

  v_action := case tg_op when 'INSERT' then 'CREATE' when 'UPDATE' then 'UPDATE' else 'DELETE' end;
  v_desc := case tg_op when 'INSERT' then 'Menambahkan ' when 'UPDATE' then 'Mengubah '
                       else 'Menghapus ' end || v_label || ': ' || v_name;

  if tg_op = 'UPDATE' and (v_ofull ->> 'deleted_at') is null and (v_nfull ->> 'deleted_at') is not null then
    v_action := 'DELETE'; v_desc := 'Menghapus (soft delete) ' || v_label || ': ' || v_name;
  elsif tg_op = 'UPDATE' and (v_ofull ->> 'deleted_at') is not null and (v_nfull ->> 'deleted_at') is null then
    v_action := 'RESTORE'; v_desc := 'Memulihkan ' || v_label || ': ' || v_name;
  elsif tg_table_name = 'licenses' and tg_op = 'UPDATE' and v_new ? 'status' then
    v_action := 'STATUS_CHANGE';
    v_desc := 'Mengubah status izin ' || v_name || ': ' || (v_ofull ->> 'status') || ' → ' || (v_nfull ->> 'status');
  elsif tg_table_name = 'document_versions' and tg_op = 'INSERT' then
    v_action := 'UPLOAD';
    v_desc := 'Mengupload dokumen: ' || (v_nfull ->> 'file_name') || ' (versi ' || (v_nfull ->> 'version_no') || ')';
  elsif tg_table_name = 'document_verifications' and tg_op = 'INSERT' then
    v_action := 'VERIFY';
    select file_name into v_file from public.document_versions where id = (v_nfull ->> 'document_version_id')::uuid;
    v_desc := case when (v_nfull ->> 'result') = 'DITOLAK' then 'Menolak dokumen: ' else 'Memverifikasi dokumen: ' end
              || coalesce(v_file, '-');
  end if;

  if v_uid is not null then
    select full_name, role::text into v_uname, v_urole from public.profiles where id = v_uid;
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
    v_ip := nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1)), '');
    v_ua := v_headers ->> 'user-agent';
  exception when others then
    v_ip := null; v_ua := null;
  end;

  insert into public.audit_logs
    (user_id, user_name, user_role, action, description, module, record_id,
     old_value, new_value, ip_address, user_agent)
  values
    (v_uid, v_uname, v_urole, v_action, v_desc, tg_table_name, v_row ->> 'id',
     v_old, v_new, v_ip, v_ua);

  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','units','districts','villages','applicants','businesses','license_types',
    'document_types','archive_classes','role_permissions','system_settings',
    'licenses','documents','document_versions','document_verifications'
  ] loop
    execute format('drop trigger if exists trg_zz_audit on public.%I', t);
    execute format(
      'create trigger trg_zz_audit after insert or update or delete on public.%I
         for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- ── View ───────────────────────────────────────────────────────────────────
-- Daftar pegawai untuk tampilan "petugas/pengunggah" (tanpa NIP/telepon/email).
create or replace view public.v_staff as
  select p.id, p.full_name, p.role, p.unit_id
    from public.profiles p
   where p.is_active and public.current_role_code() is not null;

-- Satu view untuk daftar & pencarian izin. Berjalan sebagai pemilik (melewati RLS tabel
-- pemohon/perusahaan) tetapi memfilter baris dan menyamarkan kolom per role di dalamnya.
create or replace view public.v_license_search as
  select l.id, l.license_number, l.application_number, l.nib, l.year, l.status,
         l.application_date, l.issue_date, l.expiry_date,
         l.license_type_id, lt.code as license_type_code, lt.name as license_type_name,
         l.district_id, dis.name as district_name,
         l.applicant_id, a.full_name as applicant_name,
         case when public.current_role_code() = 'viewer' then null else a.nik end  as applicant_nik,
         case when public.current_role_code() = 'viewer' then null else a.npwp end as applicant_npwp,
         l.business_id, b.name as business_name,
         l.officer_id, l.created_at
    from public.licenses l
    join public.license_types lt on lt.id = l.license_type_id
    join public.applicants a on a.id = l.applicant_id
    left join public.businesses b on b.id = l.business_id
    left join public.districts dis on dis.id = l.district_id
   where l.deleted_at is null
     and (public.is_internal()
          or (public.has_role('viewer') and l.status in ('DITERBITKAN','AKTIF','BERAKHIR')));

-- Kelengkapan dokumen wajib per izin. Mengikuti RLS pemanggil.
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
                       and d.deleted_at is null and d.status = 'TERVERIFIKASI')) as verified_count
    from public.licenses l
   where l.deleted_at is null;

-- ── Hak eksekusi fungsi ────────────────────────────────────────────────────
-- Fungsi yang dipanggil klien (RPC) / dipakai policy: hanya authenticated.
do $$
declare f text;
begin
  foreach f in array array[
    'public.is_api_caller()', 'public.local_today()', 'public.is_internal()',
    'public.can_write_archive()', 'public.can_manage_documents(uuid)',
    'public.change_license_status(uuid, public.license_status, text)',
    'public.verify_document(uuid, public.verification_result, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  -- Halaman publik QR: boleh anon.
  revoke all on function public.verify_license(text) from public;
  grant execute on function public.verify_license(text) to anon, authenticated;

  -- Internal saja (trigger / cron / pembantu): tidak boleh dipanggil dari API.
  foreach f in array array[
    'public.notify_user(uuid, text, text, text, text, uuid)',
    'public.notify_roles(text[], text, text, text, text, uuid)',
    'public.run_daily_license_maintenance()',
    'public.audit_row_change()', 'public.guard_profile_update()', 'public.force_created_by()',
    'public.guard_soft_delete()', 'public.guard_license_write()', 'public.licenses_set_defaults()',
    'public.licenses_log_status()', 'public.guard_document_write()',
    'public.document_versions_before_insert()', 'public.document_versions_after_insert()',
    'public.guard_notification_update()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
