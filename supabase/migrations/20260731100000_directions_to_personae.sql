-- Personae remplacent Directions (catalogue org + rattachements).
-- Colonnes SQL renommées ; les mappers TS lisent encore direction_* en fallback.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contacts' and column_name = 'direction_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contacts' and column_name = 'persona_id'
  ) then
    alter table public.contacts rename column direction_id to persona_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'opportunities' and column_name = 'direction_ids'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'opportunities' and column_name = 'persona_ids'
  ) then
    alter table public.opportunities rename column direction_ids to persona_ids;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sold_solutions' and column_name = 'direction_ids'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sold_solutions' and column_name = 'persona_ids'
  ) then
    alter table public.sold_solutions rename column direction_ids to persona_ids;
  end if;
end $$;
