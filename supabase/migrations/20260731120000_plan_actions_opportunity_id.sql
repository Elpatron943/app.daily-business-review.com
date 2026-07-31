-- Rattachement optionnel d'une action de plan à une opportunité (déjà en local TS).
alter table public.plan_actions
  add column if not exists opportunity_id text;
