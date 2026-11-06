// Every screener filter value for one company. Pure.
//
// The rules from the phase eleven brief, in one place:
// - From the latest full fiscal year unless stated; growth over N years is the
//   compound average yearly rate.
// - A measure that doesn't fit the business is n/a (gross margin at a bank),
//   and so is any measure with a missing input. A missing number is never
//   treated as zero. n/a is null, and every null records why.
// - Margins and shares of revenue need revenue above zero, as on the research
//   file (lib/research/series.ts, margin and grossMargin).
// - Line items the research file suppresses for a kind of company
//   (concepts.ts, suppressedItems) are suppressed here too, so a bank's capex
//   is n/a in both places.

import { suppressedItems, type FilerKind } from "@/lib/sec/concepts";
import { MAX_ORDINARY_CHANGE } from "@/lib/research/splits";
import type { Assembled, DurationItem, Picked } from "@/lib/screener/assemble";

export const MAIN_METRICS = [
  "revenue",
  "revenue_growth_1y",
  "revenue_growth_3y",
  "gross_margin",
  "operating_margin",
  "net_margin",
  "fcf_margin",
  "net_cash",
  "share_change_1y",
] as const;

export const MORE_METRICS = [
  "roe",
  "roa",
  "net_income_growth_1y",
  "eps_growth_1y",
  "rnd_to_revenue",
  "capex_to_revenue",
  "sga_to_revenue",
  "dividends_to_fcf",
  "buybacks_to_fcf",
  "debt_to_equity",
  "current_ratio",
  "interest_coverage",
  "revenue_growth_5y",
  "revenue_growth_10y",
  "revenue_growth_years",
] as const;

export type MetricKey = (typeof MAIN_METRICS)[number] | (typeof MORE_METRICS)[number];
export const METRICS: readonly MetricKey[] = [...MAIN_METRICS, ...MORE_METRICS];

// Why a value is n/a:
//   not-applicable  the measure doesn't describe this kind of business
//   missing         an input wasn't filed for the period
//   base            a denominator or starting value is zero or below
//                   (growth from a loss, return on negative equity)
//   split           the two years may be on different share bases
//   history         not enough consecutive years
//   inconsistent    the filing's own figures for an input disagree by a units
//                   factor (assemble.ts, looksLikeUnitsError)
export type NaReason = "not-applicable" | "missing" | "base" | "split" | "history" | "inconsistent";

// Which reported line items each measure reads, for telling "not filed" from
// "filed inconsistently". "latest" and "prior" are the two years compared.
const INPUTS: Partial<Record<MetricKey, { latest?: DurationItem[]; prior?: DurationItem[] }>> = {
  revenue: { latest: ["revenue"] },
  revenue_growth_1y: { latest: ["revenue"], prior: ["revenue"] },
  gross_margin: { latest: ["revenue"] },
  operating_margin: { latest: ["revenue"] },
  net_margin: { latest: ["revenue", "net_income"] },
  fcf_margin: { latest: ["revenue", "operating_cash_flow"] },
  roe: { latest: ["net_income"] },
  roa: { latest: ["net_income"] },
  net_income_growth_1y: { latest: ["net_income"], prior: ["net_income"] },
  rnd_to_revenue: { latest: ["revenue"] },
  capex_to_revenue: { latest: ["revenue"] },
  sga_to_revenue: { latest: ["revenue"] },
  dividends_to_fcf: { latest: ["operating_cash_flow"] },
  buybacks_to_fcf: { latest: ["operating_cash_flow"] },
};

export type ScreenerMetrics = {
  values: Record<MetricKey, number | null>;
  paysDividend: boolean | null;
  // Dollar figures kept for display and for the starting screens.
  freeCashFlow: number | null;
  netIncome: number | null;
  na: Partial<Record<MetricKey | "pays_dividend", NaReason>>;
};

type Result = { value: number | null; na?: NaReason };
const ok = (value: number): Result => ({ value });
const na = (reason: NaReason): Result => ({ value: null, na: reason });

function v(p: Picked | undefined | null): number | null {
  return p ? p.val : null;
}

// A share of revenue, or a margin.
function overRevenue(value: number | null, revenue: number | null): Result {
  if (value == null || revenue == null) return na("missing");
  if (revenue <= 0) return na("base");
  return ok(value / revenue);
}

