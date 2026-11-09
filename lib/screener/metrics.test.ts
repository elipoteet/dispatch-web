// Every screener formula and every n/a rule, on hand-built years. The same
// rules on real companies, from saved SEC frames, are in screener.test.ts.

import { describe, expect, it } from "vitest";
import { cashAndInvestments, computeMetrics, grossMarginIsPartial, sameShareBasis, taxRate, totalDebt, withStatementDebt, METRICS, type MetricContext } from "@/lib/screener/metrics";
import { sectorFromSic } from "@/lib/screener/sectors";
import type { Assembled, BalanceItem, DurationItem, Picked } from "@/lib/screener/assemble";

const END = "2025-12-31";
const PRIOR_END = "2024-12-31";
// The hand-built companies' dollar figures are in millions (revenue of
// $1,000 million), so revenue clears the $10 million floor for growth. Share
// counts and EPS stay as written.
const M = 1e6;
const PER_SHARE: ReadonlySet<string> = new Set(["shares_diluted", "eps_diluted"]);
const money = (item: string, v: number) => (PER_SHARE.has(item) ? v : v * M);

function p(val: number, accn = "A-25", tag = "Tag", end = END): Picked {
  return { val, end, tag, accn };
}

type Build = {
  latest?: Partial<Record<DurationItem, number>>;
  prior?: Partial<Record<DurationItem, number>> | null;
  balance?: Partial<Record<keyof Assembled["balance"], number>>;
  history?: (number | null)[];
  latestAccn?: Partial<Record<DurationItem, string>>;
  priorAccn?: Partial<Record<DurationItem, string>>;
  inconsistent?: DurationItem[];
  historyInconsistent?: number[];
  balanceTags?: Partial<Record<BalanceItem, string>>;
  threeYearsBack?: { revenue: number | null; operating_income: number | null } | null;
};

const BASE_LATEST: Partial<Record<DurationItem, number>> = {
  revenue: 1000,
  gross_profit: 600,
  operating_income: 200,
  net_income: 150,
  operating_cash_flow: 300,
  capex: 100,
  shares_diluted: 100,
  eps_diluted: 1.5,
  rnd: 80,
  sga: 120,
  dividends_paid: 40,
  buybacks: 60,
  interest_expense: 20,
};
const BASE_PRIOR: Partial<Record<DurationItem, number>> = {
  revenue: 800,
  net_income: 100,
  shares_diluted: 104,
  eps_diluted: 0.96,
};
const BASE_BALANCE = {
  cash_and_equivalents: 500,
  total_debt: 300,
  total_equity: 1000,
  total_assets: 2500,
  current_assets: 900,
  current_liabilities: 450,
};

function build(b: Build = {}): Assembled {
  const latestVals = { ...BASE_LATEST, ...(b.latest ?? {}) };
  const priorVals = b.prior === null ? null : { ...BASE_PRIOR, ...(b.prior ?? {}) };
  const toPicked = (vals: Partial<Record<DurationItem, number>>, accns: Partial<Record<DurationItem, string>> | undefined, end: string) =>
    Object.fromEntries(
      Object.entries(vals)
        .filter(([, v]) => v != null && !Number.isNaN(v))
        .map(([k, v]) => [k, p(money(k, v as number), accns?.[k as DurationItem] ?? "A-25", "Tag", end)]),
    ) as Partial<Record<DurationItem, Picked>>;
  const balanceVals = { ...BASE_BALANCE, ...(b.balance ?? {}) };
  const history = b.history ?? [1000, 800, 700, 600, 500, 450, 400, 380, 360, 340, 320];
  const back = b.threeYearsBack === undefined ? { revenue: 600, operating_income: 90 } : b.threeYearsBack;
  return {
    cik: 1,
    name: "Test Co",
    latest: { periodStart: "2025-01-01", periodEnd: END, values: toPicked(latestVals, b.latestAccn, END), inconsistent: b.inconsistent ?? [] },
    prior: priorVals ? { periodStart: "2024-01-01", periodEnd: PRIOR_END, values: toPicked(priorVals, b.priorAccn, PRIOR_END), inconsistent: [] } : null,
    balance: Object.fromEntries(
      Object.entries(balanceVals)
        .filter(([, v]) => v != null && !Number.isNaN(v))
        .map(([k, v]) => [k, p((v as number) * M, "A-25", b.balanceTags?.[k as BalanceItem] ?? "Tag")]),
    ) as Assembled["balance"],
    revenueHistory: history.map((v, i) => (v == null ? null : p(v * M, "A", "Revenues", `${2025 - i}-12-31`))),
    revenueHistoryInconsistent: b.historyInconsistent ?? [],
    threeYearsBack: back
      ? {
          periodEnd: "2022-12-31",
          revenue: back.revenue == null ? null : p(back.revenue * M, "A-22", "Revenues", "2022-12-31"),
          operating_income: back.operating_income == null ? null : p(back.operating_income * M, "A-22", "OperatingIncomeLoss", "2022-12-31"),
        }
      : null,
  };
}

