-- This helper is used internally by a database event trigger. It does not need
-- to be callable through Supabase's public Data API. New/local databases may
-- not have the project-specific helper, so keep the migration portable.
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
 end if;
end $$;
