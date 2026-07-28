-- Durcit les policies profiles : un admin ne gère que son organisation.
-- Les commerciaux (role=user) ne modifient que leur propre nom (déjà couvert).

create or replace function public.my_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

drop policy if exists "profiles_select_own_or_team" on public.profiles;
create policy "profiles_select_own_or_team"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or manager_id = auth.uid()
    or (
      public.is_admin()
      and organization_id is not null
      and organization_id = public.my_organization_id()
    )
  );

drop policy if exists "profiles_admin_update_team" on public.profiles;
create policy "profiles_admin_update_team"
  on public.profiles for update
  to authenticated
  using (
    public.is_admin()
    and organization_id is not null
    and organization_id = public.my_organization_id()
  )
  with check (
    public.is_admin()
    and organization_id is not null
    and organization_id = public.my_organization_id()
  );
