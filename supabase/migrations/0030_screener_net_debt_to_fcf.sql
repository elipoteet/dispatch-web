-- Phase eleven, The Compounder (14 November 2026): one new measure, years of
-- free cash flow to repay net debt. Written to be run by hand in the Supabase
-- SQL editor, same as every migration before this one.
--
-- WHAT THIS CHANGES
--   1. Adds one nullable column to the screener's own two tables,
--      screener_metrics and screener_metrics_next (migrations 0026, 0027,
--      0029). Nothing outside the screener reads them. Existing rows are
--      untouched (null until the next run fills them); until that run, the
--      filter shows n/a for every company.
--   2. Replaces screener_publish (0029) so the swap carries the new column.
-- Safe to paste twice: every statement is "if not exists" or "or replace".

-- ============================================================
-- 1. net_debt_to_fcf: debt less cash and short-term investments, over free
--    cash flow, in years (lib/screener/metrics.ts). 0 for a company with net
--    cash; null when free cash flow is zero or below, or net cash is n/a.
-- ============================================================
alter table public.screener_metrics add column if not exists net_debt_to_fcf double precision;
alter table public.screener_metrics_next add column if not exists net_debt_to_fcf double precision;

-- ============================================================
-- 2. Publish rows and medians together, with the new column.
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
    net_debt_to_fcf,
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
    net_debt_to_fcf,
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
