-- Qualification projet : problème à résoudre (« Pourquoi »).
alter table public.opportunities
  add column if not exists project_why jsonb not null default '{}'::jsonb;
