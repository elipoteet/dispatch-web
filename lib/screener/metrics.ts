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
import type { Assembled, BalanceItem, DurationItem, Picked } from "@/lib/screener/assemble";
import { sectorFromSic } from "@/lib/screener/sectors";

export const MAIN_METRICS = [
  "revenue",
  "revenue_growth_1y",
  "revenue_growth_3y",
  "gross_margin",
  "operating_margin",
  "net_margin",
  "fcf_margin",
  "roic",
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
  "operating_margin_change_3y",
  "growth_plus_fcf_margin",
  "cash_conversion",
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
//   partial-cost    gross margin only: the cost line the company files covers
//                   only part of what its sales cost (see grossMarginIsPartial)
export type NaReason = "not-applicable" | "missing" | "base" | "split" | "history" | "inconsistent" | "partial-cost";

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
  roic: { latest: ["revenue"] },
  growth_plus_fcf_margin: { latest: ["revenue", "operating_cash_flow"], prior: ["revenue"] },
  cash_conversion: { latest: ["operating_cash_flow", "net_income"] },
};

export type ScreenerMetrics = {
  values: Record<MetricKey, number | null>;
  paysDividend: boolean | null;
  // Dollar figures kept for display and for the starting screens.
  freeCashFlow: number | null;
  netIncome: number | null;
  // How net cash and return on invested capital were put together, kept with
  // the row's sources so any figure can be traced (rows.ts).
  workings: {
    cash: Figure | null;
    debt: Figure | null;
    // The tax rate used for ROIC, and whether it was the default 21%.
    taxRate: { rate: number; default: boolean } | null;
  };
  na: Partial<Record<MetricKey | "pays_dividend", NaReason>>;
};

// A sum, with what went into it.
export type Figure = { value: number; how: string };

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

// —— Net cash, both sides (7 November 2026) ——
type Balance = Partial<Record<BalanceItem, Picked>>;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.001);
}

// Cash and short-term investments: the company's own total where it files
// one, otherwise its cash plus one short-term investment line. Concepts.ts
// says why one line and never a sum. A company with no short-term
// investment line holds none on its balance sheet, so its cash stands alone.
export function cashAndInvestments(B: Balance): Figure | null {
  if (B.cash_and_short_term_investments) return { value: B.cash_and_short_term_investments.val, how: B.cash_and_short_term_investments.tag };
  if (!B.cash_and_equivalents) return null;
  const st = B.short_term_investments;
  return st
    ? { value: B.cash_and_equivalents.val + st.val, how: `${B.cash_and_equivalents.tag} + ${st.tag}` }
    : { value: B.cash_and_equivalents.val, how: B.cash_and_equivalents.tag };
}

const NONCURRENT_DEBT_TAGS = new Set(["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"]);

// All debt: the long-term debt the research file reads (concepts.ts,
// total_debt), plus what's due within a year that it leaves out, counted
// once.
// - A combined long- and short-term figure already has everything.
// - Where the figure is long-term debt INCLUDING the part due this year
//   (LongTermDebt: NVIDIA, Apple, Microsoft), add only short-term
//   borrowings: debt due within a year less current maturities where both are
//   filed (NVIDIA: $1.0B less $1.0B, nothing to add), otherwise one
//   short-term borrowing line (Apple's $2.0B of commercial paper).
// - Where it EXCLUDES that part, by its tag, or because it equals the
//   noncurrent figure while some long-term debt falls due this year (Chevron
//   files $39.8B under both), add all debt due within a year (Chevron's
//   $10.9B "Short-term debt").
// Finance leases outside these tags aren't counted, as before.
export function totalDebt(B: Balance): Figure | null {
  const base = B.total_debt;
  if (!base) return null;
  if (base.tag === "DebtLongtermAndShorttermCombinedAmount") return { value: base.val, how: base.tag };
  const current = B.debt_current;
  const maturities = B.long_term_debt_current;
  const borrowings = B.short_term_borrowings;
  const noncurrent = B.long_term_debt_noncurrent;
  const excludesCurrent =
    NONCURRENT_DEBT_TAGS.has(base.tag) || (noncurrent != null && near(noncurrent.val, base.val) && (maturities?.val ?? 0) > 0);
  if (excludesCurrent) {
    if (current) return { value: base.val + current.val, how: `${base.tag} + ${current.tag}` };
    const parts = [maturities, borrowings].filter((p): p is Picked => p != null);
    return { value: base.val + parts.reduce((s, p) => s + p.val, 0), how: [base.tag, ...parts.map((p) => p.tag)].join(" + ") };
  }
  if (current && maturities) {
    const shortTerm = Math.max(0, current.val - maturities.val);
    return { value: base.val + shortTerm, how: `${base.tag} + (${current.tag} - ${maturities.tag})` };
  }
  if (borrowings) return { value: base.val + borrowings.val, how: `${base.tag} + ${borrowings.tag}` };
  return { value: base.val, how: base.tag };
}

