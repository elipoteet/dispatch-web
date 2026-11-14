-- Phase eleven — the screener. See docs/phase-eleven/phase-eleven.md.
-- Written to be run by hand in the Supabase SQL editor, same as every migration
-- before this one. Written in Stage A and pasted by Eli on 5 November 2026
-- (all four tables and every screener_metrics column checked with the public
-- key the same day). Any change Stage B needs goes in a new migration.
--
-- NEW OBJECTS ONLY. Nothing here alters, drops, or touches an existing table.
-- Everything is `if not exists`, so the file can be pasted again safely.

-- ============================================================
-- screener_metrics — one row per company the screener lists.
--
-- Rebuilt by the screener job from the SEC's frames (lib/sec/frames.ts,
-- lib/screener/*), read by /screener. A company is here when it has a listed
-- ticker in the SEC's ticker file and an annual report for a year that ended
-- within the last 18 months.
--
-- Wide, not tall like sec_financials, because the page filters and sorts on
-- these columns directly in the query, never by sending every row to the
-- browser. Measures are fractions (0.25 is 25%), dollar figures are numeric
-- dollars. A null is n/a, and na_reasons says why, by measure:
--   not-applicable  doesn't describe the business (gross margin at a bank)
--   missing         an input wasn't filed
--   base            a starting value or denominator is zero or below
--   split           the two years may be on different share bases
--   history         not enough consecutive years
--   inconsistent    the filing's own figures disagree by a units factor
-- A null is never a zero, and the page shows it as n/a.
-- ============================================================
create table if not exists public.screener_metrics (
  cik                  text primary key,
  ticker               text not null,
  -- Nasdaq, NYSE, CBOE, TXSE, OTC, or null, from the SEC's ticker file.
  exchange             text,
  name                 text not null,
  -- One of eleven plain sectors or "Other", from the SIC code
  -- (lib/screener/sectors.ts). Null when the SEC has no SIC for the company.
  sector               text,
  sic                  text,
  -- operating | financial | reit (lib/sec/concepts.ts, filerKindFromSic).
  filer_kind           text not null default 'operating',
  -- Two-letter U.S. state or territory, 'Outside the U.S.', or null when the
  -- SEC has no business address. Never guessed.
  state                text,
  -- The latest annual period's actual dates, from the filing. The screener
  -- states the period ("year ended 25 January 2026") rather than a fiscal-year
  -- label, which the frames don't carry.
  period_start         date,
  period_end           date not null,
  -- "MMDD" as the SEC's submissions file gives it.
  fiscal_year_end      text,

  revenue              numeric,
  net_income           numeric,
  free_cash_flow       numeric,
  net_cash             numeric,

  revenue_growth_1y    double precision,
  revenue_growth_3y    double precision,
  revenue_growth_5y    double precision,
  revenue_growth_10y   double precision,
  revenue_growth_years integer,
  gross_margin         double precision,
  operating_margin     double precision,
  net_margin           double precision,
  fcf_margin           double precision,
  share_change_1y      double precision,
  roe                  double precision,
  roa                  double precision,
  net_income_growth_1y double precision,
  eps_growth_1y        double precision,
  rnd_to_revenue       double precision,
  capex_to_revenue     double precision,
  sga_to_revenue       double precision,
  pays_dividend        boolean,
  dividends_to_fcf     double precision,
  buybacks_to_fcf      double precision,
  debt_to_equity       double precision,
  current_ratio        double precision,
  interest_coverage    double precision,

  na_reasons           jsonb not null default '{}'::jsonb,
  -- The XBRL tag and filing behind each input, so a surprising figure can be
  -- traced without downloading anything: {"revenue": ["Revenues", "0001045810-26-000021"], ...}
  sources              jsonb not null default '{}'::jsonb,
  updated_at           timestamptz not null default now()
);

-- About 5,400 rows: every filter is a fast scan without an index. The default
-- sort (revenue, largest first) and the two list filters get one each.
create index if not exists screener_metrics_revenue_idx on public.screener_metrics (revenue desc nulls last);
create index if not exists screener_metrics_sector_idx on public.screener_metrics (sector);
create index if not exists screener_metrics_state_idx on public.screener_metrics (state);

-- ============================================================
-- screener_filers — each company's SIC code and headquarters, cached.
--
-- From the company's submissions file, about 75KB each. Fetching all of them
-- takes about thirteen minutes at the SEC's polite rate, so it's done once and
-- then only for companies new to the screener, or whose copy is old.
-- ============================================================
create table if not exists public.screener_filers (
  cik             text primary key,
  name            text,
  sic             text,
  sic_description text,
  state           text,
  fiscal_year_end text,
  entity_type     text,
  fetched_at      timestamptz not null default now()
);

-- ============================================================
-- screener_frames — one row per frames file the job asked for, last time.
-- ============================================================
create table if not exists public.screener_frames (
  -- "{tag}/{unit}/{period}", e.g. "NetIncomeLoss/USD/CY2025".
  frame       text primary key,
  fetched_at  timestamptz not null default now(),
  -- ok | not-filed (the SEC has no such frame) | error
  status      text not null,
  companies   integer,
  bytes       integer,
  error       text
);

-- ============================================================
-- screener_runs — the job's log: what each run did, how long it took, and
-- anything it skipped and why.
-- ============================================================
create table if not exists public.screener_runs (
  id                 bigint generated always as identity primary key,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  -- full | nightly | profiles
  mode               text not null,
  files_fetched      integer,
  files_not_filed    integer,
  bytes              bigint,
  profiles_fetched   integer,
  companies_written  integer,
  -- {"no-ticker": 595, "stale": 187, ...}
  companies_skipped  jsonb not null default '{}'::jsonb,
  seconds            double precision,
  error              text
);

-- ============================================================
-- Row-level security.
--
-- screener_metrics is public reference data, read by the page with the
-- public key, so reading is open to everyone. The other three are the job's
-- own bookkeeping and have no policy at all, so only the service-role key
-- (which bypasses RLS) can read or write them.
--
-- No table has a write policy: only the server-side job writes, with the
-- service-role key, the same shape as sec_company and sec_financials (0021).
-- No policy reads any table, so the recursion trap fixed in 0012 can't apply.
-- ============================================================
alter table public.screener_metrics enable row level security;
alter table public.screener_filers enable row level security;
alter table public.screener_frames enable row level security;
alter table public.screener_runs enable row level security;

drop policy if exists "screener_metrics is public" on public.screener_metrics;
create policy "screener_metrics is public"
  on public.screener_metrics for select
  using (true);
