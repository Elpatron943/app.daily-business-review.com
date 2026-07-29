-- Email et téléphone sur les contacts (UI DBR + mapping CRM).

alter table public.contacts
  add column if not exists email text,
  add column if not exists phone text;