const run = (b?: Build, kind: "operating" | "financial" | "reit" = "operating", sic: string | null = null, context: MetricContext = {}) =>
  computeMetrics(build(b), kind, { sector: sectorFromSic(sic), ...context });
const MISSING = Number.NaN; // drops a value from the built year

describe("the main ten", () => {
  const m = run();

  it("reports revenue and growth", () => {
    expect(m.values.revenue).toBe(1000 * M);
    expect(m.values.revenue_growth_1y).toBeCloseTo(0.25);
    // (1000 / 600)^(1/3) - 1
    expect(m.values.revenue_growth_3y).toBeCloseTo(Math.pow(1000 / 600, 1 / 3) - 1, 10);
  });

  it("reports margins over revenue", () => {
    expect(m.values.gross_margin).toBeCloseTo(0.6);
    expect(m.values.operating_margin).toBeCloseTo(0.2);
    expect(m.values.net_margin).toBeCloseTo(0.15);
    // (300 - 100) / 1000, free cash flow calculated by us
    expect(m.values.fcf_margin).toBeCloseTo(0.2);
    expect(m.freeCashFlow).toBe(200 * M);
  });

  it("reports net cash as cash less debt, and the share count change", () => {
    expect(m.values.net_cash).toBe(200 * M);
    expect(m.values.share_change_1y).toBeCloseTo(100 / 104 - 1);
  });

  it("works gross margin out from cost of revenue when gross profit isn't filed", () => {
    const r = run({ latest: { gross_profit: MISSING, cost_of_revenue: 700 } });
    expect(r.values.gross_margin).toBeCloseTo(0.3);
  });

  it("calls gross profit above revenue inconsistent, not a margin over 100%", () => {
    // JAKKS Pacific, 2025: a quarter's revenue against the year's gross profit.
    const r = run({ latest: { revenue: 113, gross_profit: 185 } });
    expect(r.values.gross_margin).toBeNull();
    expect(r.na.gross_margin).toBe("inconsistent");
    // Gross profit equal to revenue (no cost of revenue) is a real 100%.
    expect(run({ latest: { gross_profit: 1000 } }).values.gross_margin).toBe(1);
    const fromCost = run({ latest: { gross_profit: MISSING, cost_of_revenue: -50 } });
    expect(fromCost.na.gross_margin).toBe("inconsistent");
  });

  it("has every measure, as a number or a reason", () => {
    for (const key of METRICS) {
      if (m.values[key] == null) expect(m.na[key]).toBeDefined();
    }
    expect(Object.keys(m.na)).toHaveLength(0);
  });
});

describe("n/a: a measure that doesn't fit the business", () => {
  it("banks and insurers: no gross margin, free cash flow, net cash, debt to equity, interest coverage or capex share", () => {
    const m = run({}, "financial");
    for (const key of ["gross_margin", "fcf_margin", "net_cash", "debt_to_equity", "interest_coverage", "capex_to_revenue", "dividends_to_fcf", "buybacks_to_fcf"] as const) {
      expect(m.values[key]).toBeNull();
      expect(m.na[key]).toBe("not-applicable");
    }
    // What still describes a bank stays.
    expect(m.values.net_margin).toBeCloseTo(0.15);
    expect(m.values.roe).toBeCloseTo(0.15);
  });

  it("REITs: no gross margin and no free cash flow, but net cash and debt to equity stay", () => {
    const m = run({}, "reit");
    expect(m.na.gross_margin).toBe("not-applicable");
    expect(m.na.fcf_margin).toBe("not-applicable");
    expect(m.values.net_cash).toBe(200 * M);
    expect(m.values.debt_to_equity).toBeCloseTo(0.3);
    expect(m.values.interest_coverage).toBeCloseTo(10);
  });
});

