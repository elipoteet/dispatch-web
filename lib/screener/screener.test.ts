// The screener's numbers for real companies, from saved SEC frames
// (lib/sec/__fixtures__/frames/screener-sample.json: every frames row for
// thirteen companies, captured 5 November 2026 through lib/sec/client.ts).
// The formulas themselves are tested on hand-built years in metrics.test.ts.

import { describe, expect, it } from "vitest";
import fixture from "@/lib/sec/__fixtures__/frames/screener-sample.json";
import { assembleCompany, collectFrame, type Assembled, type FrameCollection } from "@/lib/screener/assemble";
import { computeMetrics, type ScreenerMetrics } from "@/lib/screener/metrics";
import { filerKindFromSic } from "@/lib/sec/concepts";
import { sectorFromSic } from "@/lib/screener/sectors";
import type { FrameEntry, FrameResponse } from "@/lib/sec/frames";

const TODAY = "2026-11-05";

const collection: FrameCollection = new Map();
for (const [key, rows] of Object.entries(fixture.frames as Record<string, FrameEntry[]>)) {
  collectFrame(collection, key.split("|")[0], { data: rows } as FrameResponse);
}

function load(cik: number): { a: Assembled; m: ScreenerMetrics; sic: string | null } {
  const profile = fixture.profiles.find((p) => Number(p.cik) === cik)!;
  const result = assembleCompany(collection.get(cik)!, TODAY);
  if (!result.ok) throw new Error(`${cik} not assembled: ${result.reason}`);
  return { a: result.company, m: computeMetrics(result.company, filerKindFromSic(profile.sic)), sic: profile.sic };
}

describe("NVIDIA, fiscal 2026 (January year-end)", () => {
  const { a, m, sic } = load(1045810);

  it("is the year ended 25 January 2026, read from the CY2025 frames", () => {
    expect(a.latest.periodStart).toBe("2025-01-27");
    expect(a.latest.periodEnd).toBe("2026-01-25");
    expect(a.prior?.periodEnd).toBe("2025-01-26");
    expect(sectorFromSic(sic)).toBe("Technology");
  });

  it("matches the 10-K", () => {
    const v = a.latest.values;
    expect(v.revenue?.val).toBe(215_938_000_000);
    expect(v.net_income?.val).toBe(120_067_000_000);
    expect(v.operating_cash_flow?.val).toBe(102_718_000_000);
    expect(v.capex?.val).toBe(6_042_000_000);
    expect(m.freeCashFlow).toBe(96_676_000_000);
  });

  it("gives the margins those produce", () => {
    expect(m.values.gross_margin).toBeCloseTo(153_463 / 215_938, 6); // 71.1%
    expect(m.values.operating_margin).toBeCloseTo(130_387 / 215_938, 6); // 60.4%
    expect(m.values.net_margin).toBeCloseTo(120_067 / 215_938, 6); // 55.6%
    expect(m.values.fcf_margin).toBeCloseTo(96_676 / 215_938, 6); // 44.8%
    expect(m.values.revenue_growth_1y).toBeCloseTo(215_938 / 130_497 - 1, 6); // 65.5%
  });

  it("compares share counts on one basis across the June 2024 10-for-1 split", () => {
    // Both years come from the fiscal 2026 10-K, which restates the prior year.
    expect(a.latest.values.shares_diluted?.accn).toBe(a.prior?.values.shares_diluted?.accn);
    expect(m.values.share_change_1y).toBeCloseTo(24_514 / 24_804 - 1, 6); // -1.2%, not +900%
    expect(m.values.eps_growth_1y).toBeCloseTo(4.9 / 2.94 - 1, 6);
  });

  it("reads the balance sheet on the year-end date", () => {
    expect(a.balance.cash_and_equivalents?.val).toBe(10_605_000_000);
    expect(a.balance.total_debt?.val).toBe(8_468_000_000);
    expect(m.values.net_cash).toBe(2_137_000_000);
    expect(m.values.current_ratio).toBeCloseTo(125_605 / 32_163, 6);
  });

  it("has no interest coverage: the SEC's frames for its interest tag leave out filings before mid-2026", () => {
    // NVIDIA's 10-K files InterestExpenseNonoperating ($259M), but the
    // CY2025 frame for that tag holds only later filings (concepts.ts).
    expect(m.values.interest_coverage).toBeNull();
    expect(m.na.interest_coverage).toBe("missing");
  });
});

