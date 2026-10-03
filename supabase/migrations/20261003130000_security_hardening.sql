-- Durcissement sécurité (advisors Supabase du 2026-10-03)
-- Aucun changement de comportement pour les utilisateurs connectés.

-- 1. Vue HubSpot : appliquer la RLS de l'utilisateur qui lit (et non celle du propriétaire)
--    et retirer l'accès anonyme. Avant : n'importe qui avec la clé publique lisait
--    les connexions HubSpot de toutes les organisations.
alter view public.hubspot_connection_status_v set (security_invoker = true);
revoke all on public.hubspot_connection_status_v from anon;

-- 2. Fonctions de trigger SECURITY DEFINER : jamais appelées en RPC.
--    Les triggers s'exécutent sans privilège EXECUTE, on ferme donc l'appel direct.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.ensure_profile_organization() from public, anon, authenticated;
revoke execute on function public.protect_profile_privileged_fields() from public, anon, authenticated;

-- 3. Helpers RLS : utilisés par les policies des utilisateurs connectés uniquement.
--    On les garde pour authenticated, on les ferme aux visiteurs anonymes.
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.my_organization_id() from public, anon;
revoke execute on function public.same_organization(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_organization_id() to authenticated;
grant execute on function public.same_organization(uuid) to authenticated;

-- 4. search_path figé sur les triggers updated_at
alter function public.set_updated_at() set search_path = '';
alter function public.set_profiles_updated_at() set search_path = '';