// —— Gross margin that's believable but wrong (7 November 2026) ——
// Where a company files no gross profit line, the screener works gross margin
// out from the one cost line it tags as cost of revenue. At some companies
// that line is only part of what the sales cost: supplies at a hospital
// (Community Health Systems, 85%), gathering and processing at a gas producer
// (EQT, 82%), fuel at a utility (CenterPoint, 100%), food at a restaurant.
// The tell is what's left between gross profit and operating profit: at a
// software or drug company it's almost all selling, admin and research,
// which those companies file (Vertex: 51 points of gap, 47 explained); at the
// others it's salaries, operations and depreciation, which aren't. So a
// worked-out gross margin is n/a when more than 25 points of revenue sit
// between it and operating profit (pretax profit where operating profit
// isn't filed) and selling, admin and research explain under a third of
// them. A gross margin the company reports itself always stands.
export const PARTIAL_COST_GAP = 0.25;

export function grossMarginIsPartial(L: Partial<Record<DurationItem, Picked>>, revenue: number, grossMargin: number): boolean {
  if (L.gross_profit) return false;
  const profit = L.operating_income?.val ?? L.pretax_income?.val;
  if (profit == null || revenue <= 0) return false;
  const gap = grossMargin - profit / revenue;
  if (gap <= PARTIAL_COST_GAP) return false;
  const sga = L.sga ? L.sga.val : (L.selling_marketing?.val ?? 0) + (L.general_admin?.val ?? 0);
  const explained = (sga + (L.rnd?.val ?? 0) + Math.max(0, L.impairment?.val ?? 0)) / revenue;
  return explained < gap / 3;
}

// —— Return on invested capital ——
// After-tax operating income over invested capital. The tax rate is the
// company's own (income tax over pretax income) held between 0% and 35%;
// with a pretax loss or no tax line it's 21%, the U.S. federal rate.
export const DEFAULT_TAX_RATE = 0.21;
export const MAX_TAX_RATE = 0.35;

export function taxRate(L: Partial<Record<DurationItem, Picked>>): { rate: number; default: boolean } {
  const tax = L.income_tax?.val;
  const pretax = L.pretax_income?.val;
  if (tax == null || pretax == null || pretax <= 0) return { rate: DEFAULT_TAX_RATE, default: true };
  return { rate: Math.min(MAX_TAX_RATE, Math.max(0, tax / pretax)), default: false };
}

