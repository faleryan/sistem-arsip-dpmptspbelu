-- ============================================================================
-- SIPAR-BELU · Migration 0013 · Perbaikan hasil tinjauan keamanan independen (Fase 7)
-- Jalankan SETELAH 0012. Aman dijalankan ulang.
-- ============================================================================

-- ── 1. [KRITIS] View tidak boleh dapat ditulis ──────────────────────────────
-- Supabase memberi ALL ke authenticated untuk setiap view baru. v_staff (satu tabel) bersifat
-- auto-updatable dan berjalan dengan hak pemilik, sehingga INSERT/DELETE lewat view melewati
-- RLS profiles: pengguna mana pun dapat menjadikan dirinya super_admin. Semua view hanya-baca.
do $$
declare v record;
begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated, anon, public', v.relname);
  end loop;
end $$;

-- Pertahanan berlapis: profil hanya dibuat/dihapus oleh Edge Function (service_role),
-- bukan oleh permintaan API pengguna, apa pun jalurnya.
create or replace function public.guard_profile_insert_delete()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_api_request() then
    raise exception 'Profil pengguna hanya dikelola lewat menu Pengguna (Edge Function).' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and old.role = 'super_admin' and old.is_active
     and not exists (select 1 from public.profiles where role = 'super_admin' and is_active and id <> old.id) then
    raise exception 'Tidak dapat menghapus Super Admin aktif terakhir.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.guard_profile_insert_delete() from public, anon, authenticated;
drop trigger if exists trg_profiles_guard_insdel on public.profiles;
create trigger trg_profiles_guard_insdel before insert or delete on public.profiles
  for each row execute function public.guard_profile_insert_delete();

-- Hanya Super Admin yang boleh mengubah profil orang lain (selain RLS).
create or replace function public.guard_profile_other()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_api_request() and new.id is distinct from auth.uid() and not public.has_role('super_admin') then
    raise exception 'Anda hanya dapat mengubah profil sendiri.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_profile_other() from public, anon, authenticated;
drop trigger if exists trg_profiles_guard_other on public.profiles;
create trigger trg_profiles_guard_other before update on public.profiles
  for each row execute function public.guard_profile_other();

