-- Connexions CRM multi-provider (HubSpot, Salesforce, …) — 1 ligne / org / provider.
-- Les secrets OAuth plateforme restent en env Netlify ; ici = tokens du client.

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

do $$ begin
  create type public.crm_provider as enum ('hubspot', 'salesforce');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.crm_connection_status as enum (
    'connected',
    'error',
    'disconnected'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.crm_connections (
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  provider public.crm_provider not null,
  external_portal_id text,
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status public.crm_connection_status not null default 'disconnected',
  last_pull_at timestamptz,
  last_push_at timestamptz,
  last_error text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, provider)
);

drop trigger if exists crm_connections_set_updated_at on public.crm_connections;
create trigger crm_connections_set_updated_at
  before update on public.crm_connections
  for each row execute function public.set_updated_at();

alter table public.crm_connections enable row level security;

drop policy if exists "crm_connections_select_admin" on public.crm_connections;
create policy "crm_connections_select_admin"
  on public.crm_connections for select
  to authenticated
  using (
    public.is_admin()
    and organization_id = public.my_organization_id()
  );

-- Migration depuis hubspot_connections si la table existe.
do $$
begin
  if to_regclass('public.hubspot_connections') is not null then
    insert into public.crm_connections (
      organization_id,
      provider,
      external_portal_id,
      access_token_enc,
      refresh_token_enc,
      token_expires_at,
      scopes,
      status,
      last_pull_at,
      last_push_at,
      last_error,
      created_at,
      updated_at
    )
    select
      h.organization_id,
      'hubspot'::public.crm_provider,
      h.portal_id,
      h.access_token_enc,
      h.refresh_token_enc,
      h.token_expires_at,
      coalesce(h.scopes, '{}'),
      case h.status::text
        when 'connected' then 'connected'::public.crm_connection_status
        when 'error' then 'error'::public.crm_connection_status
        else 'disconnected'::public.crm_connection_status
      end,
      h.last_pull_at,
      h.last_push_at,
      h.last_error,
      h.created_at,
      h.updated_at
    from public.hubspot_connections h
    on conflict (organization_id, provider) do update set
      external_portal_id = excluded.external_portal_id,
      access_token_enc = excluded.access_token_enc,
      refresh_token_enc = excluded.refresh_token_enc,
      token_expires_at = excluded.token_expires_at,
      scopes = excluded.scopes,
      status = excluded.status,
      last_pull_at = excluded.last_pull_at,
      last_push_at = excluded.last_push_at,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at;

    drop policy if exists "hubspot_connections_select_admin"
      on public.hubspot_connections;
    drop trigger if exists hubspot_connections_set_updated_at
      on public.hubspot_connections;
    drop table public.hubspot_connections;
  end if;
end $$;

-- Vue de compat lecture (status HubSpot sans tokens).
create or replace view public.hubspot_connection_status_v as
select
  organization_id,
  external_portal_id as portal_id,
  scopes,
  status,
  last_pull_at,
  last_push_at,
  last_error,
  updated_at
from public.crm_connections
where provider = 'hubspot';
