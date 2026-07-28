-- DBR — formules commerciales (catalogue) + liaison organisations
-- À exécuter après 20260727220000_dbr_domain.sql

-- ---------------------------------------------------------------------------
-- 1. Catalogue commercial_plans
-- ---------------------------------------------------------------------------

create table if not exists public.commercial_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text not null default '',
  tagline text not null default '',
  price_cents_month integer,
  currency text not null default 'EUR',
  max_seats integer,
  max_active_opportunities integer,
  max_exports_month integer,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_plans_code_unique unique (code),
  constraint commercial_plans_code_nonempty check (length(trim(code)) > 0),
  constraint commercial_plans_price_nonneg check (
    price_cents_month is null or price_cents_month >= 0
  ),
  constraint commercial_plans_max_seats_nonneg check (
    max_seats is null or max_seats >= 0
  ),
  constraint commercial_plans_max_opps_nonneg check (
    max_active_opportunities is null or max_active_opportunities >= 0
  ),
  constraint commercial_plans_max_exports_nonneg check (
    max_exports_month is null or max_exports_month >= 0
  )
);

drop trigger if exists commercial_plans_set_updated_at on public.commercial_plans;
create trigger commercial_plans_set_updated_at
  before update on public.commercial_plans
  for each row execute function public.set_updated_at();

create index if not exists commercial_plans_active_sort_idx
  on public.commercial_plans (is_active, sort_order, name);

-- ---------------------------------------------------------------------------
-- 2. Colonnes organisations
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.subscription_status as enum (
    'none',
    'trialing',
    'active',
    'past_due',
    'canceled'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.organizations
  add column if not exists commercial_plan_id uuid
    references public.commercial_plans (id) on delete set null;

alter table public.organizations
  add column if not exists seat_quantity integer;

alter table public.organizations
  add column if not exists subscription_status public.subscription_status
    not null default 'none';

alter table public.organizations
  add column if not exists trial_ends_at timestamptz;

alter table public.organizations
  drop constraint if exists organizations_seat_quantity_nonneg;

alter table public.organizations
  add constraint organizations_seat_quantity_nonneg check (
    seat_quantity is null or seat_quantity >= 0
  );

create index if not exists organizations_commercial_plan_id_idx
  on public.organizations (commercial_plan_id);

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table public.commercial_plans enable row level security;

drop policy if exists "commercial_plans_select_authenticated" on public.commercial_plans;
create policy "commercial_plans_select_authenticated"
  on public.commercial_plans for select
  to authenticated
  using (true);

-- Écriture catalogue : service_role uniquement (pas de policy insert/update/delete pour authenticated)

-- Org members already have select/update policies ; ensure they can read plan via join

-- ---------------------------------------------------------------------------
-- 4. Seed CDC §4.1
-- ---------------------------------------------------------------------------

insert into public.commercial_plans (
  code, name, description, tagline,
  price_cents_month, currency,
  max_seats, max_active_opportunities, max_exports_month,
  features, is_active, sort_order
) values
(
  'trial',
  'Trial',
  'Essai gratuit 14 jours, toutes les fonctionnalités.',
  'Découvrez DBR sans engagement',
  0,
  'EUR',
  5,
  null,
  null,
  '["Full features","14 jours","Idéal pour évaluer le produit"]'::jsonb,
  true,
  10
),
(
  'team',
  'Team',
  'Pour les équipes commerciales en croissance.',
  'Core + export + audit basique',
  7900,
  'EUR',
  10,
  null,
  100,
  '["Core powermap","Export","Audit basique"]'::jsonb,
  true,
  20
),
(
  'business',
  'Business',
  'Pour les organisations qui industrialisent le power mapping.',
  'Templates pipeline, API keys, SSO prep',
  12900,
  'EUR',
  50,
  null,
  null,
  '["Tout Team inclus","Templates pipeline","SSO prep","API keys"]'::jsonb,
  true,
  30
),
(
  'enterprise',
  'Enterprise',
  'Sur devis — SAML, DPA, SLA, support dédié.',
  'Sur mesure',
  null,
  'EUR',
  null,
  null,
  null,
  '["SAML / SCIM","DPA signé","SLA","Support dédié"]'::jsonb,
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

-- Assigner Trial aux orgs sans formule
update public.organizations o
set
  commercial_plan_id = p.id,
  seat_quantity = coalesce(o.seat_quantity, p.max_seats),
  subscription_status = case
    when o.subscription_status = 'none' then 'trialing'::public.subscription_status
    else o.subscription_status
  end,
  trial_ends_at = coalesce(o.trial_ends_at, now() + interval '14 days')
from public.commercial_plans p
where p.code = 'trial'
  and o.commercial_plan_id is null;