-- ── 2. created_by tidak dapat diubah setelah dibuat ─────────────────────────
-- created_by memberi Petugas hak kelola; mengubahnya = mengalihkan hak ke orang lain.
create or replace function public.force_created_by()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    -- Hanya untuk permintaan API: kaskade FK (ON DELETE SET NULL saat akun dihapus) harus tetap jalan.
    if public.is_api_request() then new.created_by := old.created_by; end if;
  elsif auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['applicants','businesses','licenses','documents'] loop
    execute format('drop trigger if exists trg_00_created_by on public.%I', t);
    execute format('create trigger trg_00_created_by before insert or update on public.%I
                      for each row execute function public.force_created_by()', t);
  end loop;
end $$;

-- ── 3. Viewer: tidak membaca tabel licenses secara langsung ─────────────────
-- Sebelumnya Viewer dapat membaca kolom internal (catatan, petugas) izin publik dari tabel
-- dasar. Kini Viewer hanya lewat v_license_search (kolom aman, NIK/NPWP disamarkan).
create or replace function public.is_public_license(p_license_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.licenses l
                  where l.id = p_license_id and l.deleted_at is null
                    and l.status in ('DITERBITKAN','AKTIF','BERAKHIR'))
     and public.current_role_code() is not null
$$;
revoke all on function public.is_public_license(uuid) from public, anon;
grant execute on function public.is_public_license(uuid) to authenticated;

alter policy licenses_select on public.licenses
  using (((deleted_at is null) or (select public.has_role('super_admin', 'admin_arsip')))
         and (select public.is_internal()));

alter policy documents_select on public.documents
  using (((select public.is_internal())
          and ((deleted_at is null) or (select public.has_role('super_admin', 'admin_arsip'))))
         or ((select public.has_role('viewer'))
             and deleted_at is null
             and exists (select 1 from public.document_types dt
                          where dt.id = documents.document_type_id and dt.viewer_visible)
             and public.is_public_license(license_id)));

-- ── 4. File Storage: akses mengikuti catatan dokumen, bukan hanya folder ────
-- • Super Admin/Admin Arsip: semua file pada izin yang ada (termasuk dokumen terhapus,
--   untuk pemulihan dan pemeriksaan integritas).
-- • Role internal lain: hanya file yang tercatat sebagai versi dokumen yang tidak dihapus,
--   ditambah file yang belum tercatat bagi pengguna yang berhak mengunggah ke izin tsb.
-- • Viewer: hanya versi TERKINI dokumen jenis "boleh dilihat Viewer" pada izin publik.
create or replace function public.can_read_license_file(p_path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_lic uuid := public.storage_path_license_id(p_path);
begin
  if v_lic is null then return false; end if;

  if public.has_role('super_admin', 'admin_arsip') then
    return exists (select 1 from public.licenses l where l.id = v_lic);
  end if;

  if public.is_internal() then
    return exists (
             select 1 from public.document_versions v
               join public.documents d on d.id = v.document_id
               join public.licenses l on l.id = d.license_id
              where v.storage_path = p_path and d.license_id = v_lic
                and d.deleted_at is null and l.deleted_at is null)
        -- File yang baru diunggah dan belum dicatat: hanya terlihat oleh yang berhak mengunggah
        -- ke izin itu (Storage dapat membaca baris objek tepat setelah unggah).
        or (not exists (select 1 from public.document_versions v where v.storage_path = p_path)
            and public.can_manage_documents(v_lic));
  end if;

  if public.has_role('viewer') then
    return exists (
      select 1 from public.document_versions v
        join public.documents d on d.id = v.document_id and d.current_version_id = v.id
        join public.document_types dt on dt.id = d.document_type_id
        join public.licenses l on l.id = d.license_id
       where v.storage_path = p_path and d.license_id = v_lic
         and d.deleted_at is null and dt.viewer_visible
         and l.deleted_at is null and l.status in ('DITERBITKAN','AKTIF','BERAKHIR'));
  end if;

  return false;
end $$;

-- Batasi file tanpa catatan dokumen: maksimal 20 per pengguna per izin per 24 jam (cegah pengisian
-- penyimpanan dengan file yang tidak pernah dicatat).
create or replace function public.can_upload_license_file(p_path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_lic uuid := public.storage_path_license_id(p_path);
begin
  if v_lic is null then return false; end if;
  if p_path !~ '^[0-9]{4}/[0-9a-f-]{36}/[a-z-]+/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$' then return false; end if;
  if p_path !~* '\.(pdf|jpe?g|png)$' then return false; end if;
  if not exists (select 1 from public.document_types dt
                  where dt.storage_folder = split_part(p_path, '/', 3) and dt.is_active) then
    return false;
  end if;
  -- Dihitung per izin (awalan path memakai indeks bucket_id+name) agar tidak memindai seluruh bucket.
  if (select count(*) from storage.objects o
       where o.bucket_id = 'perizinan-documents'
         and o.name like split_part(p_path, '/', 1) || '/' || split_part(p_path, '/', 2) || '/%'
         and (o.owner = auth.uid() or o.owner_id = auth.uid()::text)
         and o.created_at > now() - interval '24 hours'
         and not exists (select 1 from public.document_versions v where v.storage_path = o.name)) >= 20 then
    return false;
  end if;
  return public.can_manage_documents(v_lic);
end $$;

-- ── 5. Verifikasi dokumen: kunci dokumen sebelum memeriksa versi terbaru ────
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

  -- Kunci dokumen DULU, baru periksa versi terbaru: unggahan versi baru di antara keduanya
  -- tidak boleh membuat dokumen tertandai terverifikasi dengan versi yang belum diperiksa.
  select d0.* into d from public.documents d0
   where d0.id = (select dv.document_id from public.document_versions dv where dv.id = p_version_id)
     and d0.deleted_at is null
     for update;
  if not found then raise exception 'Dokumen tidak ditemukan.' using errcode = 'P0002'; end if;

  select * into v from public.document_versions where id = p_version_id;
  if not found then raise exception 'Versi dokumen tidak ditemukan.' using errcode = 'P0002'; end if;
  if not v.is_current or d.current_version_id is distinct from v.id then
    raise exception 'Hanya versi terbaru yang dapat diverifikasi.' using errcode = '22023';
  end if;
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

-- ── 6. Audit: alamat IP dari header yang dipasang platform ──────────────────
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
    -- cf-connecting-ip dipasang Cloudflare (di depan Supabase) dan tidak dapat dipalsukan klien;
    -- x-forwarded-for hanya cadangan (entri paling kiri dapat diisi klien). IP bersifat informatif.
    v_ip := nullif(btrim(coalesce(v_headers ->> 'cf-connecting-ip',
                                  v_headers ->> 'x-real-ip',
                                  split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1))), '');
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

notify pgrst, 'reload schema';
