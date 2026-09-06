-- Problèmes à résoudre cochés sur une opportunité (« Pourquoi »).
alter table public.opportunities
  add column if not exists project_problem_ids text[] not null default '{}';
