-- Modules optionnels par organisation (flags activables depuis la console plateforme)

alter table public.organizations
  add column if not exists optional_modules jsonb not null default '{}'::jsonb;

comment on column public.organizations.optional_modules is
  'Flags modules optionnels : { "ai_phone_script": true, "ai_email_script": true }';
