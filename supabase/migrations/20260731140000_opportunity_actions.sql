-- Actions rattachées uniquement à l’opportunité (plus au account plan).

create table if not exists public.opportunity_actions (
  id text not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  opportunity_id text not null,
  title text not null,
  due_date date,
  owner text,
  status public.plan_status not null default 'Todo',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint opportunity_actions_opp_fk
    foreign key (organization_id, opportunity_id)
    references public.opportunities (organization_id, id)
    on delete cascade
);

create index if not exists opportunity_actions_opp_idx
  on public.opportunity_actions (organization_id, opportunity_id);
create index if not exists opportunity_actions_due_idx
  on public.opportunity_actions (organization_id, due_date);

drop trigger if exists opportunity_actions_set_updated_at on public.opportunity_actions;
create trigger opportunity_actions_set_updated_at
  before update on public.opportunity_actions
  for each row execute function public.set_updated_at();

alter table public.opportunity_actions enable row level security;

drop policy if exists "opportunity_actions_all" on public.opportunity_actions;
create policy "opportunity_actions_all"
  on public.opportunity_actions for all
  to authenticated
  using (public.same_organization(organization_id))
  with check (public.same_organization(organization_id));

-- Backfill depuis plan_actions (si la table legacy existe).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'plan_actions'
  ) then
    -- Compléter opportunity_id manquant via le plan.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'plan_actions' and column_name = 'opportunity_id'
    ) then
      update public.plan_actions pa
      set opportunity_id = sub.opportunity_id
      from (
        select distinct on (plan_id) plan_id, opportunity_id
        from public.account_plan_opportunities
        order by plan_id, opportunity_id
      ) sub
      where pa.plan_id = sub.plan_id
        and (pa.opportunity_id is null or pa.opportunity_id = '');
    end if;

    insert into public.opportunity_actions (
      id, organization_id, opportunity_id, title, due_date, owner, status, sort_order, created_at, updated_at
    )
    select
      pa.id,
      pa.organization_id,
      pa.opportunity_id,
      pa.title,
      pa.due_date,
      pa.owner,
      pa.status,
      pa.sort_order,
      pa.created_at,
      pa.updated_at
    from public.plan_actions pa
    where pa.opportunity_id is not null
      and pa.opportunity_id <> ''
      and exists (
        select 1 from public.opportunities o
        where o.organization_id = pa.organization_id and o.id = pa.opportunity_id
      )
    on conflict (organization_id, id) do nothing;

    drop table public.plan_actions cascade;
  end if;
end $$;
