-- DBR — profils & rôles (à exécuter dans Supabase → SQL Editor)
-- Rôles : admin (équipe + settings) | user (pas d’accès Personnaliser)
--
-- Tables métier (comptes, opps, plans, config…) :
--   → exécuter ensuite migrations/20260727220000_dbr_domain.sql
--   → voir supabase/README.md

do $$ begin
  create type public.app_role as enum ('admin', 'user');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

alter table public.profiles enable row level security;

-- Évite la récursion RLS en lisant le rôle hors policies
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "profiles_select_own_or_team" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_own_name" on public.profiles;
drop policy if exists "profiles_admin_update_team" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;

-- Lecture : soi-même, ou toute l’org si admin
create policy "profiles_select_own_or_team"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
  );

-- Mise à jour de son propre profil (nom) — rôle protégé par trigger
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admin : maj rôle dans l’organisation
create policy "profiles_admin_update_team"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Création profil (trigger) — insert autorisé pour son propre id
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- Empêche un commercial de s’auto-promouvoir admin
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role then
    if not public.is_admin() then
      raise exception 'Seul un admin peut modifier le rôle';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged on public.profiles;
create trigger profiles_protect_privileged
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_fields();

-- Nouveau compte auth → ligne profiles
-- Premier compte de la base = admin, les suivants = user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count int;
  new_role public.app_role;
begin
  select count(*) into admin_count from public.profiles where role = 'admin';
  if admin_count = 0 then
    new_role := 'admin';
  else
    new_role := 'user';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at
create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profiles_updated_at();
