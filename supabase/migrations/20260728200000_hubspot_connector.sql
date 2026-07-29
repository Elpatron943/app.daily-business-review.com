-- Connecteur HubSpot (OAuth par org + IDs externes + sync dirty/cursors).

-- Helpers (au cas où les migrations domaine / profiles n’ont pas été appliquées).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

-- ---------------------------------------------------------------------------
-- Connexion OAuth (1 / organisation)
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.hubspot_connection_status as enum (
    'connected',
    'error',
    'disconnected'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.hubspot_connections (
  organization_id uuid primary key
    references public.organizations (id) on delete cascade,
  portal_id text,
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status public.hubspot_connection_status not null default 'disconnected',
  last_pull_at timestamptz,
  last_push_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists hubspot_connections_set_updated_at
  on public.hubspot_connections;
create trigger hubspot_connections_set_updated_at
  before update on public.hubspot_connections
  for each row execute function public.set_updated_at();

alter table public.hubspot_connections enable row level security;

-- Lecture statut (sans besoin des tokens côté client — les colonnes enc
-- ne doivent pas être sélectionnées depuis le front ; policies admin org).
drop policy if exists "hubspot_connections_select_admin" on public.hubspot_connections;
create policy "hubspot_connections_select_admin"
  on public.hubspot_connections for select
  to authenticated
  using (
    public.is_admin()
    and organization_id = public.my_organization_id()
  );

-- Pas d’insert/update/delete client : service role uniquement pour tokens.

-- ---------------------------------------------------------------------------
-- IDs externes + dirty sur le domaine
-- Prérequis : migration 20260727220000_dbr_domain.sql (accounts/contacts/opps).
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.accounts') is null
     or to_regclass('public.contacts') is null
     or to_regclass('public.opportunities') is null then
    raise exception
      'Tables métier absentes (accounts/contacts/opportunities). Exécute d''abord supabase/migrations/20260727220000_dbr_domain.sql, puis relance cette migration HubSpot.';
  end if;
end $$;

alter table public.accounts
  add column if not exists hubspot_company_id text,
  add column if not exists hubspot_synced_at timestamptz,
  add column if not exists hubspot_dirty boolean not null default false;

alter table public.contacts
  add column if not exists hubspot_contact_id text,
  add column if not exists hubspot_synced_at timestamptz,
  add column if not exists hubspot_dirty boolean not null default false;

alter table public.opportunities
  add column if not exists hubspot_deal_id text,
  add column if not exists hubspot_synced_at timestamptz,
  add column if not exists hubspot_dirty boolean not null default false;

create unique index if not exists accounts_org_hubspot_company_uidx
  on public.accounts (organization_id, hubspot_company_id)
  where hubspot_company_id is not null;

create unique index if not exists contacts_org_hubspot_contact_uidx
  on public.contacts (organization_id, hubspot_contact_id)
  where hubspot_contact_id is not null;

create unique index if not exists opportunities_org_hubspot_deal_uidx
  on public.opportunities (organization_id, hubspot_deal_id)
  where hubspot_deal_id is not null;

create index if not exists accounts_org_hubspot_dirty_idx
  on public.accounts (organization_id)
  where hubspot_dirty = true;

create index if not exists contacts_org_hubspot_dirty_idx
  on public.contacts (organization_id)
  where hubspot_dirty = true;

create index if not exists opportunities_org_hubspot_dirty_idx
  on public.opportunities (organization_id)
  where hubspot_dirty = true;

-- ---------------------------------------------------------------------------
-- Curseurs pull + idempotence webhooks
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.hubspot_sync_object as enum (
    'companies',
    'contacts',
    'deals'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.hubspot_sync_cursors (
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  object_type public.hubspot_sync_object not null,
  cursor text,
  updated_after timestamptz,
  updated_at timestamptz not null default now(),
  primary key (organization_id, object_type)
);

alter table public.hubspot_sync_cursors enable row level security;

drop policy if exists "hubspot_sync_cursors_select_admin" on public.hubspot_sync_cursors;
create policy "hubspot_sync_cursors_select_admin"
  on public.hubspot_sync_cursors for select
  to authenticated
  using (
    public.is_admin()
    and organization_id = public.my_organization_id()
  );

create table if not exists public.hubspot_webhook_events (
  event_id text primary key,
  organization_id uuid references public.organizations (id) on delete set null,
  portal_id text,
  payload jsonb,
  processed_at timestamptz not null default now()
);

alter table public.hubspot_webhook_events enable row level security;
-- Aucune policy client : service role only.
