-- Monthly Leaderboard — Phase 1 (schema + RLS).
-- See dispatchleaderboardprompt.md / claude/leaderboard-plan.md for the full
-- feature spec. Written to be run by hand in the Supabase SQL editor, same
-- as 0001/0002 — this repo doesn't use the Supabase CLI's migration runner.
-- Not destructive: uses IF NOT EXISTS / CREATE OR REPLACE throughout so it's
-- safe to re-run.
--
-- This is a SEPARATE system from the existing paper-trading tables
-- (paper_account / paper_position / paper_transaction / equity_snapshot) —
-- nothing here touches those. Every table below is new.

-- ============================================================
-- competition_profile — one row per user: handle, opt-in state.
-- ============================================================
create table if not exists public.competition_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text,
  -- Generated (not just validated in app code) so it can never drift from
  -- `handle`, and so the unique index below is the actual source of truth
  -- for case-insensitive uniqueness rather than an app-layer promise.
  handle_normalized text generated always as (lower(handle)) stored,
  opted_in boolean not null default false,
  last_handle_change_at timestamptz,
  created_at timestamptz not null default now(),
  -- 3-20 chars, letters/digits/underscore only — this alone rules out "@"
  -- and "." (neither is in the allowed class), so a handle can never be
  -- mistaken for an email. Null is allowed: a profile row can exist before
  -- a handle is chosen (opted_in stays false until both are set).
  constraint competition_profile_handle_format
    check (handle is null or handle ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint competition_profile_handle_reserved
    check (handle_normalized is null or handle_normalized not in
      ('admin', 'dispatch', 'moderator', 'support', 'official')),
  constraint competition_profile_opted_in_requires_handle
    check (not opted_in or handle is not null)
);

create unique index if not exists competition_profile_handle_normalized_idx
  on public.competition_profile (handle_normalized)
  where handle_normalized is not null;

alter table public.competition_profile enable row level security;

drop policy if exists "competition_profile_select_own" on public.competition_profile;
create policy "competition_profile_select_own"
  on public.competition_profile
  for select
  using (auth.uid() = user_id);

drop policy if exists "competition_profile_insert_own" on public.competition_profile;
create policy "competition_profile_insert_own"
  on public.competition_profile
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "competition_profile_update_own" on public.competition_profile;
create policy "competition_profile_update_own"
  on public.competition_profile
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
-- No public select policy on this table at all — a signed-out or
-- unrelated signed-in visitor has no path to read anyone else's row
-- directly. Public handle lookups go through the public_handles view
-- below instead, which projects only the handle column.

-- ============================================================
-- competition_account — one row per user per month. (user_id, month) IS
-- the natural key ("the month key" in the spec) — no surrogate id needed.
-- Always starts at exactly $10,000 so every entrant's return is
-- comparable; created lazily on that user's first competition trade of
-- the month, never reset/wiped by a job.
-- ============================================================
create table if not exists public.competition_account (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  starting_balance numeric not null default 10000,
  cash numeric not null default 10000,
  -- Set once, on the first trade of the month — used only to break ties
  -- in the ranking (earlier first trade wins a tie on return).
  first_trade_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, month),
  constraint competition_account_month_format check (month ~ '^\d{4}-\d{2}$')
);

alter table public.competition_account enable row level security;

drop policy if exists "competition_account_select_own" on public.competition_account;
create policy "competition_account_select_own"
  on public.competition_account
  for select
  using (auth.uid() = user_id);

drop policy if exists "competition_account_insert_own" on public.competition_account;
create policy "competition_account_insert_own"
  on public.competition_account
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "competition_account_update_own" on public.competition_account;
create policy "competition_account_update_own"
  on public.competition_account
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
-- No public select policy — holdings stay private while a month is live,
-- exactly like paper_account. The public board reads only from
-- competition_daily_standing (via the public_leaderboard view), never
-- from this table.

-- ============================================================
-- competition_position — one row per (user, month, ticker). Carries
-- user_id + month directly (not just a lookup through the account row)
-- so its RLS policy is a plain auth.uid() check, same as paper_position.
-- ============================================================
create table if not exists public.competition_position (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  ticker text not null,
  shares numeric not null,
  avg_cost numeric not null,
  primary key (user_id, month, ticker),
  foreign key (user_id, month) references public.competition_account (user_id, month) on delete cascade
);

alter table public.competition_position enable row level security;

drop policy if exists "competition_position_select_own" on public.competition_position;
create policy "competition_position_select_own"
  on public.competition_position
  for select
  using (auth.uid() = user_id);

drop policy if exists "competition_position_insert_own" on public.competition_position;
create policy "competition_position_insert_own"
  on public.competition_position
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "competition_position_update_own" on public.competition_position;
create policy "competition_position_update_own"
  on public.competition_position
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "competition_position_delete_own" on public.competition_position;
create policy "competition_position_delete_own"
  on public.competition_position
  for delete
  using (auth.uid() = user_id);
-- No public select policy — same reasoning as competition_account.

