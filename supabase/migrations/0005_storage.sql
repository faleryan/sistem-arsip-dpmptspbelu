-- ============================================================================
-- SIPAR-BELU · Migration 0005 · Storage (bucket privat + policy)
-- Jalankan SETELAH 0004. Aman dijalankan ulang.
--
-- Struktur path:  {tahun}/{license_id}/{folder-jenis-dokumen}/{uuid}-{nama-aman}.{ext}
-- File tidak pernah di-overwrite atau dihapus oleh user (tidak ada policy update/delete);
-- versi baru = objek baru. Akses baca selalu lewat signed URL berumur pendek.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('perizinan-documents', 'perizinan-documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

create or replace function public.storage_path_license_id(p_path text)
returns uuid language sql immutable as $$
  select case
    when split_part(p_path, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_path, '/', 2)::uuid
  end
$$;

-- Boleh membaca file? Internal: semua izin yang ada. Viewer: hanya izin berstatus publik
-- dan hanya folder jenis dokumen yang ditandai viewer_visible.
create or replace function public.can_read_license_file(p_path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_lic    uuid := public.storage_path_license_id(p_path);
  v_folder text := split_part(p_path, '/', 3);
begin
  if v_lic is null then return false; end if;

  if public.is_internal() then
    return exists (
      select 1 from public.licenses l
       where l.id = v_lic
         and (l.deleted_at is null or public.has_role('super_admin','admin_arsip')));
  end if;

  if public.has_role('viewer') then
    return exists (
             select 1 from public.licenses l
              where l.id = v_lic and l.deleted_at is null
                and l.status in ('DITERBITKAN','AKTIF','BERAKHIR'))
       and exists (
             select 1 from public.document_types dt
              where dt.storage_folder = v_folder and dt.viewer_visible and dt.is_active);
  end if;

  return false;
end $$;

-- Boleh mengunggah ke path ini? Format ketat + hak kelola dokumen pada izin tsb.
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
  return public.can_manage_documents(v_lic);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.can_read_license_file(text)', 'public.can_upload_license_file(text)',
    'public.storage_path_license_id(text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

drop policy if exists sipar_docs_select on storage.objects;
create policy sipar_docs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'perizinan-documents' and public.can_read_license_file(name));

drop policy if exists sipar_docs_insert on storage.objects;
create policy sipar_docs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'perizinan-documents' and public.can_upload_license_file(name));

-- Sengaja TIDAK ada policy update/delete: arsip tidak boleh ditimpa atau dihapus oleh user.
-- Penghapusan fisik hanya lewat Dashboard Supabase oleh pemilik proyek.
