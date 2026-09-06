-- Motivations personnelles sur un contact (avancer / reculer les projets).
alter table public.contacts
  add column if not exists motivation_ids text[] not null default '{}';
