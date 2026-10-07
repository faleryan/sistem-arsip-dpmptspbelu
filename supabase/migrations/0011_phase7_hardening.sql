-- ============================================================================
-- SIPAR-BELU · Migration 0011 · Fase 7: pengerasan keamanan, pengaturan, integritas Storage
-- Jalankan SETELAH 0010. Aman dijalankan ulang.
-- ============================================================================

-- ── 1. Hak eksekusi fungsi: tertutup secara bawaan ──────────────────────────
-- Supabase memberi EXECUTE ke PUBLIC/anon untuk setiap fungsi baru. Semua fungsi SIPAR-BELU
-- sudah memberi hak secara eksplisit, jadi bawaan ini dicabut agar fungsi yang ditambahkan
-- kelak tidak otomatis terbuka untuk publik.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
revoke all on function public.set_updated_at() from public, anon;

-- ── 2. Validasi nilai pengaturan sistem ─────────────────────────────────────
-- Policy RLS sudah membatasi siapa yang boleh mengubah (super_admin); trigger ini
-- menjaga APA yang boleh disimpan, karena nilai dipakai oleh fungsi server
-- (verify_license, pemeliharaan harian, batas unggah).
create or replace function public.validate_system_setting()
returns trigger language plpgsql set search_path = public as $$
declare
  v_type text := jsonb_typeof(new.value);
  v_txt  text;
  v_num  numeric;
begin
  case new.key
    when 'agency_name', 'agency_short_name' then
      if v_type <> 'string' then raise exception 'Pengaturan % harus berupa teks', new.key using errcode = '22023'; end if;
      v_txt := btrim(new.value #>> '{}');
      if new.key = 'agency_name' and char_length(v_txt) not between 5 and 200 then
        raise exception 'Nama instansi harus 5–200 karakter' using errcode = '22023';
      end if;
      if new.key = 'agency_short_name' and char_length(v_txt) not between 2 and 80 then
        raise exception 'Nama singkat instansi harus 2–80 karakter' using errcode = '22023';
      end if;
      new.value := to_jsonb(v_txt);
    when 'max_upload_mb', 'expiry_warning_days' then
      if v_type <> 'number' then raise exception 'Pengaturan % harus berupa angka', new.key using errcode = '22023'; end if;
      v_num := (new.value #>> '{}')::numeric;
      if v_num <> trunc(v_num) then raise exception 'Pengaturan % harus bilangan bulat', new.key using errcode = '22023'; end if;
      if new.key = 'max_upload_mb' and v_num not between 1 and 10 then
        raise exception 'Batas unggah harus 1–10 MB (batas bucket Storage 10 MB)' using errcode = '22023';
      end if;
      if new.key = 'expiry_warning_days' and v_num not between 1 and 365 then
        raise exception 'Peringatan masa berlaku harus 1–365 hari' using errcode = '22023';
      end if;
    else
      raise exception 'Kunci pengaturan "%" tidak dikenal', new.key using errcode = '22023';
  end case;
  if tg_op = 'UPDATE' and new.key <> old.key then
    raise exception 'Kunci pengaturan tidak boleh diubah' using errcode = '22023';
  end if;
  -- Catat pengubah hanya bila nilainya berubah (bukan saat kaskade FK, mis. profil dihapus).
  if tg_op = 'INSERT' or new.value is distinct from old.value then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;
revoke all on function public.validate_system_setting() from public, anon, authenticated;

drop trigger if exists trg_validate_system_setting on public.system_settings;
create trigger trg_validate_system_setting
  before insert or update on public.system_settings
  for each row execute function public.validate_system_setting();

-- Pengaturan hanya diubah, tidak ditambah/dihapus dari aplikasi.
revoke insert, delete on public.system_settings from authenticated;

-- ── 3. Integritas Storage ↔ database ────────────────────────────────────────
-- "File yatim": objek di bucket tanpa baris document_versions (mis. unggahan berhasil
-- tetapi penyimpanan metadata gagal). Diberi jeda 1 jam agar unggahan yang sedang
-- berlangsung tidak ikut terhitung.
create or replace function public.is_orphan_object(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  -- Hanya Super Admin yang perlu tahu apakah sebuah lokasi file "yatim".
  select public.has_role('super_admin')
     and exists (
           select 1 from storage.objects o
            where o.bucket_id = 'perizinan-documents' and o.name = p_name
              and o.created_at < now() - interval '1 hour')
     and not exists (select 1 from public.document_versions v where v.storage_path = p_name)
$$;
revoke all on function public.is_orphan_object(text) from public, anon;
grant execute on function public.is_orphan_object(text) to authenticated;

-- Laporan integritas (khusus Super Admin):
--  FILE_YATIM  : objek bucket tanpa versi dokumen (boleh dihapus)
--  FILE_HILANG : versi dokumen yang file-nya tidak ada di bucket (perlu diunggah ulang)
create or replace function public.storage_integrity_report()
returns table (
  kind text, storage_path text, size_bytes bigint, mime_type text, created_at timestamptz,
  license_id uuid, license_label text, deletable boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role('super_admin') then
    raise exception 'Hanya Super Admin yang dapat memeriksa integritas penyimpanan' using errcode = '42501';
  end if;
  return query
    select 'FILE_YATIM'::text, o.name, nullif(o.metadata->>'size', '')::bigint, o.metadata->>'mimetype',
           o.created_at, public.storage_path_license_id(o.name),
           coalesce(l.license_number, l.application_number),
           o.created_at < now() - interval '1 hour'
      from storage.objects o
      left join public.licenses l on l.id = public.storage_path_license_id(o.name)
     where o.bucket_id = 'perizinan-documents'
       and not exists (select 1 from public.document_versions v where v.storage_path = o.name)
    union all
    select 'FILE_HILANG'::text, v.storage_path, v.size_bytes, v.mime_type, v.uploaded_at,
           d.license_id, coalesce(l.license_number, l.application_number), false
      from public.document_versions v
      join public.documents d on d.id = v.document_id
      left join public.licenses l on l.id = d.license_id
     where not exists (select 1 from storage.objects o
                        where o.bucket_id = 'perizinan-documents' and o.name = v.storage_path)
    order by 1, 5;
end $$;
revoke all on function public.storage_integrity_report() from public, anon;
grant execute on function public.storage_integrity_report() to authenticated;

-- Super Admin boleh menghapus HANYA file yatim berumur > 1 jam. File yang sudah tercatat
-- sebagai versi dokumen tetap tidak dapat dihapus siapa pun dari aplikasi.
drop policy if exists sipar_docs_delete_orphan on storage.objects;
create policy sipar_docs_delete_orphan on storage.objects
  for delete to authenticated
  using (bucket_id = 'perizinan-documents'
         and (select public.has_role('super_admin'))
         and public.is_orphan_object(name));

notify pgrst, 'reload schema';
