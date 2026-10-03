-- Mémoire des revues « directeur commercial digital »
-- opportunities PK = (organization_id, id) avec id text (pas uuid seul).

drop table if exists public.deal_reviews;

create table public.deal_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  opportunity_id text not null,
  created_by uuid references public.profiles (id) on delete set null,
  findings jsonb not null default '[]'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  decided_actions jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now(),
  constraint deal_reviews_opp_fk
    foreign key (organization_id, opportunity_id)
    references public.opportunities (organization_id, id)
    on delete cascade
);

create index if not exists deal_reviews_org_opp_created_idx
  on public.deal_reviews (organization_id, opportunity_id, created_at desc);

create index if not exists deal_reviews_org_user_day_idx
  on public.deal_reviews (organization_id, created_by, created_at desc);

alter table public.deal_reviews enable row level security;

drop policy if exists "deal_reviews_select_member" on public.deal_reviews;
create policy "deal_reviews_select_member"
  on public.deal_reviews for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "deal_reviews_insert_member" on public.deal_reviews;
create policy "deal_reviews_insert_member"
  on public.deal_reviews for insert
  with check (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
    and created_by = auth.uid()
  );

comment on table public.deal_reviews is
  'Revues directeur commercial digital — findings + réponses pour previous_answers.';
