-- Narratif « Pourquoi maintenant » (objectifs, délai, coût d’inaction).
alter table public.opportunities
  add column if not exists why_now jsonb not null default '{}'::jsonb;
