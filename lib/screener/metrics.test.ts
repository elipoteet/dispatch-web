// Every screener formula and every n/a rule, on hand-built years. The same
// rules on real companies, from saved SEC frames, are in screener.test.ts.

import { describe, expect, it } from "vitest";
import { computeMetrics, sameShareBasis, METRICS } from "@/lib/screener/metrics";
import type { Assembled, DurationItem, Picked } from "@/lib/screener/assemble";

const END = "2025-12-31";
const PRIOR_END = "2024-12-31";

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
        .map(([k, v]) => [k, p(v as number, accns?.[k as DurationItem] ?? "A-25", "Tag", end)]),
    ) as Partial<Record<DurationItem, Picked>>;
  const balanceVals = { ...BASE_BALANCE, ...(b.balance ?? {}) };
  const history = b.history ?? [1000, 800, 700, 600, 500, 450, 400, 380, 360, 340, 320];
  return {
    cik: 1,
    name: "Test Co",
    latest: { periodStart: "2025-01-01", periodEnd: END, values: toPicked(latestVals, b.latestAccn, END), inconsistent: b.inconsistent ?? [] },
    prior: priorVals ? { periodStart: "2024-01-01", periodEnd: PRIOR_END, values: toPicked(priorVals, b.priorAccn, PRIOR_END), inconsistent: [] } : null,
    balance: Object.fromEntries(
      Object.entries(balanceVals)
        .filter(([, v]) => v != null && !Number.isNaN(v))
        .map(([k, v]) => [k, p(v as number)]),
    ) as Assembled["balance"],
    revenueHistory: history.map((v, i) => (v == null ? null : p(v, "A", "Revenues", `${2025 - i}-12-31`))),
    revenueHistoryInconsistent: b.historyInconsistent ?? [],
  };
}

const run = (b?: Build, kind: "operating" | "financial" | "reit" = "operating") => computeMetrics(build(b), kind);
const MISSING = Number.NaN; // drops a value from the built year

describe("the main ten", () => {
  const m = run();

  it("reports revenue and growth", () => {
    expect(m.values.revenue).toBe(1000);
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
    expect(m.freeCashFlow).toBe(200);
  });

  it("reports net cash as cash less debt, and the share count change", () => {
    expect(m.values.net_cash).toBe(200);
    expect(m.values.share_change_1y).toBeCloseTo(100 / 104 - 1);
  });

  it("works gross margin out from cost of revenue when gross profit isn't filed", () => {
    const r = run({ latest: { gross_profit: MISSING, cost_of_revenue: 700 } });
    expect(r.values.gross_margin).toBeCloseTo(0.3);
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
    expect(m.values.net_cash).toBe(200);
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
