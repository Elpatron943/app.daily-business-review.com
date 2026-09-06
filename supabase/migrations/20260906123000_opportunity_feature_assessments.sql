-- Évaluations features sur opportunité (besoin client + importance).
alter table public.opportunities
  add column if not exists feature_assessments jsonb not null default '{}'::jsonb;
