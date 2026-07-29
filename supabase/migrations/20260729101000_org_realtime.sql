-- Realtime : changements optional_modules visibles immédiatement dans l’app client
do $$
begin
  alter publication supabase_realtime add table public.organizations;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