describe("Broadcom (November year-end, 10-for-1 split July 2024, net income tag switch)", () => {
  const { a, m } = load(1730168);

  it("finds the latest year although NetIncomeLoss stopped being filed for it", () => {
    expect(a.latest.periodEnd).toBe("2025-11-02");
    expect(a.latest.values.net_income).toMatchObject({ val: 23_126_000_000, tag: "ProfitLoss" });
  });

  it("compares share counts on one basis across the split", () => {
    expect(m.values.share_change_1y).toBeCloseTo(4_853 / 4_778 - 1, 6); // +1.6%
    expect(m.values.eps_growth_1y).toBeCloseTo(4.77 / 1.23 - 1, 6);
  });

  it("has no ten-year growth: its registration only goes back to fiscal 2016", () => {
    expect(m.na.revenue_growth_10y).toBe("history");
  });
});

describe("Apple (September year-end)", () => {
  it("is already on fiscal 2026, from the CY2026 frames", () => {
    const { a } = load(320193);
    expect(a.latest.periodEnd).toBe("2026-09-26");
  });
});

describe("JPMorgan (a bank)", () => {
  const { a, m, sic } = load(19617);

  it("keeps revenue and net margin", () => {
    expect(a.latest.values.revenue?.val).toBe(182_447_000_000);
    expect(m.values.net_margin).not.toBeNull();
    expect(sectorFromSic(sic)).toBe("Financials");
  });

  it("shows n/a, not a number, for what doesn't describe a bank", () => {
    for (const key of ["gross_margin", "fcf_margin", "net_cash", "debt_to_equity", "interest_coverage", "capex_to_revenue"] as const) {
      expect(m.na[key]).toBe("not-applicable");
    }
    expect(m.na.current_ratio).toBe("missing");
  });
});

describe("REITs", () => {
  it("Realty Income: no gross margin or free cash flow", () => {
    const { m, sic } = load(726728);
    expect(sectorFromSic(sic)).toBe("Real estate");
    expect(m.na.gross_margin).toBe("not-applicable");
    expect(m.na.fcf_margin).toBe("not-applicable");
    expect(m.values.net_margin).not.toBeNull();
  });

  it("UDR: total revenue, not the sliver that counts as customer-contract revenue", () => {
    const { a } = load(74208);
    expect(a.latest.values.revenue).toMatchObject({ val: 1_712_317_000, tag: "Revenues" });
  });
});

describe("McDonald's (negative equity)", () => {
  const { m } = load(63908);
  it("has no return on equity or debt to equity", () => {
    expect(m.na.roe).toBe("base");
    expect(m.na.debt_to_equity).toBe("base");
    expect(m.values.roa).not.toBeNull();
    expect(m.values.net_cash).toBeLessThan(0);
  });
});

describe("Rivian (a loss-maker)", () => {
  const { m } = load(1874178);
  it("keeps negative margins and has no growth from a loss", () => {
    expect(m.values.net_margin).toBeLessThan(0);
    expect(m.values.operating_margin).toBeLessThan(0);
    expect(m.na.net_income_growth_1y).toBe("base");
    expect(m.na.eps_growth_1y).toBe("base");
    expect(m.paysDividend).toBeNull();
  });
});

describe("Walmart (January year-end, two revenue tags)", () => {
  const { a, m } = load(104169);
  it("uses total revenues for every year, and counts ten years of growth", () => {
    expect(a.latest.periodEnd).toBe("2026-01-31");
    expect(new Set(a.revenueHistory.slice(0, 11).map((h) => h?.tag)).size).toBe(1);
    expect(m.values.revenue_growth_years).toBe(10);
  });
});

describe("Microsoft (SG&A in two halves)", () => {
  it("adds selling and marketing to general and administrative", () => {
    const { a, m } = load(789019);
    const v = a.latest.values;
    expect(v.sga).toBeUndefined();
    expect(m.values.sga_to_revenue).toBeCloseTo((v.selling_marketing!.val + v.general_admin!.val) / v.revenue!.val, 10);
  });
});

describe("Johnson & Johnson (two R&D tags)", () => {
  it("takes income-statement R&D, not a component of it", () => {
    const { a } = load(200406);
    expect(a.latest.values.rnd).toMatchObject({ val: 14_665_000_000, tag: "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost" });
  });

  it("finds its dividends under the ordinary-dividends tag", () => {
    const { a, m } = load(200406);
    expect(a.latest.values.dividends_paid?.tag).toBe("PaymentsOfOrdinaryDividends");
    expect(m.paysDividend).toBe(true);
  });
});

describe("Tigo Energy (a units error in the filing)", () => {
  it("shows revenue as n/a, not $103.5 billion", () => {
    const { m } = load(1855447);
    expect(m.values.revenue).toBeNull();
    expect(m.na.revenue).toBe("inconsistent");
    expect(m.na.net_margin).toBe("inconsistent");
  });
});

describe("Chevron (cash tagged with its own element)", () => {
  it("works year-end cash out from the restricted-cash total, as its research file does", () => {
    const { a } = load(93410);
    expect(a.balance.cash_and_equivalents).toMatchObject({ val: 7_285_000_000 - 174_000_000 - 818_000_000, derived: true });
  });
});