describe("n/a: a missing input is never a zero", () => {
  it("no debt filed: net cash and debt to equity are n/a, not cash alone", () => {
    const m = run({ balance: { total_debt: MISSING } });
    expect(m.values.net_cash).toBeNull();
    expect(m.na.net_cash).toBe("missing");
    expect(m.values.debt_to_equity).toBeNull();
  });

  it("no capex filed: free cash flow and everything over it are n/a", () => {
    const m = run({ latest: { capex: MISSING } });
    expect(m.values.fcf_margin).toBeNull();
    expect(m.values.dividends_to_fcf).toBeNull();
    expect(m.values.buybacks_to_fcf).toBeNull();
    expect(m.values.capex_to_revenue).toBeNull();
    expect(m.freeCashFlow).toBeNull();
  });

  it("no R&D or interest filed: their measures are n/a, not 0%", () => {
    const m = run({ latest: { rnd: MISSING, interest_expense: MISSING } });
    expect(m.values.rnd_to_revenue).toBeNull();
    expect(m.na.rnd_to_revenue).toBe("missing");
    expect(m.values.interest_coverage).toBeNull();
  });

  it("no dividend filed: pays a dividend is unknown, not no", () => {
    const m = run({ latest: { dividends_paid: MISSING } });
    expect(m.paysDividend).toBeNull();
    expect(m.na.pays_dividend).toBe("missing");
    expect(run({ latest: { dividends_paid: 0 } }).paysDividend).toBe(false);
    expect(run().paysDividend).toBe(true);
  });

  it("no revenue: revenue and everything over it are n/a", () => {
    const m = run({ latest: { revenue: MISSING } });
    for (const key of ["revenue", "revenue_growth_1y", "net_margin", "gross_margin", "rnd_to_revenue"] as const) expect(m.values[key]).toBeNull();
  });
});

describe("n/a: a base of zero or below", () => {
  it("revenue growth from no prior revenue", () => {
    expect(run({ prior: { revenue: 0 } }).na.revenue_growth_1y).toBe("base");
  });

  it("margins on zero revenue", () => {
    expect(run({ latest: { revenue: 0 } }).na.net_margin).toBe("base");
  });

  it("net income and EPS growth from a loss", () => {
    const m = run({ prior: { net_income: -50, eps_diluted: -0.5 } });
    expect(m.na.net_income_growth_1y).toBe("base");
    expect(m.na.eps_growth_1y).toBe("base");
    // A swing from a loss to a loss is n/a too.
    expect(run({ latest: { net_income: -10 }, prior: { net_income: -50 } }).na.net_income_growth_1y).toBe("base");
  });

  it("return on equity and debt to equity with negative equity (McDonald's)", () => {
    const m = run({ balance: { total_equity: -2000 } });
    expect(m.na.roe).toBe("base");
    expect(m.na.debt_to_equity).toBe("base");
    expect(m.values.roa).toBeCloseTo(0.06);
  });

  it("dividends and buybacks over free cash flow that is zero or below", () => {
    const m = run({ latest: { operating_cash_flow: 80 } });
    expect(m.values.fcf_margin).toBeCloseTo(-0.02);
    expect(m.na.dividends_to_fcf).toBe("base");
    expect(m.na.buybacks_to_fcf).toBe("base");
  });

  it("interest coverage with no interest expense", () => {
    expect(run({ latest: { interest_expense: 0 } }).na.interest_coverage).toBe("base");
  });

  it("a loss keeps its sign where the measure allows it", () => {
    const m = run({ latest: { net_income: -300, operating_income: -100 } });
    expect(m.values.net_margin).toBeCloseTo(-0.3);
    expect(m.values.interest_coverage).toBeCloseTo(-5);
    expect(m.values.roe).toBeCloseTo(-0.3);
  });
});

describe("shareholder returns and spending", () => {
  const m = run();
  it("shares of revenue", () => {
    expect(m.values.rnd_to_revenue).toBeCloseTo(0.08);
    expect(m.values.capex_to_revenue).toBeCloseTo(0.1);
    expect(m.values.sga_to_revenue).toBeCloseTo(0.12);
  });

  it("adds the two halves of SG&A only when both are filed", () => {
    expect(run({ latest: { sga: MISSING, selling_marketing: 70, general_admin: 30 } }).values.sga_to_revenue).toBeCloseTo(0.1);
    expect(run({ latest: { sga: MISSING, general_admin: 30 } }).values.sga_to_revenue).toBeNull();
  });

  it("dividends and buybacks over free cash flow", () => {
    expect(m.values.dividends_to_fcf).toBeCloseTo(0.2);
    expect(m.values.buybacks_to_fcf).toBeCloseTo(0.3);
  });

  it("balance sheet health", () => {
    expect(m.values.debt_to_equity).toBeCloseTo(0.3);
    expect(m.values.current_ratio).toBeCloseTo(2);
    expect(m.values.interest_coverage).toBeCloseTo(10);
    expect(m.values.roe).toBeCloseTo(0.15);
    expect(m.values.roa).toBeCloseTo(0.06);
  });
});

