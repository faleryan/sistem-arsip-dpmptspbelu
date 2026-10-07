-- ============================================================================
-- SIPAR-BELU · Migration 0009 · Indeks halaman Audit Log & Data Terhapus (Fase 5)
-- Jalankan SETELAH 0008. Aman dijalankan ulang. Tidak mengubah aturan akses.
-- ============================================================================

-- Jejak audit per data (tautan "Jejak audit" dari halaman detail).
create index if not exists idx_audit_record     on public.audit_logs (record_id, created_at desc);
-- Filter aksi pada halaman Audit Log.
create index if not exists idx_audit_action     on public.audit_logs (action, created_at desc);
-- Pencarian kata pada deskripsi dan nama pengguna.
create index if not exists idx_audit_desc_trgm  on public.audit_logs using gin (description extensions.gin_trgm_ops);
create index if not exists idx_audit_uname_trgm on public.audit_logs using gin (user_name extensions.gin_trgm_ops);

-- Daftar Data Terhapus (hanya baris yang dihapus lunak).
create index if not exists idx_licenses_deleted   on public.licenses   (deleted_at desc) where deleted_at is not null;
create index if not exists idx_applicants_deleted on public.applicants (deleted_at desc) where deleted_at is not null;
create index if not exists idx_businesses_deleted on public.businesses (deleted_at desc) where deleted_at is not null;
create index if not exists idx_documents_deleted  on public.documents  (deleted_at desc) where deleted_at is not null;

notify pgrst, 'reload schema';
