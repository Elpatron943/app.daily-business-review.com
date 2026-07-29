-- Owners DBR (profiles) + prénom/nom contact pour mapping CRM inbound.

alter table public.accounts
  add column if not exists owner_profile_id uuid
    references public.profiles (id) on delete set null;

alter table public.contacts
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists owner_profile_id uuid
    references public.profiles (id) on delete set null;

alter table public.opportunities
  add column if not exists owner_profile_id uuid
    references public.profiles (id) on delete set null;

create index if not exists accounts_org_owner_idx
  on public.accounts (organization_id, owner_profile_id);

create index if not exists contacts_org_owner_idx
  on public.contacts (organization_id, owner_profile_id);

create index if not exists opportunities_org_owner_idx
  on public.opportunities (organization_id, owner_profile_id);

-- Remplit first_name / last_name depuis name si vides.
update public.contacts
set
  first_name = coalesce(
    nullif(trim(first_name), ''),
    nullif(split_part(trim(name), ' ', 1), '')
  ),
  last_name = coalesce(
    nullif(trim(last_name), ''),
    nullif(
      trim(substring(trim(name) from length(split_part(trim(name), ' ', 1)) + 1)),
      ''
    )
  )
where (first_name is null or trim(first_name) = '')
  and name is not null
  and trim(name) <> '';