describe("longer history", () => {
  it("compound growth over five and ten years", () => {
    const m = run();
    expect(m.values.revenue_growth_5y).toBeCloseTo(Math.pow(1000 / 450, 1 / 5) - 1, 10);
    expect(m.values.revenue_growth_10y).toBeCloseTo(Math.pow(1000 / 320, 1 / 10) - 1, 10);
  });

  it("counts years in a row of growth, stopping at the first that didn't rise", () => {
    expect(run().values.revenue_growth_years).toBe(10);
    expect(run({ history: [1000, 800, 900, 600] }).values.revenue_growth_years).toBe(1);
    expect(run({ history: [800, 1000, 600] }).values.revenue_growth_years).toBe(0);
  });

  it("stops at a year with no revenue filed", () => {
    expect(run({ history: [1000, 900, null, 700] }).values.revenue_growth_years).toBe(1);
  });

  it("is n/a without enough consecutive years", () => {
    const m = run({ history: [1000, 800, 700] });
    expect(m.na.revenue_growth_3y).toBe("history");
    expect(m.na.revenue_growth_5y).toBe("history");
    expect(m.na.revenue_growth_10y).toBe("history");
    const first = run({ prior: null, history: [1000] });
    expect(first.na.revenue_growth_1y).toBe("history");
    expect(first.na.revenue_growth_years).toBe("history");
    expect(first.na.share_change_1y).toBe("history");
  });

  it("is n/a when the starting year's revenue is missing", () => {
    expect(run({ history: [1000, 800, 700, null] }).na.revenue_growth_3y).toBe("missing");
  });
});

describe("stock splits", () => {
  it("trusts any change when both years come from the same filing, which restates for splits", () => {
    expect(sameShareBasis(p(24_514, "10K-2026"), p(2_480, "10K-2026"))).toBe(true);
  });

  it("trusts a small change between filings, not a split-sized one", () => {
    expect(sameShareBasis(p(105, "B"), p(100, "A"))).toBe(true);
    expect(sameShareBasis(p(1_000, "B"), p(100, "A"))).toBe(false);
    expect(sameShareBasis(p(10, "B"), p(100, "A"))).toBe(false);
  });

  it("makes share change and EPS growth n/a when a jump spans two filings", () => {
    const m = run({ latest: { shares_diluted: 1000 }, prior: { shares_diluted: 100 }, latestAccn: { shares_diluted: "B", eps_diluted: "B" } });
    expect(m.na.share_change_1y).toBe("split");
    expect(m.na.eps_growth_1y).toBe("split");
  });

  it("keeps EPS growth from two filings when the share counts show no split", () => {
    const m = run({ latestAccn: { eps_diluted: "B" } });
    expect(m.values.eps_growth_1y).toBeCloseTo(1.5 / 0.96 - 1);
  });
});

describe("units errors in the filing", () => {
  it("say inconsistent, not missing, for every measure that needed the figure", () => {
    const m = run({ latest: { revenue: MISSING }, inconsistent: ["revenue"] });
    expect(m.na.revenue).toBe("inconsistent");
    expect(m.na.net_margin).toBe("inconsistent");
    expect(m.na.revenue_growth_1y).toBe("inconsistent");
  });

  it("in a past year's revenue, make growth through that year inconsistent", () => {
    const m = run({ history: [1000, 800, 700, null], historyInconsistent: [3] });
    expect(m.na.revenue_growth_3y).toBe("inconsistent");
  });
});

// —— 7 November 2026: net cash both sides, gross margin, and the new measures ——
const pk = (val: number, tag: string): Picked => ({ val, end: END, tag, accn: "10K" });

