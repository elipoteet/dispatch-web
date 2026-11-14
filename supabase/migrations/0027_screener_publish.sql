-- Phase eleven, Stage B — publish the screener's numbers all at once.
-- Written to be run by hand in the Supabase SQL editor, same as every
-- migration before this one.
--
-- NEW OBJECTS ONLY: one table and one function. Nothing here alters, drops,
-- or touches an existing table's structure. Safe to paste twice.
--
-- Why: the nightly job (lib/screener/job.ts) writes about 4,700 rows in
-- batches. Writing them straight into screener_metrics meant a run cut off
-- partway (Vercel stops a function at five minutes) would leave the screener
-- showing a mix of tonight's numbers and last night's. Now the job writes
-- every row into screener_metrics_next, which nothing reads, and only when all
-- of them are there calls screener_publish(), which swaps the whole set into
-- screener_metrics in a single transaction. Readers see the old set until the
-- moment it commits, then the new set; never a mixture. A run that stops
-- before publishing leaves the last complete set showing.

-- ============================================================
-- screener_metrics_next — tonight's rows, waiting to be published.
-- Same columns, defaults and key as screener_metrics. No policy, so only the
-- service-role key (the job) can read or write it.
-- ============================================================
create table if not exists public.screener_metrics_next (like public.screener_metrics including all);
alter table public.screener_metrics_next enable row level security;

-- ============================================================
-- screener_publish(min_rows) — swap the staged rows in, all or nothing.
--
-- Refuses (raises, publishing nothing) if fewer than min_rows are staged:
-- the job passes nine in ten of the rows currently published, so a run that
-- failed to stage most of its rows can never empty the screener. On success
-- the staging table is emptied and the number of rows published returned.
--
-- security definer so it can replace rows that row-level security protects;
-- only the service role may call it.
-- ============================================================
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
  delete from public.screener_metrics;
  insert into public.screener_metrics select * from public.screener_metrics_next;
  delete from public.screener_metrics_next;
  return staged;
end;
$$;

revoke all on function public.screener_publish(integer) from public;
revoke all on function public.screener_publish(integer) from anon, authenticated;
grant execute on function public.screener_publish(integer) to service_role;
