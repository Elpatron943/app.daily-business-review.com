-- Onboarding chatbot : réservé au 1er admin tant que non complété / ignoré.
alter table public.organizations
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_completed_by uuid references public.profiles (id) on delete set null;

comment on column public.organizations.onboarding_completed_at is
  'Null = chatbot démarrage encore à présenter au premier admin.';

-- Orgs déjà en prod : ne pas forcer le chatbot rétroactivement.
update public.organizations
set onboarding_completed_at = coalesce(created_at, now())
where onboarding_completed_at is null;
