-- Phase eleven, Stage B — a fix to screener_publish (migration 0027).
-- Written to be run by hand in the Supabase SQL editor, same as every
-- migration before this one.
--
-- NO TABLE CHANGES: this only replaces the function 0027 created, with the
-- same name, inputs and behaviour. Safe to paste twice.
--
-- Why: Supabase refuses a DELETE with no WHERE clause on requests that come
-- through its data API (the safeupdate setting), including inside a function
-- the API calls. The first real publish failed with "DELETE requires a WHERE
-- clause" (6 November 2026), and, being one transaction, published nothing:
-- the screener kept its last complete set, as designed. "where true" names
-- every row explicitly, which is what safeupdate asks for.

create or replace function public.screener_publish(min_rows integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  staged integer;
begin
  select count(*) into staged from public.screener_metrics_next;
  if staged < greatest(min_rows, 1) then
    raise exception 'screener_publish: % rows staged, at least % needed; nothing published', staged, greatest(min_rows, 1);
  end if;
  delete from public.screener_metrics where true;
  insert into public.screener_metrics select * from public.screener_metrics_next;
  delete from public.screener_metrics_next where true;
  return staged;
end;
$$;

revoke all on function public.screener_publish(integer) from public;
revoke all on function public.screener_publish(integer) from anon, authenticated;
grant execute on function public.screener_publish(integer) to service_role;