export function computeMetrics(company: Assembled, kind: FilerKind, sic: string | null = null): ScreenerMetrics {
  const suppressed = new Set(suppressedItems(kind)?.items ?? []);
  const isFinancial = kind === "financial";
  const L = company.latest.values;
  const P = company.prior?.values ?? {};
  const B = company.balance;
  const revenue = v(L.revenue);
  const results = {} as Record<MetricKey, Result>;
  const cash = cashAndInvestments(B);
  const debt = totalDebt(B);
  let tax: { rate: number; default: boolean } | null = null;

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
    // Gross profit can't exceed revenue. Where the filed figures say it does
    // (JAKKS Pacific's 2025 "annual" revenue is one quarter's; eight companies
    // on 6 November 2026), they disagree with each other, and which one is
    // wrong can't be told from the frames: n/a, never a guess.
    const gm = results.gross_margin.value;
    if (gm != null && gm > 1 + 1e-9) results.gross_margin = na("inconsistent");
    else if (gm != null && revenue != null && grossMarginIsPartial(L, revenue, gm)) results.gross_margin = na("partial-cost");
    // A utility's cost of revenue is its fuel and purchased power, leaving
    // out operations, maintenance and depreciation, so a gross margin worked
    // out from it doesn't describe the business, like gross margin at a bank.
    // A utility that reports gross profit itself (Ormat) keeps it.
    else if (gm != null && !L.gross_profit && sectorFromSic(sic) === "Utilities") results.gross_margin = na("not-applicable");
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
  else if (!cash || !debt) results.net_cash = na("missing");
  else results.net_cash = ok(cash.value - debt.value);

  const sharesBasis = sameShareBasis(L.shares_diluted, P.shares_diluted);
  if (!company.prior) results.share_change_1y = na("history");
  else if (sharesBasis === null) results.share_change_1y = L.shares_diluted && P.shares_diluted ? na("base") : na("missing");
  else if (!sharesBasis) results.share_change_1y = na("split");
  else results.share_change_1y = growth(v(L.shares_diluted), v(P.shares_diluted));
  // A share count can't fall by half or more in a year through buybacks. A
  // drop that size is a change in what's counted (Brilliant Earth's diluted
  // count fell 85% in 2025 when its other share class stopped counting) or a
  // reverse split, so it's n/a and can't pass for a buyback. Rises stay:
  // a deal paid in shares can double a count.
  const sc = results.share_change_1y.value;
  if (sc != null && sc <= -0.5) results.share_change_1y = na("split");

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
  if (isFinancial) results.debt_to_equity = na("not-applicable");
  else if (debt == null || equity == null) results.debt_to_equity = na("missing");
  else if (equity <= 0) results.debt_to_equity = na("base");
  else results.debt_to_equity = ok(debt.value / equity);

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

  // —— Return on invested capital (main ten) ——
  // Invested capital is debt plus equity less cash and short-term
  // investments, at year end. n/a for banks, insurers and REITs, whose
  // capital is their deposits, float or properties. n/a too when equity is
  // zero or below, as for return on equity and debt to equity: a company
  // that owes more than it owns has no meaningful capital base, and the
  // ratio runs to the thousands (McKesson 1,348%, Unisys 1,550% on 7
  // November 2026).
  if (kind !== "operating") {
    results.roic = na("not-applicable");
  } else if (operatingIncome == null || equity == null || debt == null || cash == null) {
    results.roic = na("missing");
  } else if (equity <= 0) {
    results.roic = na("base");
  } else {
    const invested = debt.value + equity - cash.value;
    tax = taxRate(L);
    results.roic = invested <= 0 ? na("base") : ok((operatingIncome * (1 - tax.rate)) / invested);
  }

  // —— Operating margin, now against three fiscal years earlier, in points ——
  const back = company.threeYearsBack;
  if (!back) {
    results.operating_margin_change_3y = na("history");
  } else {
    const then = overRevenue(v(back.operating_income), v(back.revenue));
    const now = results.operating_margin;
    if (now.value == null) results.operating_margin_change_3y = na(now.na ?? "missing");
    else if (then.value == null) results.operating_margin_change_3y = na(then.na ?? "missing");
    else results.operating_margin_change_3y = ok(now.value - then.value);
  }

  // —— Growth plus free cash flow margin ("Rule of 40") ——
  const g = results.revenue_growth_1y;
  const fm = results.fcf_margin;
  if (g.value == null) results.growth_plus_fcf_margin = na(g.na ?? "missing");
  else if (fm.value == null) results.growth_plus_fcf_margin = na(fm.na ?? "missing");
  else results.growth_plus_fcf_margin = ok(g.value + fm.value);

  // —— Cash conversion: operating cash flow over net income ——
  // n/a for banks and insurers, whose operating cash flow swings on deposits
  // and loans (concepts.ts), and when net income is zero or below.
  const ocf = v(L.operating_cash_flow);
  if (isFinancial) results.cash_conversion = na("not-applicable");
  else if (ocf == null || netIncome == null) results.cash_conversion = na("missing");
  else if (netIncome <= 0) results.cash_conversion = na("base");
  else results.cash_conversion = ok(ocf / netIncome);

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

  return { values, paysDividend, freeCashFlow: fcf, netIncome, workings: { cash, debt, taxRate: tax }, na: reasons };
}
