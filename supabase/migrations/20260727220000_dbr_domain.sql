-- DBR — migration domaine métier (comptes, contacts, opps, ventes, plans, config)
-- Compatible avec public.profiles déjà créé (schema.sql).
-- À appliquer : Supabase → SQL Editor, ou `supabase db push` / migrations.

-- ---------------------------------------------------------------------------
-- 0. Helpers communs
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Organisations (multi-users sur le même CRM)
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mon organisation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

alter table public.profiles
  add column if not exists organization_id uuid references public.organizations (id) on delete set null;

create index if not exists profiles_organization_id_idx
  on public.profiles (organization_id);

create or replace function public.my_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.same_organization(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org is not null and p_org = public.my_organization_id();
$$;

-- Si un profil admin n’a pas encore d’org → en créer une
create or replace function public.ensure_profile_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
begin
  if new.organization_id is not null then
    return new;
  end if;

  if new.role = 'admin' then
    insert into public.organizations (name)
    values (coalesce(nullif(trim(new.full_name), ''), split_part(new.email, '@', 1), 'Organisation'))
    returning id into org_id;
    new.organization_id := org_id;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_ensure_organization on public.profiles;
create trigger profiles_ensure_organization
  before insert or update of organization_id, role
  on public.profiles
  for each row execute function public.ensure_profile_organization();

-- Backfill : admins sans org
do $$
declare
  r record;
  org_id uuid;
begin
  for r in
    select id, email, full_name
    from public.profiles
    where role = 'admin' and organization_id is null
  loop
    insert into public.organizations (name)
    values (coalesce(nullif(trim(r.full_name), ''), split_part(r.email, '@', 1), 'Organisation'))
    returning id into org_id;
    update public.profiles set organization_id = org_id where id = r.id;
  end loop;
end $$;

alter table public.organizations enable row level security;

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member"
  on public.organizations for select
  to authenticated
  using (id = public.my_organization_id() or public.is_admin());

drop policy if exists "organizations_update_admin" on public.organizations;
create policy "organizations_update_admin"
  on public.organizations for update
  to authenticated
  using (public.is_admin() and id = public.my_organization_id())
  with check (public.is_admin() and id = public.my_organization_id());

drop policy if exists "organizations_insert_admin" on public.organizations;
create policy "organizations_insert_admin"
  on public.organizations for insert
  to authenticated
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Config org (catalogue OrgConfig — blob JSON)
-- ---------------------------------------------------------------------------

create table if not exists public.org_configs (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

drop trigger if exists org_configs_set_updated_at on public.org_configs;
create trigger org_configs_set_updated_at
  before update on public.org_configs
  for each row execute function public.set_updated_at();

alter table public.org_configs enable row level security;

drop policy if exists "org_configs_select" on public.org_configs;
create policy "org_configs_select"
  on public.org_configs for select
  to authenticated
  using (public.same_organization(organization_id));

drop policy if exists "org_configs_write_admin" on public.org_configs;
create policy "org_configs_write_admin"
  on public.org_configs for all
  to authenticated
  using (public.is_admin() and public.same_organization(organization_id))
  with check (public.is_admin() and public.same_organization(organization_id));

-- ---------------------------------------------------------------------------
-- 3. État UI carto (positions de nœuds hors comptes/contacts)
-- ---------------------------------------------------------------------------

create table if not exists public.domain_ui_state (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  layout_positions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists domain_ui_state_set_updated_at on public.domain_ui_state;
create trigger domain_ui_state_set_updated_at
  before update on public.domain_ui_state
  for each row execute function public.set_updated_at();

alter table public.domain_ui_state enable row level security;

drop policy if exists "domain_ui_state_all" on public.domain_ui_state;
create policy "domain_ui_state_all"
  on public.domain_ui_state for all
  to authenticated
  using (public.same_organization(organization_id))
  with check (public.same_organization(organization_id));

-- ---------------------------------------------------------------------------
-- 4. Accounts
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.account_type as enum ('Holding', 'Entreprise');
exception when duplicate_object then null;
end $$;

create table if not exists public.accounts (
  id text not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  type public.account_type not null,
  commercial_status text not null default 'Prospect',
  holding_id text,
  sector text,
  size text,
  x double precision not null default 0,
  y double precision not null default 0,
  active boolean not null default true,
  research_brief jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint accounts_holding_not_self check (holding_id is distinct from id)
);

create index if not exists accounts_org_active_idx
  on public.accounts (organization_id, active);
create index if not exists accounts_org_holding_idx
  on public.accounts (organization_id, holding_id);
create index if not exists accounts_org_status_idx
  on public.accounts (organization_id, commercial_status);

-- FK holding (même org)
do $$ begin
  alter table public.accounts
    add constraint accounts_holding_fk
    foreign key (organization_id, holding_id)
    references public.accounts (organization_id, id)
    on delete set null;
exception when duplicate_object then null;
end $$;

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

alter table public.accounts enable row level security;

drop policy if exists "accounts_all" on public.accounts;
create policy "accounts_all"
  on public.accounts for all
  to authenticated
  using (public.same_organization(organization_id))
  with check (public.same_organization(organization_id));

-- ---------------------------------------------------------------------------
-- 5. Contacts
-- ---------------------------------------------------------------------------

create table if not exists public.contacts (
  id text not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  account_id text not null,
  direction_id text not null default '',
  name text not null,
  title text not null default '',
  x double precision not null default 0,
  y double precision not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint contacts_account_fk
    foreign key (organization_id, account_id)
    references public.accounts (organization_id, id)
    on delete cascade
);

create index if not exists contacts_org_account_idx
  on public.contacts (organization_id, account_id);
create index if not exists contacts_org_active_idx
  on public.contacts (organization_id, active);

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

alter table public.contacts enable row level security;

drop policy if exists "contacts_all" on public.contacts;
create policy "contacts_all"
  on public.contacts for all
  to authenticated
  using (public.same_organization(organization_id))
  with check (public.same_organization(organization_id));

-- ---------------------------------------------------------------------------
-- 6. Relations entreprises / contacts
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.company_relation_type as enum (
    'PartnerOf',
    'CompetitorOf',
    'SameSectorAs',
    'SupplierOf',
    'CustomerOf',
    'InvestorIn'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.contact_relation_type as enum (
    'ReportsTo',
    'Influences',
    'AlliesWith',
    'Blocks',
    'FormerColleague',
    'Knows'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.company_relations (
  id text not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_id text not null,
  target_id text not null,
  relation public.company_relation_type not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint company_relations_not_self check (source_id <> target_id),
  constraint company_relations_source_fk
    foreign key (organization_id, source_id)
    references public.accounts (organization_id, id)
    on delete cascade,
  constraint company_relations_target_fk
    foreign key (organization_id, target_id)
    references public.accounts (organization_id, id)
    on delete cascade
);

create unique index if not exists company_relations_edge_uidx
  on public.company_relations (organization_id, source_id, target_id, relation);

alter table public.company_relations enable row level security;

drop policy if exists "company_relations_all" on public.company_relations;
create policy "company_relations_all"
  on public.company_relations for all
  to authenticated
  using (public.same_organization(organization_id))
  with check (public.same_organization(organization_id));

create table if not exists public.contact_relations (
  id text not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_id text not null,
  target_id text not null,
  relation public.contact_relation_type not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint contact_relations_not_self check (source_id <> target_id),
  constraint contact_relations_source_fk
    foreign key (organization_id, source_id)
    references public.contacts (organization_id, id)
    on delete cascade,
  constraint contact_relations_target_fk
    foreign key (organization_id, target_id)
    references public.contacts (organization_id, id)
    on delete cascade
);

create unique index if not exists contact_relations_edge_uidx
  on public.contact_relations (organization_id, source_id, target_id, relation);

-- Un seul ReportsTo par contact source (enfant → parent)
create unique index if not exists contact_relations_reports_to_uidx
  on public.contact_relations (organization_id, source_id)
  where relation = 'ReportsTo';

alter table public.contact_relations enable row level security;

drop policy if exists "contact_relations_all" on public.contact_relations;
create policy "contact_relations_all"
  on public.contact_relations for all
  to authenticated
  using (public.same_organization(organization_id))
  with check (public.same_organization(organization_id));

-- ---------------------------------------------------------------------------
-- 7. Opportunities
-- ---------------------------------------------------------------------------

create table if not exists public.opportunities (
  id text not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  amount numeric not null default 0,
  currency text not null default 'EUR',
  close_date date,
  primary_account_id text not null,
  phase text not null default 'Whitespace',
  kind text not null default 'prospect',
  solution_id text not null default '',
  module_ids text[] not null default '{}',
  direction_ids text[] not null default '{}',
  compelling_event_ids text[] not null default '{}',
  variables jsonb not null default '{}'::jsonb,
  business_outcomes jsonb not null default '{}'::jsonb,
  process_answers jsonb not null default '{}'::jsonb,
  mapping_checks jsonb not null default '{}'::jsonb,
  ai_recommendations jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint opportunities_account_fk
    foreign key (organization_id, primary_account_id)
    references public.accounts (organization_id, id)
    on delete cascade
);

create index if not exists opportunities_org_active_idx
  on public.opportunities (organization_id, active);
create index if not exists opportunities_org_account_idx
  on public.opportunities (organization_id, primary_account_id);
create index if not exists opportunities_org_phase_idx
  on public.opportunities (organization_id, phase);
create index if not exists opportunities_org_kind_idx
  on public.opportunities (organization_id, kind);
create index if not exists opportunities_org_close_idx
  on public.opportunities (organization_id, close_date);

drop trigger if exists opportunities_set_updated_at on public.opportunities;
create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

alter table public.opportunities enable row level security;

drop policy if exists "opportunities_all" on public.opportunities;
create policy "opportunities_all"
  on public.opportunities for all
  to authenticated
  using (public.same_organization(organization_id))
  with check (public.same_organization(organization_id));

-- Stakeholders (engagement contact × opp)
do $$ begin
  create type public.engagement_status as enum (
    'Unknown',
    'Identified',
    'Engaged',
    'Aligned',
    'Opposed'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.opportunity_stakeholders (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  opportunity_id text not null,
  contact_id text not null,
  role text not null default '',
  status public.engagement_status not null default 'Unknown',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, opportunity_id, contact_id),
  constraint opportunity_stakeholders_opp_fk
    foreign key (organization_id, opportunity_id)
    references public.opportunities (organization_id, id)
    on delete cascade,
  constraint opportunity_stakeholders_contact_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id)
    on delete cascade
);

create index if not exists opportunity_stakeholders_contact_idx
  on public.opportunity_stakeholders (organization_id, contact_id);

drop trigger if exists opportunity_stakeholders_set_updated_at on public.opportunity_stakeholders;
create trigger opportunity_stakeholders_set_updated_at
  before update on public.opportunity_stakeholders
  for each row execute function public.set_updated_at();

alter table public.opportunity_stakeholders enable row level security;

drop policy if exists "opportunity_stakeholders_all" on public.opportunity_stakeholders;
create policy "opportunity_stakeholders_all"
  on public.opportunity_stakeholders for all
  to authenticated
  using (public.same_organization(organization_id))
  with check (public.same_organization(organization_id));

-- ---------------------------------------------------------------------------
-- 8. Sold solutions (CA installé)
-- ---------------------------------------------------------------------------

create table if not exists public.sold_solutions (
  id text not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  solution_id text not null,
  account_id text not null,
  direction_ids text[] not null default '{}',
  module_ids text[] not null default '{}',
  currency text not null default 'EUR',
  billed_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint sold_solutions_account_fk
    foreign key (organization_id, account_id)
    references public.accounts (organization_id, id)
    on delete cascade
);

create index if not exists sold_solutions_org_account_idx
  on public.sold_solutions (organization_id, account_id);
create index if not exists sold_solutions_org_solution_idx
  on public.sold_solutions (organization_id, solution_id);

drop trigger if exists sold_solutions_set_updated_at on public.sold_solutions;
create trigger sold_solutions_set_updated_at
  before update on public.sold_solutions
  for each row execute function public.set_updated_at();

alter table public.sold_solutions enable row level security;

drop policy if exists "sold_solutions_all" on public.sold_solutions;
create policy "sold_solutions_all"
  on public.sold_solutions for all
  to authenticated
  using (public.same_organization(organization_id))
  with check (public.same_organization(organization_id));

-- ---------------------------------------------------------------------------
-- 9. Account plans
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.plan_status as enum ('Todo', 'Doing', 'Done');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.objective_status as enum (
    'NotStarted',
    'InProgress',
    'Achieved',
    'Cancelled',
    'Deferred'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.account_plans (
  id text not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  account_id text not null,
  start_date date not null,
  due_date date not null,
  status public.plan_status not null default 'Todo',
  owner text,
  vision text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint account_plans_account_fk
    foreign key (organization_id, account_id)
    references public.accounts (organization_id, id)
    on delete cascade
);

create index if not exists account_plans_org_account_idx
  on public.account_plans (organization_id, account_id);
create index if not exists account_plans_org_status_idx
  on public.account_plans (organization_id, status);

drop trigger if exists account_plans_set_updated_at on public.account_plans;
create trigger account_plans_set_updated_at
  before update on public.account_plans
  for each row execute function public.set_updated_at();

alter table public.account_plans enable row level security;

drop policy if exists "account_plans_all" on public.account_plans;
create policy "account_plans_all"
  on public.account_plans for all
  to authenticated
  using (public.same_organization(organization_id))
  with check (public.same_organization(organization_id));

create table if not exists public.account_plan_opportunities (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_id text not null,
  opportunity_id text not null,
  primary key (organization_id, plan_id, opportunity_id),
  constraint account_plan_opportunities_plan_fk
    foreign key (organization_id, plan_id)
    references public.account_plans (organization_id, id)
    on delete cascade,
  constraint account_plan_opportunities_opp_fk
    foreign key (organization_id, opportunity_id)
    references public.opportunities (organization_id, id)
    on delete cascade
);

-- Une opportunité active ∈ au plus un plan (par org)
create unique index if not exists account_plan_opportunities_opp_uidx
  on public.account_plan_opportunities (organization_id, opportunity_id);

alter table public.account_plan_opportunities enable row level security;

drop policy if exists "account_plan_opportunities_all" on public.account_plan_opportunities;
create policy "account_plan_opportunities_all"
  on public.account_plan_opportunities for all
  to authenticated
  using (public.same_organization(organization_id))
  with check (public.same_organization(organization_id));

create table if not exists public.plan_objectives (
  id text not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_id text not null,
  label text not null,
  status public.objective_status not null default 'NotStarted',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint plan_objectives_plan_fk
    foreign key (organization_id, plan_id)
    references public.account_plans (organization_id, id)
    on delete cascade
);

create index if not exists plan_objectives_plan_idx
  on public.plan_objectives (organization_id, plan_id);

drop trigger if exists plan_objectives_set_updated_at on public.plan_objectives;
create trigger plan_objectives_set_updated_at
  before update on public.plan_objectives
  for each row execute function public.set_updated_at();

alter table public.plan_objectives enable row level security;

drop policy if exists "plan_objectives_all" on public.plan_objectives;
create policy "plan_objectives_all"
  on public.plan_objectives for all
  to authenticated
  using (public.same_organization(organization_id))
  with check (public.same_organization(organization_id));

create table if not exists public.plan_actions (
  id text not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_id text not null,
  title text not null,
  due_date date,
  owner text,
  status public.plan_status not null default 'Todo',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint plan_actions_plan_fk
    foreign key (organization_id, plan_id)
    references public.account_plans (organization_id, id)
    on delete cascade
);

create index if not exists plan_actions_plan_idx
  on public.plan_actions (organization_id, plan_id);
create index if not exists plan_actions_due_idx
  on public.plan_actions (organization_id, due_date);

drop trigger if exists plan_actions_set_updated_at on public.plan_actions;
create trigger plan_actions_set_updated_at
  before update on public.plan_actions
  for each row execute function public.set_updated_at();

alter table public.plan_actions enable row level security;

drop policy if exists "plan_actions_all" on public.plan_actions;
create policy "plan_actions_all"
  on public.plan_actions for all
  to authenticated
  using (public.same_organization(organization_id))
  with check (public.same_organization(organization_id));

-- ---------------------------------------------------------------------------
-- 10. handle_new_user — rattache à une org si fournie en metadata
--     (création via console admin : raw_user_meta_data.organization_id)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count int;
  new_role public.app_role;
  meta_org uuid;
  org_id uuid;
begin
  select count(*) into admin_count from public.profiles where role = 'admin';

  if admin_count = 0 then
    new_role := 'admin';
  else
    new_role := coalesce(
      (new.raw_user_meta_data->>'role')::public.app_role,
      'user'
    );
  end if;

  begin
    meta_org := nullif(new.raw_user_meta_data->>'organization_id', '')::uuid;
  exception when others then
    meta_org := null;
  end;

  org_id := meta_org;

  if org_id is null and new_role = 'admin' and admin_count = 0 then
    insert into public.organizations (name)
    values (
      coalesce(
        nullif(trim(new.raw_user_meta_data->>'organization_name'), ''),
        nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
        split_part(coalesce(new.email, 'org'), '@', 1),
        'Organisation'
      )
    )
    returning id into org_id;
  end if;

  insert into public.profiles (id, email, full_name, role, organization_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new_role,
    org_id
  )
  on conflict (id) do nothing;

  if org_id is not null then
    insert into public.org_configs (organization_id, config)
    values (org_id, '{}'::jsonb)
    on conflict (organization_id) do nothing;

    insert into public.domain_ui_state (organization_id, layout_positions)
    values (org_id, '{}'::jsonb)
    on conflict (organization_id) do nothing;
  end if;

  return new;
end;
$$;
