-- Phase nine, after the 2 November review — one row per company with insider
-- filings, for the daily refresh. See lib/sec/insiders.ts, refreshInsiders.
--
-- Written to be run by hand in the Supabase SQL editor, same as every
-- migration before this one.
--
-- NEW OBJECTS ONLY: one view over insider_filings. Nothing here alters,
-- drops, or touches an existing table. Safe to paste twice (`create or
-- replace`).
--
-- Why: the daily cron refreshes the companies whose insider filings were read
-- longest ago first. Working that out from insider_filings itself means
-- reading every row, and the database API returns at most 1,000 rows a
-- request, so past about ten busy companies the stalest ones fell out of
-- view. This view does the grouping in the database: one row per company.
-- Until it's pasted, the cron reads insider_filings a page at a time instead,
-- which is right but slower.
--
-- security_invoker makes the view obey insider_filings' own row-level
-- security (public read), rather than its creator's rights.

create or replace view public.insider_companies
  with (security_invoker = true) as
  select cik, max(read_at) as last_read, count(*) as filings
  from public.insider_filings
  group by cik;

grant select on public.insider_companies to anon, authenticated;
