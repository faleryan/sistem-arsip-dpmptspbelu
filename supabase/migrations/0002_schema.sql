-- ============================================================================
-- SIPAR-BELU · Migration 0002 · Skema tabel, enum, constraint, indeks
-- Jalankan SETELAH 0001. Aman dijalankan ulang (idempotent).
-- ============================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ── Enum ────────────────────────────────────────────────────────────────────
do $$ begin
  create type public.license_status as enum
    ('DRAFT','DIAJUKAN','VERIFIKASI','DISETUJUI','DITERBITKAN','AKTIF','BERAKHIR',
     'DITOLAK','DICABUT','DIBATALKAN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.doc_status as enum ('MENUNGGU_VERIFIKASI','TERVERIFIKASI','DITOLAK');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_result as enum ('TERVERIFIKASI','DITOLAK');
exception when duplicate_object then null; end $$;

-- ── Organisasi & akses ──────────────────────────────────────────────────────
create table if not exists public.units (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- profiles dibuat di 0001; tambah kolom yang dibutuhkan fase ini.
alter table public.profiles
  add column if not exists email   text,
  add column if not exists nip     text,
  add column if not exists phone   text,
  add column if not exists unit_id uuid references public.units (id) on delete set null;

create table if not exists public.roles (
  code         text primary key,
  label        text not null,
  description  text
);

create table if not exists public.permissions (
  code    text primary key,
  module  text not null,
  label   text not null
);

create table if not exists public.role_permissions (
  role_code        text not null references public.roles (code) on delete cascade,
  permission_code  text not null references public.permissions (code) on delete cascade,
  primary key (role_code, permission_code)
);

-- ── Wilayah ─────────────────────────────────────────────────────────────────
create table if not exists public.districts (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.villages (
  id           uuid primary key default gen_random_uuid(),
  district_id  uuid not null references public.districts (id) on delete restrict,
  code         text,
  name         text not null,
  type         text not null default 'desa' check (type in ('desa', 'kelurahan')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (district_id, name)
);

-- ── Pihak: pemohon & perusahaan ─────────────────────────────────────────────
create table if not exists public.applicants (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null check (btrim(full_name) <> ''),
  nik          text check (nik is null or nik ~ '^[0-9]{16}$'),
  npwp         text check (npwp is null or npwp ~ '^[0-9.\-]{15,20}$'),
  phone        text,
  email        text,
  address      text,
  district_id  uuid references public.districts (id) on delete set null,
  village_id   uuid references public.villages (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.businesses (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (btrim(name) <> ''),
  nib               text check (nib is null or nib ~ '^[0-9]{13}$'),
  npwp              text check (npwp is null or npwp ~ '^[0-9.\-]{15,20}$'),
  entity_type       text,
  address           text,
  district_id       uuid references public.districts (id) on delete set null,
  village_id        uuid references public.villages (id) on delete set null,
  phone             text,
  email             text,
  person_in_charge  text,
  created_by        uuid references public.profiles (id) on delete set null default auth.uid(),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Master perizinan & dokumen ──────────────────────────────────────────────
create table if not exists public.license_types (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  category         text,
  description      text,
  validity_months  integer check (validity_months is null or validity_months > 0),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.document_types (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  storage_folder  text not null
    check (storage_folder in ('ktp','nib','npwp','surat-permohonan','surat-izin','dokumen-pendukung')),
  -- Role Viewer hanya boleh melihat dokumen yang berjenis ini (default: tidak boleh).
  viewer_visible  boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.archive_classes (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Dokumen wajib per jenis izin (dasar perhitungan "dokumen tidak lengkap").
create table if not exists public.license_type_documents (
  license_type_id  uuid not null references public.license_types (id) on delete cascade,
  document_type_id uuid not null references public.document_types (id) on delete restrict,
  primary key (license_type_id, document_type_id)
);

-- ── Perizinan ───────────────────────────────────────────────────────────────
create table if not exists public.licenses (
  id                 uuid primary key default gen_random_uuid(),
  license_number     text unique,
  application_number text not null unique,
  nib                text,
  license_type_id    uuid not null references public.license_types (id) on delete restrict,
  applicant_id       uuid not null references public.applicants (id) on delete restrict,
  business_id        uuid references public.businesses (id) on delete restrict,
  district_id        uuid references public.districts (id) on delete set null,
  application_date   date,
  issue_date         date,
  expiry_date        date,
  status             public.license_status not null default 'DRAFT',
  officer_id         uuid references public.profiles (id) on delete set null default auth.uid(),
  verification_code  text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  year               integer,
  notes              text,
  created_by         uuid references public.profiles (id) on delete set null default auth.uid(),
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (expiry_date is null or issue_date is null or expiry_date >= issue_date)
);

create table if not exists public.license_status_history (
  id          uuid primary key default gen_random_uuid(),
  license_id  uuid not null references public.licenses (id) on delete cascade,
  from_status public.license_status,
  to_status   public.license_status not null,
  note        text,
  changed_by  uuid references public.profiles (id) on delete set null,
  -- clock_timestamp(), bukan now(): dua perubahan dalam satu transaksi (mis. DITERBITKAN lalu
  -- AKTIF otomatis) harus tetap berurutan.
  changed_at  timestamptz not null default clock_timestamp()
);

-- Matriks transisi status yang sah (dibaca oleh change_license_status()).
create table if not exists public.license_status_transitions (
  from_status    public.license_status not null,
  to_status      public.license_status not null,
  allowed_roles  text[] not null,
  requires_note  boolean not null default false,
  primary key (from_status, to_status)
);

-- ── Dokumen, versi, verifikasi ──────────────────────────────────────────────
create table if not exists public.documents (
  id                 uuid primary key default gen_random_uuid(),
  license_id         uuid not null references public.licenses (id) on delete restrict,
  document_type_id   uuid not null references public.document_types (id) on delete restrict,
  archive_class_id   uuid references public.archive_classes (id) on delete set null,
  document_number    text,
  document_date      date,
  title              text not null check (btrim(title) <> ''),
  status             public.doc_status not null default 'MENUNGGU_VERIFIKASI',
  current_version_id uuid,
  created_by         uuid references public.profiles (id) on delete set null default auth.uid(),
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.document_versions (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references public.documents (id) on delete restrict,
  version_no       integer not null default 1,
  file_name        text not null
    check (file_name ~* '\.(pdf|jpe?g|png)$' and length(file_name) <= 255),
  storage_path     text not null unique
    check (storage_path ~ '^[0-9]{4}/[0-9a-f-]{36}/[a-z-]+/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$'),
  mime_type        text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes       bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  checksum_sha256  text,
  is_current       boolean not null default true,
  uploaded_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  uploaded_at      timestamptz not null default now(),
  unique (document_id, version_no)
);

do $$ begin
  alter table public.documents
    add constraint documents_current_version_fk
    foreign key (current_version_id) references public.document_versions (id) on delete restrict;
exception when duplicate_object then null; end $$;

create table if not exists public.document_verifications (
  id                   uuid primary key default gen_random_uuid(),
  document_version_id  uuid not null references public.document_versions (id) on delete restrict,
  result               public.verification_result not null,
  note                 text,
  verified_by          uuid references public.profiles (id) on delete set null,
  verified_at          timestamptz not null default clock_timestamp(),
  check (result <> 'DITOLAK' or (note is not null and btrim(note) <> ''))
);

-- ── Sistem ──────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link        text,
  is_read     boolean not null default false,
  dedupe_key  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id           bigint generated always as identity primary key,
  user_id      uuid,
  user_name    text,
  user_role    text,
  action       text not null,
  description  text,
  module       text not null,
  record_id    text,
  old_value    jsonb,
  new_value    jsonb,
  ip_address   text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create table if not exists public.system_settings (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles (id) on delete set null
);

-- ── Indeks ──────────────────────────────────────────────────────────────────
create index if not exists idx_profiles_unit            on public.profiles (unit_id);
create index if not exists idx_villages_district        on public.villages (district_id);

create unique index if not exists uq_applicants_nik     on public.applicants (nik) where nik is not null and deleted_at is null;
create unique index if not exists uq_businesses_nib     on public.businesses (nib) where nib is not null and deleted_at is null;
create index if not exists idx_applicants_district      on public.applicants (district_id);
create index if not exists idx_applicants_village       on public.applicants (village_id);
create index if not exists idx_businesses_district      on public.businesses (district_id);
create index if not exists idx_businesses_village       on public.businesses (village_id);
create index if not exists idx_applicants_name_trgm     on public.applicants using gin (full_name extensions.gin_trgm_ops);
create index if not exists idx_applicants_nik_trgm      on public.applicants using gin (nik extensions.gin_trgm_ops);
create index if not exists idx_applicants_npwp_trgm     on public.applicants using gin (npwp extensions.gin_trgm_ops);
create index if not exists idx_businesses_name_trgm     on public.businesses using gin (name extensions.gin_trgm_ops);
create index if not exists idx_businesses_nib_trgm      on public.businesses using gin (nib extensions.gin_trgm_ops);

create index if not exists idx_licenses_status          on public.licenses (status) where deleted_at is null;
create index if not exists idx_licenses_year            on public.licenses (year) where deleted_at is null;
create index if not exists idx_licenses_type            on public.licenses (license_type_id);
create index if not exists idx_licenses_applicant       on public.licenses (applicant_id);
create index if not exists idx_licenses_business        on public.licenses (business_id);
create index if not exists idx_licenses_district        on public.licenses (district_id);
create index if not exists idx_licenses_officer         on public.licenses (officer_id);
create index if not exists idx_licenses_expiry          on public.licenses (expiry_date) where deleted_at is null;
create index if not exists idx_licenses_number_trgm     on public.licenses using gin (license_number extensions.gin_trgm_ops);
create index if not exists idx_licenses_appno_trgm      on public.licenses using gin (application_number extensions.gin_trgm_ops);
create index if not exists idx_licenses_nib_trgm        on public.licenses using gin (nib extensions.gin_trgm_ops);

create index if not exists idx_status_history_license   on public.license_status_history (license_id, changed_at desc);

create index if not exists idx_documents_license        on public.documents (license_id);
create index if not exists idx_documents_type           on public.documents (document_type_id);
create index if not exists idx_documents_status         on public.documents (status) where deleted_at is null;
create index if not exists idx_documents_class          on public.documents (archive_class_id);
create index if not exists idx_documents_number_trgm    on public.documents using gin (document_number extensions.gin_trgm_ops);
create unique index if not exists uq_document_current_version
  on public.document_versions (document_id) where is_current;
create index if not exists idx_doc_versions_document    on public.document_versions (document_id, version_no desc);
create index if not exists idx_doc_verifications_ver    on public.document_verifications (document_version_id, verified_at desc);

create index if not exists idx_notifications_user       on public.notifications (user_id, is_read, created_at desc);
create unique index if not exists uq_notifications_dedupe
  on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

create index if not exists idx_audit_created            on public.audit_logs (created_at desc);
create index if not exists idx_audit_module_record      on public.audit_logs (module, record_id);
create index if not exists idx_audit_user               on public.audit_logs (user_id);
