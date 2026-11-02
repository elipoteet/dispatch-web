-- Phase nine, stage 6 — the Insiders tab. See docs/phase-nine.md, Stage 6.
--
-- PASTED 2 November 2026.
--
-- Written to be run by hand in the Supabase SQL editor, same as every
-- migration before this one.
--
-- NEW OBJECTS ONLY. Nothing here alters, drops, or touches an existing table.
-- Safe to paste twice: everything is `if not exists` / `drop policy if exists`.
--
-- Until this is pasted, the Insiders tab says insider trades aren't available
-- yet, and nothing else on the site changes.

-- ============================================================
-- insider_filings — one row per Form 4 read from the SEC.
--
-- A record that the filing has been read, so it is never downloaded twice:
-- a filed Form 4 doesn't change. status 'unreadable' records one whose XML
-- couldn't be found or parsed, for the same reason. A failed download (the SEC
-- busy) records nothing and is tried again next time.
--
-- cik is the company's (the issuer's), not the insider's.
-- ============================================================
create table if not exists public.insider_filings (
  accession  text primary key,
  cik        text not null,
  form       text not null,
  filed_at   date not null,
  status     text not null default 'read' check (status in ('read', 'unreadable')),
  read_at    timestamptz not null default now()
);

create index if not exists insider_filings_cik_idx
  on public.insider_filings (cik, filed_at desc);

-- ============================================================
-- insider_trades — one row per transaction line in a Form 4.
--
-- code is the SEC's transaction code, as filed: P an open-market or private
-- purchase, S a sale, A a grant or award, M an option exercise, F shares
-- withheld for tax, G a gift, and a handful of rarer ones. The page shows P
-- and S by default and the rest behind "show all".
--
-- on_plan is true when the trade was made under a preset trading plan (Rule
-- 10b5-1): the trade's own footnote says so, or the filing's 10b5-1 checkbox
-- (on Form 4 since April 2023) is ticked and no trade in it is footnoted.
--
-- price can be null (grants and gifts have none); shares and price are as
-- filed, in the shares of their own date.
-- ============================================================
create table if not exists public.insider_trades (
  accession          text not null references public.insider_filings (accession) on delete cascade,
  line               integer not null,
  cik                text not null,
  filed_at           date not null,
  form               text not null,
  owner_name         text not null,
  owner_cik          text,
  owner_role         text,
  security           text,
  is_derivative      boolean not null default false,
  transaction_date   date,
  code               text not null,
  acquired_disposed  text,
  shares             numeric,
  price              numeric,
  shares_after       numeric,
  ownership          text,
  on_plan            boolean not null default false,
  primary key (accession, line)
);

create index if not exists insider_trades_cik_idx
  on public.insider_trades (cik, transaction_date desc);

-- Public read, service-role write, the same shape as sec_company and
-- sec_financials in 0021. No insert/update policy: only the server writes,
-- with the service-role key, which bypasses row-level security. Neither policy
-- queries its own table, so neither can recurse (gotcha 5).
alter table public.insider_filings enable row level security;
alter table public.insider_trades enable row level security;

drop policy if exists "insider_filings are public" on public.insider_filings;
create policy "insider_filings are public"
  on public.insider_filings
  for select
  using (true);

drop policy if exists "insider_trades are public" on public.insider_trades;
create policy "insider_trades are public"
  on public.insider_trades
  for select
  using (true);
