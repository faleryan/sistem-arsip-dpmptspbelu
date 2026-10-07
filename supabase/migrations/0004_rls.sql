-- ============================================================================
-- SIPAR-BELU · Migration 0004 · Row Level Security + grants
-- Jalankan SETELAH 0003. Aman dijalankan ulang.
--
-- Prinsip: default tolak. `anon` tidak punya akses ke tabel mana pun.
-- Pembatasan role mengikuti matriks pada docs/00-DESAIN.md (bagian 5-6).
-- ============================================================================

-- Pastikan fungsi bantu RLS (has_role, dst.) tidak terblokir oleh RLS itu sendiri.
-- (FORCE RLS dari 0001 dilepas; pemilik tabel bukan jalur akses klien.)
alter table public.profiles no force row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','units','roles','permissions','role_permissions','districts','villages',
    'applicants','businesses','license_types','document_types','archive_classes',
    'license_type_documents','licenses','license_status_history','license_status_transitions',
    'documents','document_versions','document_verifications','notifications','audit_logs',
    'system_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ── Master data: semua user aktif membaca, hanya Super Admin menulis ───────
do $$
declare t text;
begin
  foreach t in array array[
    'units','roles','permissions','role_permissions','districts','villages','license_types',
    'document_types','archive_classes','license_type_documents','system_settings'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.current_role_code() is not null)', t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (public.has_role(''super_admin''))', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.has_role(''super_admin'')) with check (public.has_role(''super_admin''))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (public.has_role(''super_admin''))', t || '_delete', t);
  end loop;
end $$;

drop policy if exists license_status_transitions_select on public.license_status_transitions;
create policy license_status_transitions_select on public.license_status_transitions
  for select to authenticated using (public.current_role_code() is not null);

-- ── profiles (policy select_self / select_admin / update_admin dari 0001) ──
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() and public.current_role_code() is not null)
  with check (id = auth.uid());

-- ── Pemohon & perusahaan ───────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['applicants','businesses'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.is_internal()
                and (deleted_at is null or public.has_role(''super_admin'',''admin_arsip'')))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (public.can_write_archive() and deleted_at is null)', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.can_write_archive()
                and (deleted_at is null or public.has_role(''super_admin'',''admin_arsip'')))
         with check (public.can_write_archive())', t || '_update', t);
  end loop;
end $$;

-- ── Perizinan ──────────────────────────────────────────────────────────────
drop policy if exists licenses_select on public.licenses;
create policy licenses_select on public.licenses
  for select to authenticated
  using (
    (deleted_at is null or public.has_role('super_admin','admin_arsip'))
    and (public.is_internal()
         or (public.has_role('viewer') and status in ('DITERBITKAN','AKTIF','BERAKHIR')))
  );

drop policy if exists licenses_insert on public.licenses;
create policy licenses_insert on public.licenses
  for insert to authenticated
  with check (
    deleted_at is null
    and (public.has_role('super_admin','admin_arsip')
         or (public.has_role('petugas') and status = 'DRAFT' and officer_id = auth.uid()))
  );

drop policy if exists licenses_update on public.licenses;
create policy licenses_update on public.licenses
  for update to authenticated
  using (
    public.has_role('super_admin')
    or (deleted_at is null and (
         public.has_role('admin_arsip')
         or (public.has_role('petugas')
             and (officer_id = auth.uid() or created_by = auth.uid())
             and status in ('DRAFT','DIAJUKAN'))))
  )
  with check (
    public.has_role('super_admin','admin_arsip')
    or (public.has_role('petugas') and deleted_at is null
        and (officer_id = auth.uid() or created_by = auth.uid())
        and status in ('DRAFT','DIAJUKAN'))
  );

drop policy if exists license_status_history_select on public.license_status_history;
create policy license_status_history_select on public.license_status_history
  for select to authenticated using (public.is_internal());

-- ── Dokumen ────────────────────────────────────────────────────────────────
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using (
    (public.is_internal()
       and (deleted_at is null or public.has_role('super_admin','admin_arsip')))
    or (public.has_role('viewer') and deleted_at is null
        and exists (select 1 from public.document_types dt
                     where dt.id = document_type_id and dt.viewer_visible)
        and exists (select 1 from public.licenses l
                     where l.id = license_id and l.deleted_at is null
                       and l.status in ('DITERBITKAN','AKTIF','BERAKHIR')))
  );

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents
  for insert to authenticated
  with check (deleted_at is null and public.can_manage_documents(license_id));

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents
  for update to authenticated
  using (public.can_manage_documents(license_id))
  with check (public.can_manage_documents(license_id));

drop policy if exists document_versions_select on public.document_versions;
create policy document_versions_select on public.document_versions
  for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id));

drop policy if exists document_versions_insert on public.document_versions;
create policy document_versions_insert on public.document_versions
  for insert to authenticated
  with check (exists (select 1 from public.documents d
                       where d.id = document_id and public.can_manage_documents(d.license_id)));

-- Verifikasi hanya lewat verify_document(); tidak ada policy insert/update/delete.
drop policy if exists document_verifications_select on public.document_verifications;
create policy document_verifications_select on public.document_verifications
  for select to authenticated using (public.is_internal());

-- ── Notifikasi: milik sendiri ──────────────────────────────────────────────
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid() and public.current_role_code() is not null);

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid() and public.current_role_code() is not null)
  with check (user_id = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (user_id = auth.uid() and public.current_role_code() is not null);

-- ── Audit log: baca terbatas, tulis hanya lewat trigger ────────────────────
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.has_role('super_admin','admin_arsip','pimpinan'));

-- ── Grants (lapis kedua di bawah RLS) ──────────────────────────────────────
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

revoke insert, update, delete on public.audit_logs              from authenticated;
revoke insert, update, delete on public.license_status_history  from authenticated;
revoke insert, update, delete on public.license_status_transitions from authenticated;
revoke insert, update, delete on public.document_verifications  from authenticated;
revoke update, delete         on public.document_versions       from authenticated;
revoke insert, delete         on public.profiles                from authenticated;
revoke insert                 on public.notifications           from authenticated;
revoke update                 on public.notifications           from authenticated;
grant  update (is_read)       on public.notifications           to authenticated;

-- Tabel yang dibuat di masa depan tidak otomatis terbuka untuk anon.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

revoke all on public.v_staff, public.v_license_search, public.v_license_completeness from anon;
grant select on public.v_staff, public.v_license_search, public.v_license_completeness to authenticated;