describe("net cash, both sides", () => {
  it("takes the company's own cash-and-investments total, else cash plus one investment line", () => {
    // Alphabet, 31 December 2025: its own total.
    expect(
      cashAndInvestments({
        cash_and_equivalents: pk(30.708e9, "CashAndCashEquivalentsAtCarryingValue"),
        cash_and_short_term_investments: pk(126.843e9, "CashCashEquivalentsAndShortTermInvestments"),
      })?.value,
    ).toBe(126.843e9);
    // Apple, 26 September 2026: cash plus current marketable securities.
    expect(cashAndInvestments({ cash_and_equivalents: pk(36.305e9, "Cash"), short_term_investments: pk(20.417e9, "MarketableSecuritiesCurrent") })?.value).toBe(56.722e9);
    // NVIDIA tags its marketable securities with its own element: cash alone.
    expect(cashAndInvestments({ cash_and_equivalents: pk(10.605e9, "Cash") })?.value).toBe(10.605e9);
    expect(cashAndInvestments({ short_term_investments: pk(1e9, "ShortTermInvestments") })).toBeNull();
  });

  it("adds short-term borrowings to long-term debt that includes its current part", () => {
    // Apple: long-term debt (current part included) plus commercial paper.
    expect(
      totalDebt({
        total_debt: pk(78.114e9, "LongTermDebt"),
        long_term_debt_noncurrent: pk(68.208e9, "LongTermDebtNoncurrent"),
        long_term_debt_current: pk(9.906e9, "LongTermDebtCurrent"),
        short_term_borrowings: pk(1.997e9, "CommercialPaper"),
      })?.value,
    ).toBeCloseTo(80.111e9, -3);
    // NVIDIA: debt due within a year ($1.0B) is all current maturities, already inside.
    expect(totalDebt({ total_debt: pk(8.468e9, "LongTermDebt"), debt_current: pk(0.999e9, "DebtCurrent"), long_term_debt_current: pk(0.999e9, "LongTermDebtCurrent") })?.value).toBe(8.468e9);
    // Debt due within a year less current maturities is what's added.
    expect(totalDebt({ total_debt: pk(100, "LongTermDebt"), debt_current: pk(30, "DebtCurrent"), long_term_debt_current: pk(10, "LongTermDebtCurrent") })?.value).toBe(120);
    // Microsoft: nothing short-term.
    expect(totalDebt({ total_debt: pk(40.294e9, "LongTermDebt") })?.value).toBe(40.294e9);
  });

  it("takes debt tagged as including current maturities at its word (Chevron, corrected 9 November 2026)", () => {
    // Balance sheet: $977M of short-term debt, $39.8B of long-term debt. The
    // note's $10.9B of short-term debt is before $9.9B is refinanced into
    // long-term, so adding it counted that $9.9B twice ($50.7B).
    expect(
      totalDebt({
        total_debt: pk(39.781e9, "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities"),
        long_term_debt_noncurrent: pk(39.781e9, "LongTermDebtAndCapitalLeaseObligations"),
        long_term_debt_current: pk(2.345e9, "LongTermDebtCurrent"),
        debt_current: pk(10.918e9, "DebtCurrent"),
        short_term_borrowings: pk(0.977e9, "ShortTermBorrowings"),
      })?.value,
    ).toBeCloseTo(40.758e9, -3);
    // Kyndryl: short-term debt less current maturities, where that's no more
    // than the short-term borrowings filed.
    expect(
      totalDebt({
        total_debt: pk(3.11e9, "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities"),
        long_term_debt_current: pk(0.8e9, "LongTermDebtAndCapitalLeaseObligationsCurrent"),
        debt_current: pk(1.8e9, "DebtCurrent"),
        short_term_borrowings: pk(1.8e9, "ShortTermBorrowings"),
      })?.value,
    ).toBeCloseTo(4.11e9, -3);
  });

  it("adds all debt due within a year to debt that excludes it, by tag or because it equals the noncurrent figure", () => {
    // Procter & Gamble: noncurrent by its tag, plus debt due within a year.
    expect(totalDebt({ total_debt: pk(22.842e9, "LongTermDebtNoncurrent"), debt_current: pk(11.296e9, "DebtCurrent") })?.value).toBeCloseTo(34.138e9, -3);
    // Noncurrent with no single current total: maturities plus borrowings.
    expect(
      totalDebt({ total_debt: pk(100, "LongTermDebtAndCapitalLeaseObligations"), long_term_debt_current: pk(10, "LongTermDebtCurrent"), short_term_borrowings: pk(5, "ShortTermBorrowings") })?.value,
    ).toBe(115);
    // A combined long- and short-term figure already has everything.
    expect(totalDebt({ total_debt: pk(50, "DebtLongtermAndShorttermCombinedAmount"), short_term_borrowings: pk(5, "ShortTermBorrowings") })?.value).toBe(50);
    expect(totalDebt({ short_term_borrowings: pk(5, "ShortTermBorrowings") })).toBeNull();
  });

  it("feeds net cash and debt to equity, n/a when either side is missing", () => {
    const m = run({ balance: { short_term_investments: 200, short_term_borrowings: 50 }, balanceTags: { total_debt: "LongTermDebt" } });
    expect(m.values.net_cash).toBe((500 + 200 - (300 + 50)) * M);
    expect(m.values.debt_to_equity).toBeCloseTo(350 / 1000);
    expect(run({ balance: { total_debt: MISSING } }).na.net_cash).toBe("missing");
  });
});

