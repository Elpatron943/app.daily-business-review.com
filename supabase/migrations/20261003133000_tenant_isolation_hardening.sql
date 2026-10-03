-- Isolation des organisations et protection de la console plateforme (2026-10-03)
--
-- Avant ce correctif, tout utilisateur connecté pouvait :
--   1. se déclarer administrateur plateforme (profiles.is_platform_admin) ;
--   2. changer son organization_id et lire / modifier les données d'une autre organisation ;
--   3. s'il était admin de son org, modifier son abonnement (plan, statut, sièges, fin d'essai)
--      et lire la liste de toutes les organisations.
--
-- Ces colonnes ne sont désormais modifiables que côté serveur (service_role, fonctions
-- SECURITY DEFINER, SQL admin). L'app cliente n'écrit que profiles.role / full_name
-- et organizations.name / onboarding_* : aucun changement de comportement.

-- 1. Profils : colonnes privilégiées verrouillées pour les clients connectés
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- current_user vaut 'authenticated' / 'anon' pour un appel client direct ;
  -- il vaut le propriétaire pour les fonctions SECURITY DEFINER et 'service_role' côté serveur.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.is_platform_admin, false) then
      raise exception 'is_platform_admin ne peut pas être défini par le client';
    end if;
    if new.organization_id is not null then
      raise exception 'organization_id ne peut pas être défini par le client';
    end if;
  else
    if new.is_platform_admin is distinct from old.is_platform_admin then
      raise exception 'is_platform_admin ne peut pas être modifié par le client';
    end if;
    if new.organization_id is distinct from old.organization_id then
      raise exception 'organization_id ne peut pas être modifié par le client';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_profile_privileged_columns() from public, anon, authenticated;

-- Nom en "a_" pour s'exécuter avant profiles_ensure_organization (ordre alphabétique).
drop trigger if exists profiles_a_guard_privileged on public.profiles;
create trigger profiles_a_guard_privileged
  before insert or update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- 2. Organisations : facturation non modifiable par le client
create or replace function public.guard_organization_billing_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.commercial_plan_id is distinct from old.commercial_plan_id
     or new.seat_quantity is distinct from old.seat_quantity
     or new.subscription_status is distinct from old.subscription_status
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.optional_modules is distinct from old.optional_modules then
    raise exception 'Les champs d''abonnement ne peuvent être modifiés que par la plateforme';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_organization_billing_columns() from public, anon, authenticated;

drop trigger if exists organizations_guard_billing on public.organizations;
create trigger organizations_guard_billing
  before update on public.organizations
  for each row execute function public.guard_organization_billing_columns();

-- 3. Organisations : un admin ne voit que la sienne (les admins plateforme gardent
--    leur policy dédiée platform_admin_select_organizations).
drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member on public.organizations
  for select to authenticated
  using (id = public.my_organization_id());

-- 4. Organisations : la création passe par la plateforme (trigger SECURITY DEFINER
--    ensure_profile_organization ou fonctions serveur), jamais par le client.
drop policy if exists organizations_insert_admin on public.organizations;
