-- Permettre à tous les membres d'une org de voir les profils de l'équipe
-- (sélecteur Owner sur fiche entreprise, rattachement import, etc.).
-- Avant : seuls les admins voyaient les autres profils.

drop policy if exists "profiles_select_own_or_team" on public.profiles;
create policy "profiles_select_own_or_team"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or (
      organization_id is not null
      and organization_id = public.my_organization_id()
    )
  );