function growth(now: number | null, before: number | null): Result {
  if (now == null || before == null) return na("missing");
  if (before <= 0) return na("base");
  return ok(now / before - 1);
}

// Compound average yearly growth over `years`, along consecutive years only.
function cagr(history: (Picked | null)[], bad: number[], years: number): Result {
  if (history.length <= years) return na("history");
  const now = v(history[0]);
  const then = v(history[years]);
  if (now == null || then == null) return na(bad.includes(0) || bad.includes(years) ? "inconsistent" : "missing");
  if (then <= 0 || now < 0) return na("base");
  return ok(Math.pow(now / then, 1 / years) - 1);
}

// How many years in a row revenue rose, counting back from the latest year.
// Stops at the first year that didn't rise, or at a gap; n/a when even the
// latest comparison can't be made.
function yearsOfGrowth(history: (Picked | null)[], bad: number[]): Result {
  if (history.length < 2) return na("history");
  if (v(history[0]) == null || v(history[1]) == null) return na(bad.includes(0) || bad.includes(1) ? "inconsistent" : "missing");
  let n = 0;
  for (let i = 0; i + 1 < history.length; i++) {
    const now = v(history[i]);
    const before = v(history[i + 1]);
    if (now == null || before == null || !(now > before)) break;
    n++;
  }
  return ok(n);
}

// Two figures from the same filing are on one share basis: a 10-K restates its
// comparative years for any split. Figures from different filings might
// straddle a split, and a split looks like a jump. Without price data (none in
// this phase) a jump past the research file's own threshold for "could be a
// split" (lib/research/splits.ts) from two different filings can't be trusted,
// so the change is n/a rather than a fake surge or collapse.
export function sameShareBasis(now: Picked | undefined, before: Picked | undefined): boolean | null {
  if (!now || !before || now.val <= 0 || before.val <= 0) return null;
  if (now.accn === before.accn) return true;
  const r = now.val / before.val;
  return r <= MAX_ORDINARY_CHANGE && 1 / r <= MAX_ORDINARY_CHANGE;
}

