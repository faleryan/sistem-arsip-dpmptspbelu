-- ============================================================================
-- SIPAR-BELU · seed_test_users.sql · 5 AKUN UJI (OPSIONAL, HANYA UNTUK LINGKUNGAN UJI)
--
-- ⚠ Semua akun memakai kata sandi yang sama dan TERTULIS DI FILE INI → tidak aman.
--   Gunakan hanya di proyek Supabase uji. Sebelum produksi: jalankan bagian
--   "BERSIHKAN" di bawah, lalu buat akun asli lewat halaman Pengguna (Super Admin).
-- ⚠ File ini menulis langsung ke schema `auth` (cara yang lazim untuk seed). Jika di versi
--   Supabase Anda gagal, buat user lewat Dashboard → Authentication → Add user, lalu
--   jalankan hanya blok "insert into public.profiles" di bawah dengan UUID user tsb.
--
-- Kata sandi uji untuk semua akun:  SiparBelu#Uji2026
-- ============================================================================

do $$
declare
  r record;
  v_pass text := 'SiparBelu#Uji2026';
begin
  for r in
    select * from (values
      ('11111111-1111-1111-1111-111111111101'::uuid, 'superadmin@example.com',  'Super Admin Uji',  'super_admin'),
      ('11111111-1111-1111-1111-111111111102'::uuid, 'adminarsip@example.com',  'Admin Arsip Uji',  'admin_arsip'),
      ('11111111-1111-1111-1111-111111111103'::uuid, 'petugas@example.com',     'Petugas Uji',      'petugas'),
      ('11111111-1111-1111-1111-111111111104'::uuid, 'verifikator@example.com', 'Verifikator Uji',  'verifikator'),
      ('11111111-1111-1111-1111-111111111105'::uuid, 'pimpinan@example.com',    'Pimpinan Uji',     'pimpinan')
    ) as t(id, email, full_name, role)
  loop
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change)
    values
      ('00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated', r.email,
       extensions.crypt(v_pass, extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
    on conflict (id) do nothing;

    insert into auth.identities
      (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    select gen_random_uuid(), r.id, r.id::text, 'email',
           jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true),
           now(), now(), now()
     where not exists (select 1 from auth.identities where user_id = r.id and provider = 'email');

    insert into public.profiles (id, full_name, role, email, unit_id)
    values (r.id, r.full_name, r.role::public.app_role, r.email,
            (select id from public.units where name = 'Bidang Pelayanan Perizinan'))
    on conflict (id) do update
      set full_name = excluded.full_name, role = excluded.role, email = excluded.email, is_active = true;
  end loop;
end $$;

-- ── BERSIHKAN (jalankan sebelum produksi) ───────────────────────────────────
-- delete from auth.users where id in (
--   '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111102',
--   '11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111104',
--   '11111111-1111-1111-1111-111111111105');