describe("gross margin that's believable but wrong", () => {
  const L = (v: Partial<Record<DurationItem, number>>) =>
    Object.fromEntries(Object.entries(v).map(([k, x]) => [k, pk(x as number, k)])) as Partial<Record<DurationItem, Picked>>;

  it("blanks a worked-out margin when selling, admin and research don't explain the gap to operating profit", () => {
    // Community Health Systems: supplies as cost of revenue, 85% "gross margin", 12% operating margin.
    expect(grossMarginIsPartial(L({ cost_of_revenue: 149, operating_income: 119 }), 1000, 0.851)).toBe(true);
    // EQT: 82% from gathering costs, SG&A 4% of revenue against a 45-point gap.
    expect(grossMarginIsPartial(L({ cost_of_revenue: 177, operating_income: 376, sga: 44 }), 1000, 0.823)).toBe(true);
  });

  it("keeps real high margins: software, drugs, and a one-off write-down", () => {
    // Vertex: 86% gross, 35% operating; SG&A 15% and R&D 33% explain the gap.
    expect(grossMarginIsPartial(L({ cost_of_revenue: 138, operating_income: 348, sga: 146, rnd: 326 }), 1000, 0.862)).toBe(false);
    // Tripadvisor files marketing and G&A separately.
    expect(grossMarginIsPartial(L({ cost_of_revenue: 77, operating_income: 42, selling_marketing: 419, general_admin: 36 }), 1000, 0.923)).toBe(false);
    // Bumble: a $656M goodwill write-down made the operating loss.
    expect(
      grossMarginIsPartial(L({ cost_of_revenue: 292, operating_income: -834, selling_marketing: 171, general_admin: 143, impairment: 680 }), 1000, 0.708),
    ).toBe(false);
    // A gap of 25 points or less: nothing to judge.
    expect(grossMarginIsPartial(L({ cost_of_revenue: 400, operating_income: 350 }), 1000, 0.6)).toBe(false);
  });

  it("always keeps a gross profit the company reports, and uses pretax profit when operating profit isn't filed", () => {
    expect(grossMarginIsPartial(L({ gross_profit: 851, operating_income: 119 }), 1000, 0.851)).toBe(false);
    expect(grossMarginIsPartial(L({ cost_of_revenue: 380, pretax_income: 150 }), 1000, 0.62)).toBe(true);
    expect(grossMarginIsPartial(L({ cost_of_revenue: 380 }), 1000, 0.62)).toBe(false);
  });

  it("marks the reasons, and treats a utility's worked-out margin as not applicable", () => {
    expect(run({ latest: { gross_profit: MISSING, cost_of_revenue: 150, sga: 0, rnd: 0 } }).na.gross_margin).toBe("partial-cost");
    // A utility with a small gap still has no meaningful gross margin (CenterPoint, SIC 4911).
    expect(
      run({ latest: { gross_profit: MISSING, cost_of_revenue: 700, operating_income: 200, sga: MISSING, rnd: MISSING } }, "operating", "4911").na.gross_margin,
    ).toBe("not-applicable");
    // One that reports gross profit itself (Ormat) keeps it.
    expect(run({}, "operating", "4911").values.gross_margin).toBeCloseTo(0.6);
  });
});

describe("return on invested capital", () => {
  it("is after-tax operating income over debt plus equity less cash, at the company's own tax rate", () => {
    // Pretax 180, tax 36: 20%. Invested capital 300 + 1000 - 500 = 800.
    const m = run({ latest: { income_tax: 36, pretax_income: 180 } });
    expect(m.values.roic).toBeCloseTo((200 * 0.8) / 800);
    expect(m.workings.taxRate).toEqual({ rate: 0.2, default: false });
  });

  it("holds the tax rate between 0% and 35%, and uses 21% when it can't be worked out", () => {
    expect(taxRate({ income_tax: pk(90, "t"), pretax_income: pk(100, "p") }).rate).toBe(0.35);
    expect(taxRate({ income_tax: pk(-10, "t"), pretax_income: pk(100, "p") }).rate).toBe(0);
    expect(taxRate({ income_tax: pk(5, "t"), pretax_income: pk(-100, "p") })).toEqual({ rate: 0.21, default: true });
    expect(taxRate({ pretax_income: pk(100, "p") })).toEqual({ rate: 0.21, default: true });
    expect(run().values.roic).toBeCloseTo((200 * 0.79) / 800);
  });

  it("is n/a for banks, insurers and REITs, with an input missing, or with no capital invested", () => {
    expect(run({}, "financial").na.roic).toBe("not-applicable");
    expect(run({}, "reit").na.roic).toBe("not-applicable");
    expect(run({ latest: { operating_income: MISSING } }).na.roic).toBe("missing");
    expect(run({ balance: { total_debt: MISSING } }).na.roic).toBe("missing");
    expect(run({ balance: { cash_and_equivalents: 2000 } }).na.roic).toBe("base");
    // Owes more than it owns (McKesson): no meaningful capital base.
    expect(run({ balance: { total_equity: -100 } }).na.roic).toBe("base");
  });
});

