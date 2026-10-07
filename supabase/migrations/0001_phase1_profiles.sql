-- SIPAR-BELU · Migration Fase 1 (minimum agar login + role berfungsi)
-- Jalankan di Supabase → SQL Editor. Aman dijalankan ulang (idempotent).
-- Migration lengkap (seluruh tabel, RLS, audit) menyusul di Fase 2 dan membangun di atas file ini.

create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum
    ('super_admin', 'admin_arsip', 'petugas', 'verifikator', 'pimpinan', 'viewer');
exception when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  role        public.app_role not null default 'viewer',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Fungsi bantu RLS. SECURITY DEFINER agar tidak rekursif terhadap RLS profiles.
create or replace function public.current_role_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.has_role(variadic roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_code() = any (roles), false)
$$;

revoke all on function public.current_role_code() from public, anon;
revoke all on function public.has_role(text[]) from public, anon;
grant execute on function public.current_role_code() to authenticated;
grant execute on function public.has_role(text[]) to authenticated;

-- RLS: default tolak. Anon tidak punya akses sama sekali.
alter table public.profiles enable row level security;
revoke all on public.profiles from anon;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.has_role('super_admin'));

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.has_role('super_admin'))
  with check (public.has_role('super_admin'));

-- Tidak ada policy INSERT/DELETE: profil dibuat lewat Edge Function admin-create-user (Fase 2)
-- atau manual oleh pemilik proyek seperti contoh di bawah.

-- ─────────────────────────────────────────────────────────────
-- LANGKAH MANUAL: membuat Super Admin pertama
-- 1) Supabase → Authentication → Users → Add user (isi email + password, centang Auto Confirm).
-- 2) Jalankan (ganti email dan nama):
--
--   insert into public.profiles (id, full_name, role)
--   select id, 'Nama Super Admin', 'super_admin'
--   from auth.users
--   where email = 'email-anda@contoh.go.id'
--   on conflict (id) do update set role = 'super_admin', is_active = true;
--
-- 3) Authentication → Providers → Email: matikan "Allow new users to sign up"
--    (tidak ada pendaftaran mandiri; user dibuat oleh Super Admin).
-- ─────────────────────────────────────────────────────────────
