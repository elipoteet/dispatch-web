-- Phase nine, stage 1 — the SEC data layer. See docs/phase-nine.md.
-- Written to be run by hand in the Supabase SQL editor, same as every migration
-- before this one. This repo does not use the Supabase CLI's migration runner.
--
-- NEW OBJECTS ONLY. Nothing here alters, drops, or touches an existing table.
--
-- Everything below is written with `if not exists` so this file can be pasted
-- again safely. That matters because phase nine adds three more tables to THIS
-- SAME FILE in later stages (insider_trades in stage 6, filing_changes in stage
-- 7, screener_metrics in stage 8). Re-pasting the grown file will create only
-- what is missing and leave stage 1's data untouched.

-- ============================================================
-- sec_company — one row per company we have looked up.
--
-- The SEC's permanent id for a company is its CIK, not its ticker: tickers get
-- reused and reassigned, CIKs never do. So CIK is the key everywhere in this
-- phase and the ticker is just a label that happens to point at it today.
--
-- sic is the SEC's industry code, and it is load-bearing rather than
-- decorative: it is how the site knows that "gross margin" and "free cash flow"
-- are meaningless for a bank (JPMorgan files no cost-of-revenue and no capital
-- expenditure at all, and its operating cash flow is negative) and so should be
-- shown as a stated "not applicable" instead of a blank or, worse, a wrong
-- number.
-- ============================================================
create table if not exists public.sec_company (
  cik              text primary key,
  symbol           text not null,
  name             text not null,
  sic              text,
  sic_description  text,
  -- "MMDD", straight from the SEC submissions file: NVIDIA is "0131".
  fiscal_year_end  text,
  -- operating | financial | reit — derived from sic, stored so the reason a
  -- line is hidden travels with the data.
  filer_type       text not null default 'operating',
  -- Latest 10-K/10-Q accession we have already normalised, so a refresh can be
  -- skipped by comparing against the submissions file without downloading the
  -- several-megabyte facts file.
  latest_accession text,
  last_checked_at  timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists sec_company_symbol_idx on public.sec_company (symbol);

-- ============================================================
-- sec_financials — one row per company, period, and line item.
--
-- Tall rather than wide (a column per line item) on purpose: companies report
-- different line items, and new ones get added in later stages. A tall table
-- absorbs that without a migration each time.
--
-- The unique constraint is what makes refreshing safe — re-normalising a
-- company upserts over its own rows instead of duplicating ten years of history.
--
-- Two flags carry meaning the number alone cannot:
--   restated — a later filing changed a figure an earlier one reported. The UI
--              marks the cell rather than quietly showing a different number
--              than the reader would find in the original 10-K.
--   derived  — we calculated it, the company did not report it. True for free
--              cash flow (operating cash flow minus capital expenditure), for
--              every fourth quarter (a 10-K reports the full year, never a Q4,
--              so Q4 is the year minus the three filed quarters), and for
--              standalone quarters unwound from a 10-Q's year-to-date column.
--              Anything flagged here must be labelled as calculated wherever it
--              is shown. This column is an addition to the brief's column list,
--              which did not include it.
-- ============================================================
create table if not exists public.sec_financials (
  cik           text not null references public.sec_company (cik) on delete cascade,
  fiscal_year   integer not null,
  -- FY is the full year; Q1..Q4 are standalone quarters, never cumulative.
  fiscal_period text not null check (fiscal_period in ('FY', 'Q1', 'Q2', 'Q3', 'Q4')),
  line_item     text not null,
  period_end    date not null,
  -- numeric, not float: these are money, and a double would round $215.938B.
  value         numeric not null,
  unit          text not null default 'USD',
  -- The XBRL tag the number actually came from, so a surprising figure can be
  -- traced without re-downloading the facts file. Companies switch tags
  -- mid-history — NVIDIA moved from RevenueFromContractWithCustomerExcludingAssessedTax
  -- to Revenues after fiscal 2022 — so this is not always the same tag across
  -- a single row of a ten-year table.
  source_tag    text not null,
  accession     text,
  filed_at      date,
  restated      boolean not null default false,
  derived       boolean not null default false,
  updated_at    timestamptz not null default now(),
  constraint sec_financials_period_item_key unique (cik, fiscal_year, fiscal_period, line_item)
);

create index if not exists sec_financials_lookup_idx
  on public.sec_financials (cik, line_item, fiscal_year desc);

-- ============================================================
-- Row-level security.
--
-- Both tables are public reference data — the same numbers anyone can download
-- from the SEC — so reading is open to everyone, signed in or not.
--
-- Writing is deliberately left with NO policy at all. In Postgres that means no
-- ordinary client can write, while the service-role key bypasses RLS entirely,
-- which is exactly the split we want: only server-side jobs populate these.
-- This is the same shape as competition_price_cache (0004).
--
-- Note there is no policy here that selects from the table it protects. A policy
-- on sec_financials that queried sec_financials would recurse infinitely and
-- fail on a real click rather than at migration time — the bug fixed in 0012.
-- These policies read no tables at all, so that trap does not apply.
-- ============================================================
alter table public.sec_company enable row level security;
alter table public.sec_financials enable row level security;

drop policy if exists "sec_company is public" on public.sec_company;
create policy "sec_company is public"
  on public.sec_company for select
  using (true);

drop policy if exists "sec_financials is public" on public.sec_financials;
create policy "sec_financials is public"
  on public.sec_financials for select
  using (true);
