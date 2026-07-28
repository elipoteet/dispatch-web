-- Monthly Leaderboard — Phase 3 (daily scoring job). Adds one table:
-- a shared, per-ticker-per-day price cache the snapshot cron reads/writes.
-- See dispatchleaderboardprompt.md and app/api/competition/snapshot/route.ts.
-- Written to be run by hand in the Supabase SQL editor, same as
-- 0001-0003 — this repo doesn't use the Supabase CLI's migration runner.
-- Not destructive: uses IF NOT EXISTS throughout so it's safe to re-run.

-- One row per ticker per trading day, shared across every entrant holding
-- that ticker that month — pricing a ticker once per day regardless of how
-- many users hold it. Also makes the cron resumable within a single day:
-- if it's invoked twice (a manual retry after a partial failure), already-
-- priced tickers are skipped instead of re-spending a Finnhub call on them.
-- RLS is enabled with zero policies — same "no legitimate client access
-- path" reasoning as ticker_snapshot (0002_alerts.sql): only the cron
-- job's service-role client ever reads or writes this table.
create table if not exists public.competition_price_cache (
  ticker text not null,
  snapshot_date date not null,
  price numeric,
  fetched_at timestamptz not null default now(),
  primary key (ticker, snapshot_date)
);

create index if not exists competition_price_cache_date_idx
  on public.competition_price_cache (snapshot_date);

alter table public.competition_price_cache enable row level security;
