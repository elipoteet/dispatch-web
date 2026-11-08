-- Phase eleven, after Stage C (7 November 2026): four new measures and the
-- median of every measure. Written to be run by hand in the Supabase SQL
-- editor, same as every migration before this one.
--
-- WHAT THIS CHANGES
--   1. Adds four columns to the screener's own two tables, screener_metrics
--      and screener_metrics_next (migrations 0026 and 0027). Nothing outside
--      the screener reads these tables, and the live site doesn't show the
--      screener yet. Every new column is nullable, so existing rows are
--      untouched (null until the next run fills them).
--   2. Adds a `medians` column to screener_runs, the job's own log.
--   3. Creates screener_medians (public read) and screener_medians_next
--      (staging, no policy): the median of each measure across the companies
--      the screener shows, for "Half of companies: above 38%".
--   4. Replaces screener_publish (0027, 0028) so it swaps the medians in the
--      same transaction as the rows: the medians always describe the set on
--      show.
-- Safe to paste twice: every statement is "if not exists" or "or replace".

-- ============================================================
-- 1. The four new measures (lib/screener/metrics.ts)
--    roic                        return on invested capital, a fraction
--    operating_margin_change_3y  operating margin now less three fiscal
--                                years earlier, in fraction points (0.05 is
--                                5 points)
--    growth_plus_fcf_margin      1-year revenue growth plus free cash flow
--                                margin ("Rule of 40"), a fraction
--    cash_conversion             operating cash flow over net income, a ratio
-- ============================================================
alter table public.screener_metrics add column if not exists roic double precision;
alter table public.screener_metrics add column if not exists operating_margin_change_3y double precision;
alter table public.screener_metrics add column if not exists growth_plus_fcf_margin double precision;
alter table public.screener_metrics add column if not exists cash_conversion double precision;

-- Same columns, same order, on the staging table.
alter table public.screener_metrics_next add column if not exists roic double precision;
alter table public.screener_metrics_next add column if not exists operating_margin_change_3y double precision;
alter table public.screener_metrics_next add column if not exists growth_plus_fcf_margin double precision;
alter table public.screener_metrics_next add column if not exists cash_conversion double precision;

-- ============================================================
-- 2. The run log keeps each run's medians: {"roic": {"median": 0.11, "companies": 2650}, ...}
-- ============================================================
alter table public.screener_runs add column if not exists medians jsonb;

-- ============================================================
-- 3. Medians: one row per measure. pays_dividend's "median" is the share of
--    companies that pay one.
-- ============================================================
create table if not exists public.screener_medians (
  metric      text primary key,
  median      double precision not null,
  -- How many companies had a value (n/a left out).
  companies   integer not null,
  run_id      bigint,
  computed_at timestamptz not null default now()
);

create table if not exists public.screener_medians_next (like public.screener_medians including all);

alter table public.screener_medians enable row level security;
alter table public.screener_medians_next enable row level security;

-- Public reference data, read by the filter panel with the public key. The
-- staging table has no policy: only the service-role key reaches it.
drop policy if exists "screener_medians is public" on public.screener_medians;
create policy "screener_medians is public"
  on public.screener_medians for select
  using (true);

-- ============================================================
-- 4. Publish rows and medians together.
--    Columns are named, not "select *", so the swap can't depend on the order
--    columns were added in.
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

  delete from public.screener_metrics where true;
  insert into public.screener_metrics (
    cik, ticker, exchange, name, sector, sic, filer_kind, state,
    period_start, period_end, fiscal_year_end,
    revenue, net_income, free_cash_flow, net_cash,
    revenue_growth_1y, revenue_growth_3y, revenue_growth_5y, revenue_growth_10y, revenue_growth_years,
    gross_margin, operating_margin, net_margin, fcf_margin, share_change_1y,
    roe, roa, net_income_growth_1y, eps_growth_1y,
    rnd_to_revenue, capex_to_revenue, sga_to_revenue,
    pays_dividend, dividends_to_fcf, buybacks_to_fcf,
    debt_to_equity, current_ratio, interest_coverage,
    roic, operating_margin_change_3y, growth_plus_fcf_margin, cash_conversion,
    na_reasons, sources, updated_at
  )
  select
    cik, ticker, exchange, name, sector, sic, filer_kind, state,
    period_start, period_end, fiscal_year_end,
    revenue, net_income, free_cash_flow, net_cash,
    revenue_growth_1y, revenue_growth_3y, revenue_growth_5y, revenue_growth_10y, revenue_growth_years,
    gross_margin, operating_margin, net_margin, fcf_margin, share_change_1y,
    roe, roa, net_income_growth_1y, eps_growth_1y,
    rnd_to_revenue, capex_to_revenue, sga_to_revenue,
    pays_dividend, dividends_to_fcf, buybacks_to_fcf,
    debt_to_equity, current_ratio, interest_coverage,
    roic, operating_margin_change_3y, growth_plus_fcf_margin, cash_conversion,
    na_reasons, sources, updated_at
  from public.screener_metrics_next;
  delete from public.screener_metrics_next where true;

  -- The medians of this same set, when the run staged them.
  if exists (select 1 from public.screener_medians_next) then
    delete from public.screener_medians where true;
    insert into public.screener_medians (metric, median, companies, run_id, computed_at)
    select metric, median, companies, run_id, computed_at from public.screener_medians_next;
    delete from public.screener_medians_next where true;
  end if;

  return staged;
end;
$$;

revoke all on function public.screener_publish(integer) from public;
revoke all on function public.screener_publish(integer) from anon, authenticated;
grant execute on function public.screener_publish(integer) to service_role;
