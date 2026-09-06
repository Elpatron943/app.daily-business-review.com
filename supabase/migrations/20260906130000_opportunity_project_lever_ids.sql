-- Leviers projet cochés sur une opportunité (« Pourquoi un projet ? »).
alter table public.opportunities
  add column if not exists project_lever_ids text[] not null default '{}';
