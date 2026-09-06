-- DBR — packaging site : Freemium / Sales Solo / Entreprise
-- Entitlements appliqués côté app (src/billing/entitlements.ts)

-- ---------------------------------------------------------------------------
-- 1. Seed / upsert formules
-- ---------------------------------------------------------------------------

insert into public.commercial_plans (
  code, name, description, tagline,
  price_cents_month, currency,
  max_seats, max_active_opportunities, max_exports_month,
  features, is_active, sort_order
) values
(
  'freemium',
  'Freemium',
  'Même périmètre que Sales Solo — 1 opportunité, 3 jours.',
  'Essayer DBR gratuitement',
  0,
  'EUR',
  1,
  1,
  null,
  '["nav.saisie","nav.settings","1 utilisateur","1 opportunité","3 jours"]'::jsonb,
  true,
  5
),
(
  'sales_solo',
  'Sales Solo',
  '1 utilisateur, jusqu’à 20 opportunités. Settings + Saisie uniquement (pas Vue, Pilotage, process, mapping, plan d’action).',
  'Pour le commercial indépendant',
  4900,
  'EUR',
  1,
  20,
  null,
  '["nav.saisie","nav.settings","1 utilisateur","20 opportunités"]'::jsonb,
  true,
  15
),
(
  'enterprise',
  'Entreprise',
  'Produit complet — multi-users, Vue, Pilotage, process, mapping, account plan. Sur devis.',
  'Équipes & organisations',
  null,
  'EUR',
  null,
  null,
  null,
  '["nav.view","nav.saisie","nav.pilotage","nav.settings","opp.process","opp.mapping","opp.action_plan","team.invite"]'::jsonb,
  true,
  40
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  tagline = excluded.tagline,
  price_cents_month = excluded.price_cents_month,
  currency = excluded.currency,
  max_seats = excluded.max_seats,
  max_active_opportunities = excluded.max_active_opportunities,
  max_exports_month = excluded.max_exports_month,
  features = excluded.features,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Anciennes formules : conservées en legacy, retirées du catalogue actif
update public.commercial_plans
set is_active = false, updated_at = now()
where code in ('trial', 'team', 'business');

-- ---------------------------------------------------------------------------
-- 2. Flag super-admin plateforme (console admin)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false;

create index if not exists profiles_platform_admin_idx
  on public.profiles (is_platform_admin)
  where is_platform_admin = true;

-- ---------------------------------------------------------------------------
-- 3. RLS — lecture catalogue plans inchangée ; écriture orgs plateforme via service_role
-- ---------------------------------------------------------------------------

comment on column public.profiles.is_platform_admin is
  'Console admin DBR : créer orgs Freemium/Solo/Entreprise et activer après paiement.';

-- Lecture de toutes les orgs pour la console plateforme
drop policy if exists "platform_admin_select_organizations" on public.organizations;
create policy "platform_admin_select_organizations"
  on public.organizations for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_platform_admin is true
    )
  );