describe("share count change", () => {
  it("can't show a fall of half or more as a buyback", () => {
    expect(run({ latest: { shares_diluted: 15 }, prior: { shares_diluted: 100 } }).na.share_change_1y).toBe("split");
    expect(run({ latest: { shares_diluted: 94 }, prior: { shares_diluted: 100 } }).values.share_change_1y).toBeCloseTo(-0.06);
    // A deal paid in shares can double the count.
    expect(run({ latest: { shares_diluted: 250 }, prior: { shares_diluted: 100 } }).values.share_change_1y).toBeCloseTo(1.5);
  });
});

describe("operating margin change, growth plus free cash flow, cash conversion", () => {
  it("measures the operating margin against three fiscal years earlier, in points", () => {
    // 200/1000 = 20% now, 90/600 = 15% then.
    expect(run().values.operating_margin_change_3y).toBeCloseTo(0.05);
    expect(run({ threeYearsBack: null }).na.operating_margin_change_3y).toBe("history");
    expect(run({ threeYearsBack: { revenue: 600, operating_income: null } }).na.operating_margin_change_3y).toBe("missing");
    expect(run({ threeYearsBack: { revenue: 0, operating_income: 10 } }).na.operating_margin_change_3y).toBe("base");
    expect(run({ latest: { operating_income: MISSING } }).na.operating_margin_change_3y).toBe("missing");
  });

  it("adds 1-year revenue growth and free cash flow margin, n/a if either is", () => {
    expect(run().values.growth_plus_fcf_margin).toBeCloseTo(0.25 + 0.2);
    expect(run({ prior: null }).na.growth_plus_fcf_margin).toBe("history");
    expect(run({}, "reit").na.growth_plus_fcf_margin).toBe("not-applicable");
  });

  it("is operating cash flow over net income, n/a at a loss or a bank", () => {
    expect(run().values.cash_conversion).toBe(2);
    expect(run({ latest: { net_income: -10 } }).na.cash_conversion).toBe("base");
    expect(run({ latest: { net_income: 0 } }).na.cash_conversion).toBe("base");
    expect(run({}, "financial").na.cash_conversion).toBe("not-applicable");
    expect(run({ latest: { operating_cash_flow: MISSING } }).na.cash_conversion).toBe("missing");
  });
});

describe("return on invested capital (9 November 2026)", () => {
  // Base company: operating income 200, tax at the default 21%, debt 300 plus
  // equity 1,000 less cash 500 = 800 invested; total assets 2,500.
  it("is after-tax operating profit over debt plus equity less cash", () => {
    const m = run();
    expect(m.values.roic).toBeCloseTo((200 * 0.79) / 800);
    expect(m.workings.roicBasis).toBe("operating income");
  });

  it("starts from pretax income plus interest expense where no operating income is filed", () => {
    // ExxonMobil, Johnson & Johnson: no operating income line (Eli, 9 November 2026).
    const m = run({ latest: { operating_income: MISSING, pretax_income: 180, interest_expense: 20 } });
    expect(m.values.roic).toBeCloseTo((200 * 0.79) / 800);
    expect(m.workings.roicBasis).toBe("pretax income plus interest expense");
    // Both are needed: no interest line, no figure.
    const none = run({ latest: { operating_income: MISSING, pretax_income: 180, interest_expense: MISSING } });
    expect(none.values.roic).toBeNull();
    expect(none.na.roic).toBe("missing");
    expect(none.workings.roicBasis).toBeNull();
    // Operating margin and interest coverage don't take the fallback.
    expect(m.values.operating_margin).toBeNull();
    expect(m.values.interest_coverage).toBeNull();
  });

  it("is n/a above 100% when invested capital is under a quarter of total assets", () => {
    // Operating income 2,000: 1,580 after tax on 800 invested, 197.5%.
    const strong = run({ latest: { operating_income: 2000 } });
    expect(strong.values.roic).toBeCloseTo(1.975); // 800 of 2,500 assets is 32%
    const tinyBase = run({ latest: { operating_income: 2000 }, balance: { total_assets: 4000 } }); // 20%
    expect(tinyBase.values.roic).toBeNull();
    expect(tinyBase.na.roic).toBe("base");
    // Without total assets there's nothing to vouch for a figure over 100%.
    expect(run({ latest: { operating_income: 2000 }, balance: { total_assets: MISSING } }).values.roic).toBeNull();
    // Up to 100% the capital base isn't questioned.
    expect(run({ balance: { total_assets: 100_000 } }).values.roic).toBeCloseTo((200 * 0.79) / 800);
  });
});

