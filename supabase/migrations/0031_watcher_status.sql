-- The daily watcher (25 November 2026): five numbers about the site's jobs,
-- readable with the public key, so the watcher needs no secret key at all.
-- Written to be run by hand in the Supabase SQL editor, same as every
-- migration before this one.
--
-- WHY
--   The watcher (.github/workflows/watcher.yml) checks once a day that the
--   screener job and the alerts job ran. It used to read their tables with
--   the service-role key, which can read and write everything. Supabase has
--   no read-only key, so instead this one function answers the watcher's
--   questions and nothing else, and the public key is allowed to call it.
--
-- WHAT IT EXPOSES (to anyone with the public key, which is in every page the
-- site serves)
--   screener_run: the latest screener run's start and finish times, its mode
--     (full or nightly), whether it failed (yes or no, not the error text),
--     and how many companies it published.
--   screener_updated_at: when the screener's table was last written.
--   screener_medians: how many rows the screener's medians table has.
--   watched_tickers: how many different tickers are on watchlists.
--   alerts_checked_at: when the alerts job last checked a ticker.
--   No tickers, no users, no email addresses, no error text, no row from any
--   table.
--
-- WHAT IT DOESN'T CHANGE
--   No table, policy or grant. The public key can read and write exactly what
--   it could before; it can also call this one function. The function is
--   declared stable, and Postgres refuses to run a stable function that
--   inserts, updates or deletes ("INSERT is not allowed in a non-volatile
--   function"), so even a later edit that added a write would fail rather
--   than write.
--
-- ROLLBACK
--   drop function if exists public.watcher_status();
--
-- Safe to paste twice ("or replace").

create or replace function public.watcher_status()
returns jsonb
language sql
stable
-- Runs with the owner's rights, so it can count rows the public key can't
-- see. That's why it returns only the numbers above, and why every name in
-- it is written in full with an empty search path.
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'screener_run', (
      select jsonb_build_object(
        'started_at', r.started_at,
        'finished_at', r.finished_at,
        'mode', r.mode,
        'failed', r.error is not null,
        'published', case
          when jsonb_typeof(r.companies_skipped -> 'published') = 'number'
          then (r.companies_skipped ->> 'published')::integer
        end
      )
      from public.screener_runs r
      order by r.started_at desc
      limit 1
    ),
    'screener_updated_at', (select max(m.updated_at) from public.screener_metrics m),
    'screener_medians', (select count(*) from public.screener_medians),
    'watched_tickers', (select count(distinct w.ticker) from public.watchlist w),
    'alerts_checked_at', (select max(s.checked_at) from public.ticker_snapshot s)
  );
$$;

revoke all on function public.watcher_status() from public;
grant execute on function public.watcher_status() to anon, authenticated, service_role;
