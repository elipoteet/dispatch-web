-- Subscriber Alerts, v1 — see dispatch-alerts-plan.md (decided 2026-07-27).
-- Written to be run by hand in the Supabase SQL editor, same as
-- 0001_subscriptions.sql — this repo doesn't use the Supabase CLI's
-- migration runner. Not destructive: uses IF NOT EXISTS throughout so it's
-- safe to re-run.

-- One row per ticker, globally shared across every Subscriber watching it —
-- NOT user-scoped, unlike every other table in this app. "Yesterday's"
-- state the nightly cron job compares today's freshly-computed state
-- against. RLS is enabled with zero policies: no select/insert/update
-- policy for anon or authenticated at all, so only the cron job's
-- service-role client (which bypasses RLS entirely) can ever read or write
-- it — same "no legitimate client access path" reasoning as
-- subscriptions' missing insert/update policy.
create table if not exists public.ticker_snapshot (
  ticker text primary key,
  rating text not null,
  rsi_state text,        -- 'overbought' | 'neutral' | 'oversold' | null
  ma_state text,         -- 'golden' | 'death' | 'none' | null
  checked_at timestamptz not null default now()
);

alter table public.ticker_snapshot enable row level security;

-- One row per detected change (a rating flip, an RSI state entered, or a
-- golden/death cross). Only the cron job's service-role client writes here.
create table if not exists public.alert_event (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  type text not null,       -- 'score_change' | 'rsi' | 'ma_cross'
  old_value text,
  new_value text not null,
  created_at timestamptz not null default now()
);

create index if not exists alert_event_ticker_created_idx on public.alert_event (ticker, created_at desc);

alter table public.alert_event enable row level security;

-- A signed-in user may read an event only for a ticker they actually watch,
-- AND only while they currently hold an active/trialing subscription. This
-- is the whole fan-out mechanism for v1 — no separate per-user notification
-- table, no "queue" step in the cron job. It also enforces the "alerts are
-- a paid Subscriber perk" boundary at the data layer itself, not just in
-- the UI, matching the rigor RLS already gets applied with everywhere else
-- in this app.
drop policy if exists "alert_event_select_watched_subscriber" on public.alert_event;
create policy "alert_event_select_watched_subscriber"
  on public.alert_event
  for select
  using (
    exists (
      select 1 from public.watchlist w
      where w.user_id = auth.uid() and w.ticker = alert_event.ticker
    )
    and exists (
      select 1 from public.subscriptions s
      where s.user_id = auth.uid() and s.status in ('active', 'trialing')
    )
  );
-- No insert/update/delete policy — only the cron job's service-role client
-- ever writes here.