describe("revenue growth from under $10 million (9 November 2026)", () => {
  it("is n/a for one year when the year before had under $10 million of sales", () => {
    const m = run({ prior: { revenue: 9 } });
    expect(m.values.revenue_growth_1y).toBeNull();
    expect(m.na.revenue_growth_1y).toBe("base");
    // And so is revenue growth plus free cash flow margin.
    expect(m.values.growth_plus_fcf_margin).toBeNull();
    expect(run({ prior: { revenue: 10 } }).values.revenue_growth_1y).toBeCloseTo(99);
  });

  it("is n/a over several years when the first year had under $10 million", () => {
    const m = run({ history: [1000, 800, 700, 5, 4, 3] });
    expect(m.na.revenue_growth_3y).toBe("base");
    expect(m.na.revenue_growth_5y).toBe("base");
    expect(run({ history: [1000, 800, 700, 10] }).values.revenue_growth_3y).toBeCloseTo(Math.pow(100, 1 / 3) - 1);
  });
});

describe("companies holding their customers' money (9 November 2026)", () => {
  const m = run({}, "operating", "7389", { holdsCustomerMoney: true });

  it("are n/a for free cash flow and net cash, and what's built on them, as banks are", () => {
    for (const key of ["fcf_margin", "net_cash", "dividends_to_fcf", "buybacks_to_fcf", "growth_plus_fcf_margin", "cash_conversion"] as const) {
      expect(m.values[key]).toBeNull();
      expect(m.na[key]).toBe("not-applicable");
    }
    expect(m.freeCashFlow).toBeNull();
  });

  it("keep everything else", () => {
    expect(m.values.revenue_growth_1y).toBeCloseTo(0.25);
    expect(m.values.net_margin).toBeCloseTo(0.15);
    expect(m.values.roic).toBeCloseTo((200 * 0.79) / 800);
    expect(m.values.debt_to_equity).toBeCloseTo(0.3);
  });
});

describe("securities read off the balance sheet page (9 November 2026)", () => {
  it("adds them to cash, for net cash and ROIC", () => {
    // NVIDIA: $52.0B of marketable securities under its own element.
    const added = [{ element: "nvda:MarketableSecuritiesAndEquitySecuritiesFVNI", label: "Marketable securities", value: 100 * M }];
    const m = run({}, "operating", null, { statement: { added } });
    expect(m.values.net_cash).toBe((500 + 100 - 300) * M);
    expect(m.values.roic).toBeCloseTo((200 * 0.79) / 700);
    expect(m.workings.cash?.how).toContain("nvda:MarketableSecuritiesAndEquitySecuritiesFVNI");
    // A page that showed nothing more leaves cash as it was.
    expect(run({}, "operating", null, { statement: { added: [] } }).values.net_cash).toBe(200 * M);
  });

  it("leaves net cash and ROIC n/a when the page was needed and couldn't be read", () => {
    const m = run({}, "operating", null, { statement: "unread" });
    expect(m.na.net_cash).toBe("missing");
    expect(m.na.roic).toBe("missing");
  });
});

describe("a filing with every dollar figure in the wrong units (9 November 2026)", () => {
  it("leaves net cash, ROIC and free cash flow n/a, as inconsistent", () => {
    // Universe Pharmaceuticals: assemble.ts has already left revenue and net
    // income out.
    const a = build({ latest: { revenue: MISSING, net_income: MISSING }, inconsistent: ["revenue", "net_income"] });
    a.latest.dollarsInOtherUnits = "0001213900-26-009000";
    const m = computeMetrics(a, "operating");
    expect(m.na.net_cash).toBe("inconsistent");
    expect(m.na.roic).toBe("inconsistent");
    expect(m.na.fcf_margin).toBe("inconsistent");
    expect(m.na.revenue).toBe("inconsistent");
    expect(m.freeCashFlow).toBeNull();
  });
});

describe("debt due within a year read off the balance sheet page (9 November 2026)", () => {
  const pk = (val: number, tag: string): Picked => ({ val, end: "2025-12-31", tag, accn: "K" });
  const B = { total_debt: pk(30.70e9, "LongTermDebtNoncurrent"), short_term_borrowings: pk(5.514e9, "ShortTermBorrowings") };
  const lines = [
    { element: "us-gaap:ShortTermBorrowings", label: "Short-term borrowings", value: 5.514e9 },
    { element: "us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent", label: "Long-term debt due within one year", value: 0.035e9 },
    { element: "us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent", label: "Long-term debt due within one year", value: 7.085e9 },
  ];

  it("adds what the page shows beyond the borrowings already counted (Caterpillar: $43.3B, as its 10-K)", () => {
    expect(withStatementDebt(totalDebt(B), { added: [], shortTermDebt: lines }, B)?.value).toBeCloseTo(43.334e9, -6);
  });

  it("adds nothing where the debt figure already has its current part", () => {
    const withCurrent = { ...B, long_term_debt_current: pk(7.131e9, "LongTermDebtCurrent") };
    expect(withStatementDebt(totalDebt(withCurrent), { added: [], shortTermDebt: lines }, withCurrent)?.value).toBe(totalDebt(withCurrent)?.value);
  });
});