-- ============================================================
-- competition_trade — append-only log, one row per fill. Same
-- user_id + month denormalization as competition_position, for the
-- same reason (simple direct RLS, matching paper_transaction).
-- ============================================================
create table if not exists public.competition_trade (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  ticker text not null,
  side text not null check (side in ('buy', 'sell')),
  shares numeric not null,
  price numeric not null,
  executed_at timestamptz not null default now(),
  foreign key (user_id, month) references public.competition_account (user_id, month) on delete cascade
);

create index if not exists competition_trade_user_month_idx
  on public.competition_trade (user_id, month);

alter table public.competition_trade enable row level security;

drop policy if exists "competition_trade_select_own" on public.competition_trade;
create policy "competition_trade_select_own"
  on public.competition_trade
  for select
  using (auth.uid() = user_id);

drop policy if exists "competition_trade_insert_own" on public.competition_trade;
create policy "competition_trade_insert_own"
  on public.competition_trade
  for insert
  with check (auth.uid() = user_id);
-- No public select policy, and no update/delete policy at all — trades
-- are an append-only record once placed, same spirit as paper_transaction.

-- ============================================================
-- competition_daily_standing — one row per (month, user, day), written
-- once daily by the scoring cron job. This is what the public board
-- reads (via the public_leaderboard view) and what a user's own
-- eligibility/rank status is read from directly. Also doubles as that
-- user's own equity curve for the month, so no separate
-- competition-specific equity_snapshot table is needed.
-- ============================================================
create table if not exists public.competition_daily_standing (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  equity numeric not null,
  return_pct numeric not null,
  invested_ratio numeric not null,
  trade_count int not null default 0,
  eligible boolean not null default false,
  rank int,
  computed_at timestamptz not null default now(),
  unique (month, user_id, snapshot_date)
);

create index if not exists competition_daily_standing_board_idx
  on public.competition_daily_standing (month, snapshot_date, rank);

alter table public.competition_daily_standing enable row level security;

drop policy if exists "competition_daily_standing_select_own" on public.competition_daily_standing;
create policy "competition_daily_standing_select_own"
  on public.competition_daily_standing
  for select
  using (auth.uid() = user_id);
-- No insert/update/delete policy for anyone but the service-role client
-- (the daily cron job) — this table is a computed record, never written
-- directly by a user. No public select policy either: the public board
-- reads through public_leaderboard below, which never exposes user_id.

-- ============================================================
-- competition_month_status — single source of truth for whether a month
-- is open, being finalized, or closed, plus the recorded winner.
-- ============================================================
create table if not exists public.competition_month_status (
  month text primary key,
  status text not null default 'open' check (status in ('open', 'closing', 'closed')),
  finalized_winner_user_id uuid references auth.users(id),
  finalized_at timestamptz,
  constraint competition_month_status_month_format check (month ~ '^\d{4}-\d{2}$')
);

alter table public.competition_month_status enable row level security;
-- Zero policies, enabled anyway — same "no legitimate direct-client
-- access path" pattern as ticker_snapshot in 0002_alerts.sql. There's no
-- per-user "own row" concept for a table that isn't user-scoped, and
-- finalized_winner_user_id must never reach a client directly. Only the
-- service-role client (the cron job) reads/writes this table; the public
-- reads through public_month_status below.

-- ============================================================
-- Public views — the actual mechanism behind "select only the handle
-- column" and "the standings table, joined to handles." Nothing in this
-- repo has used a Postgres VIEW before this: a view's SELECT list is
-- what enforces which columns are exposed, which is how a raw
-- auth.users UUID can be used to JOIN internally without ever appearing
-- in what a client receives. These views work specifically because a
-- plain `create view` (no `security_invoker`) runs with the view-owner's
-- privileges, not the querying role's — so they can read straight
-- through tables that have zero public RLS policies. Each gets an
-- explicit grant rather than relying on default privileges.
-- ============================================================

-- Handle-only lookup (e.g. "is this handle taken") — no user_id, ever.
create or replace view public.public_handles as
  select handle
  from public.competition_profile
  where opted_in = true;

grant select on public.public_handles to anon, authenticated;

-- The public leaderboard's actual read path. user_id is used only to
-- join and filter — it is never in the select list, so it never reaches
-- a client regardless of who queries this view. Deliberately just
-- rank/handle/return_pct: "a handle, a rank, a return percentage and
-- nothing else that identifies a person."
create or replace view public.public_leaderboard as
  select
    ds.month,
    ds.snapshot_date,
    ds.rank,
    cp.handle,
    ds.return_pct
  from public.competition_daily_standing ds
  join public.competition_profile cp on cp.user_id = ds.user_id
  where ds.eligible = true and cp.opted_in = true;

grant select on public.public_leaderboard to anon, authenticated;

-- Month status for the archive's "final" badge, with the winner's
-- current handle (not a frozen snapshot — if they change their handle
-- later, this view reflects the new one automatically, everywhere,
-- including past months). If a winner later opts out, the month still
-- shows as closed but the handle is withheld rather than the whole row
-- disappearing.
create or replace view public.public_month_status as
  select
    ms.month,
    ms.status,
    case when cp.opted_in then cp.handle else null end as winner_handle,
    ms.finalized_at
  from public.competition_month_status ms
  left join public.competition_profile cp on cp.user_id = ms.finalized_winner_user_id;

grant select on public.public_month_status to anon, authenticated;
