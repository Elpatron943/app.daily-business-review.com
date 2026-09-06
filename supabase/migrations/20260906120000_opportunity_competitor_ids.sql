-- Concurrents retenus sur une opportunité (catalogue org).
alter table public.opportunities
  add column if not exists competitor_ids text[] not null default '{}';
