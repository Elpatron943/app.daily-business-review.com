-- Rattachement équipe = organization_id uniquement.
-- Plus de hiérarchie manager_id (case « Dans mon équipe »).

do $$ begin
  create type public.app_role as enum ('admin', 'user');
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists role public.app_role not null default 'user';

alter table public.profiles
  add column if not exists organization_id uuid;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid() and p.role::text = 'admin'
  );
$$;

create or replace function public.my_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.organization_id
  from public.profiles as p
  where p.id = auth.uid();
$$;

drop policy if exists "profiles_select_own_or_team" on public.profiles;
create policy "profiles_select_own_or_team"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or (
      public.is_admin()
      and organization_id is not null
      and organization_id = public.my_organization_id()
    )
  );

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

alter table public.profiles
  drop constraint if exists profiles_manager_not_self;

drop index if exists public.profiles_manager_id_idx;

alter table public.profiles
  drop column if exists manager_id;