export function computeMetrics(company: Assembled, kind: FilerKind): ScreenerMetrics {
  const suppressed = new Set(suppressedItems(kind)?.items ?? []);
  const isFinancial = kind === "financial";
  const L = company.latest.values;
  const P = company.prior?.values ?? {};
  const B = company.balance;
  const revenue = v(L.revenue);
  const results = {} as Record<MetricKey, Result>;

  // —— Main ten (sector is stored separately) ——
  results.revenue = revenue == null ? na("missing") : ok(revenue);
  results.revenue_growth_1y = company.prior ? growth(revenue, v(P.revenue)) : na("history");
  const badYears = company.revenueHistoryInconsistent;
  results.revenue_growth_3y = cagr(company.revenueHistory, badYears, 3);

  if (suppressed.has("gross_profit")) {
    results.gross_margin = na("not-applicable");
  } else {
    let gross = v(L.gross_profit);
    if (gross == null && revenue != null && L.cost_of_revenue) gross = revenue - L.cost_of_revenue.val;
    results.gross_margin = overRevenue(gross, revenue);
  }
  results.operating_margin = overRevenue(v(L.operating_income), revenue);
  results.net_margin = overRevenue(v(L.net_income), revenue);

  // The brief makes free cash flow n/a for REITs as well as banks and
  // insurers: a REIT's property purchases sit outside the capex tags, so
  // "operating cash flow less capex" overstates what it keeps. The research
  // file still shows a REIT's free cash flow row; the screener doesn't filter
  // on it.
  const fcfApplies = kind === "operating" && !suppressed.has("free_cash_flow");
  const fcf = fcfApplies && L.operating_cash_flow && L.capex ? L.operating_cash_flow.val - L.capex.val : null;
  results.fcf_margin = fcfApplies ? overRevenue(fcf, revenue) : na("not-applicable");

  if (isFinancial) results.net_cash = na("not-applicable");
  else if (!B.cash_and_equivalents || !B.total_debt) results.net_cash = na("missing");
  else results.net_cash = ok(B.cash_and_equivalents.val - B.total_debt.val);

  const sharesBasis = sameShareBasis(L.shares_diluted, P.shares_diluted);
  if (!company.prior) results.share_change_1y = na("history");
  else if (sharesBasis === null) results.share_change_1y = L.shares_diluted && P.shares_diluted ? na("base") : na("missing");
  else if (!sharesBasis) results.share_change_1y = na("split");
  else results.share_change_1y = growth(v(L.shares_diluted), v(P.shares_diluted));

  // —— Profitability ——
  const netIncome = v(L.net_income);
  const equity = v(B.total_equity);
  results.roe = netIncome == null || equity == null ? na("missing") : equity <= 0 ? na("base") : ok(netIncome / equity);
  const assets = v(B.total_assets);
  results.roa = netIncome == null || assets == null ? na("missing") : assets <= 0 ? na("base") : ok(netIncome / assets);
  results.net_income_growth_1y = company.prior ? growth(netIncome, v(P.net_income)) : na("history");

  if (!company.prior) {
    results.eps_growth_1y = na("history");
  } else {
    const epsNow = L.eps_diluted;
    const epsBefore = P.eps_diluted;
    // Same filing: one share basis. Different filings: trusted only when the
    // share counts show no split-sized jump.
    if (epsNow && epsBefore && epsNow.accn !== epsBefore.accn && sharesBasis !== true) results.eps_growth_1y = na("split");
    else results.eps_growth_1y = growth(v(epsNow), v(epsBefore));
  }

  // —— Spending, as a share of revenue ——
  results.rnd_to_revenue = overRevenue(v(L.rnd), revenue);
  results.capex_to_revenue = suppressed.has("capex") ? na("not-applicable") : overRevenue(v(L.capex), revenue);
  const sga = L.sga ? L.sga.val : L.selling_marketing && L.general_admin ? L.selling_marketing.val + L.general_admin.val : null;
  results.sga_to_revenue = overRevenue(sga, revenue);

  // —— Shareholder returns ——
  const dividends = v(L.dividends_paid);
  const paysDividend = dividends == null ? null : dividends > 0;
  const overFcf = (value: number | null): Result => {
    if (!fcfApplies) return na("not-applicable");
    if (fcf == null || value == null) return na("missing");
    if (fcf <= 0) return na("base");
    return ok(value / fcf);
  };
  results.dividends_to_fcf = overFcf(dividends);
  results.buybacks_to_fcf = overFcf(v(L.buybacks));

  // —— Balance sheet health ——
  const debt = v(B.total_debt);
  if (isFinancial) results.debt_to_equity = na("not-applicable");
  else if (debt == null || equity == null) results.debt_to_equity = na("missing");
  else if (equity <= 0) results.debt_to_equity = na("base");
  else results.debt_to_equity = ok(debt / equity);

  const currentAssets = v(B.current_assets);
  const currentLiabilities = v(B.current_liabilities);
  if (currentAssets == null || currentLiabilities == null) results.current_ratio = na("missing");
  else if (currentLiabilities <= 0) results.current_ratio = na("base");
  else results.current_ratio = ok(currentAssets / currentLiabilities);

  const interest = v(L.interest_expense);
  const operatingIncome = v(L.operating_income);
  if (isFinancial) results.interest_coverage = na("not-applicable");
  else if (interest == null || operatingIncome == null) results.interest_coverage = na("missing");
  else if (interest <= 0) results.interest_coverage = na("base");
  else results.interest_coverage = ok(operatingIncome / interest);

  // —— Longer history ——
  results.revenue_growth_5y = cagr(company.revenueHistory, badYears, 5);
  results.revenue_growth_10y = cagr(company.revenueHistory, badYears, 10);
  results.revenue_growth_years = yearsOfGrowth(company.revenueHistory, badYears);

  const latestBad = new Set(company.latest.inconsistent);
  const priorBad = new Set(company.prior?.inconsistent ?? []);
  const values = {} as Record<MetricKey, number | null>;
  const reasons: ScreenerMetrics["na"] = {};
  for (const key of METRICS) {
    values[key] = results[key].value;
    let reason = results[key].na;
    if (reason === "missing") {
      const inputs = INPUTS[key];
      if (inputs?.latest?.some((i) => latestBad.has(i)) || inputs?.prior?.some((i) => priorBad.has(i))) reason = "inconsistent";
    }
    if (reason) reasons[key] = reason;
  }
  if (paysDividend == null) reasons.pays_dividend = "missing";

  return { values, paysDividend, freeCashFlow: fcf, netIncome, na: reasons };
}
