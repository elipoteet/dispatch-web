import { describe, expect, it } from "vitest";
import {
  FIX_RULE,
  applyAnnualReportFix,
  applyNetIncomeFix,
  isCommodityOrCryptoFund,
  medians,
  needsAnnualReportFix,
  type AnnualFix,
  profileRow,
  reusableFix,
  screenerRow,
  minPublishRows,
  publishDecision,
  type NetIncomeFix,
} from "@/lib/screener/rows";
import { annualReportFact, type Assembled, type CompanyYear, type Picked } from "@/lib/screener/assemble";
import { computeMetrics, METRICS } from "@/lib/screener/metrics";

const p = (val: number, accn: string, tag = "Tag", end = "2025-12-31"): Picked => ({ val, end, tag, accn });

function year(values: CompanyYear["values"], inconsistent: CompanyYear["inconsistent"] = [], end = "2025-12-31"): CompanyYear {
  return { periodStart: "2025-01-01", periodEnd: end, values, inconsistent };
}

// Tesla's 2025, as the frames give it: revenue and cash flow from the 10-K,
// net income from the proxy statement filed in October 2026.
const TESLA = year({
  revenue: p(94_827_000_000, "10K-2026"),
  operating_cash_flow: p(15_000_000_000, "10K-2026"),
  net_income: p(3_855_000_000, "DEF14A-2026", "NetIncomeLoss"),
});

describe("needsAnnualReportFix", () => {
  it("is needed when net income came from another filing than cash flow", () => {
    expect(needsAnnualReportFix(TESLA)).toBe(true);
  });

  it("isn't needed when it all came from the 10-K", () => {
    expect(needsAnnualReportFix(year({ revenue: p(1, "K"), operating_cash_flow: p(1, "K"), net_income: p(1, "K") }))).toBe(false);
  });

  it("is needed when the units rules left net income n/a", () => {
    expect(needsAnnualReportFix(year({ revenue: p(1, "K") }, ["net_income"]))).toBe(true);
    expect(needsAnnualReportFix(null)).toBe(false);
  });
});

describe("applyNetIncomeFix", () => {
  const company: Assembled = {
    cik: 1318605,
    name: "Tesla, Inc.",
    latest: TESLA,
    prior: null,
    balance: {},
    revenueHistory: [],
    revenueHistoryInconsistent: [],
    threeYearsBack: null,
  };
  const fix: NetIncomeFix = { frames: "DEF14A-2026", end: "2025-12-31", val: 3_794_000_000, accn: "10K-2026" };

  it("puts the 10-K's figure in place of the proxy's", () => {
    const fixed = applyNetIncomeFix(company, "NetIncomeLoss", fix);
    expect(fixed.latest.values.net_income).toEqual({ val: 3_794_000_000, end: "2025-12-31", tag: "NetIncomeLoss", accn: "10K-2026" });
    expect(company.latest.values.net_income?.val).toBe(3_855_000_000); // the original is untouched
  });

  it("clears an n/a the units rules left, now the 10-K has spoken", () => {
    const fixed = applyNetIncomeFix({ ...company, latest: year({ revenue: p(1, "K") }, ["net_income"]) }, "NetIncomeLoss", fix);
    expect(fixed.latest.inconsistent).toEqual([]);
    expect(fixed.latest.values.net_income?.val).toBe(3_794_000_000);
  });

  it("keeps the frames figure when the 10-K has none under that tag, and remembers that", () => {
    const none: NetIncomeFix = { frames: "DEF14A-2026", end: "2025-12-31", val: null, accn: null };
    expect(applyNetIncomeFix(company, "NetIncomeLoss", none).latest.values.net_income?.val).toBe(3_855_000_000);
    expect(reusableFix(none, TESLA)).toBe(none);
  });

  it("ignores a fix for another year", () => {
    expect(applyNetIncomeFix(company, "NetIncomeLoss", { ...fix, end: "2024-12-31" }).latest.values.net_income?.val).toBe(3_855_000_000);
  });
});

describe("reusableFix", () => {
  const fix: NetIncomeFix = { frames: "DEF14A-2026", end: "2025-12-31", val: 3_794_000_000, accn: "10K-2026", rule: FIX_RULE };
  it("reuses last night's answer while the frames still hold the same filing", () => {
    expect(reusableFix(fix, TESLA)).toBe(fix);
  });
  it("asks again once the frames hold a newer filing or year", () => {
    expect(reusableFix(fix, year({ net_income: p(1, "DEF14A-2027") }))).toBeUndefined();
    expect(reusableFix(fix, year({ net_income: p(1, "DEF14A-2026") }, [], "2026-12-31"))).toBeUndefined();
  });
  it("asks again for a fix from before the 10-K-first rule that didn't come from the year's own 10-K", () => {
    const old = { frames: "DEF14A-2026", end: "2025-12-31", val: 1, accn: "10Q-2026" };
    expect(reusableFix(old, TESLA)).toBeUndefined();
    expect(reusableFix({ ...old, accn: "10K-2026" }, TESLA)).toEqual({ ...old, accn: "10K-2026" });
  });
});

// JAKKS Pacific, 2025: revenue from its first-quarter 2026 10-Q, which tagged
// the first quarter of 2025 with the whole year's dates.
const JAKKS = year({
  revenue: p(113_253_000, "10Q-2026", "RevenueFromContractWithCustomerExcludingAssessedTax"),
  operating_cash_flow: p(50_000_000, "10K-2026"),
  net_income: p(20_000_000, "10K-2026"),
});

describe("revenue from the 10-K", () => {
  it("is needed when revenue came from another filing than cash flow, or was left n/a", () => {
    expect(needsAnnualReportFix(JAKKS, "revenue")).toBe(true);
    expect(needsAnnualReportFix(JAKKS, "net_income")).toBe(false);
    expect(needsAnnualReportFix(year({ net_income: p(1, "K") }, ["revenue"]), "revenue")).toBe(true);
    // No cash flow: net income's filing is home.
    expect(needsAnnualReportFix(year({ revenue: p(1, "K"), net_income: p(1, "K") }), "revenue")).toBe(false);
  });

  it("replaces the year's revenue and the matching entries of the revenue history", () => {
    const prior = year({ revenue: p(683_000_000, "10K-2025", "RevenueFromContractWithCustomerExcludingAssessedTax", "2024-12-31") }, [], "2024-12-31");
    const company: Assembled = {
      cik: 1009829,
      name: "JAKKS PACIFIC INC",
      latest: JAKKS,
      prior,
      balance: {},
      revenueHistory: [JAKKS.values.revenue!, prior.values.revenue!, p(711_000_000, "10K-2024", "R", "2023-12-31")],
      revenueHistoryInconsistent: [],
      threeYearsBack: null,
    };
    const fix: AnnualFix = { frames: "10Q-2026", end: "2025-12-31", val: 570_671_000, accn: "10K-2026", rule: FIX_RULE };
    const fixed = applyAnnualReportFix(company, "revenue", "RevenueFromContractWithCustomerExcludingAssessedTax", fix);
    expect(fixed.latest.values.revenue?.val).toBe(570_671_000);
    expect(fixed.revenueHistory.map((r) => r?.val)).toEqual([570_671_000, 683_000_000, 711_000_000]);
    expect(computeMetrics(fixed, "operating").values.revenue_growth_1y).toBeCloseTo(570_671_000 / 683_000_000 - 1);
    expect(company.revenueHistory[0]?.val).toBe(113_253_000); // the original is untouched
  });
});

describe("annualReportFact", () => {
  it("takes the 10-K's figure over a later 10-Q that tagged the same dates", () => {
    const facts = [
      { start: "2025-01-01", end: "2025-12-31", val: 570_671_000, accn: "10K-2026", form: "10-K", filed: "2026-03-01", fy: 2025, fp: "FY" },
      { start: "2025-01-01", end: "2025-12-31", val: 113_253_000, accn: "10Q-2026", form: "10-Q", filed: "2026-05-01", fy: 2026, fp: "Q1" },
    ];
    expect(annualReportFact(facts, "2025-01-01", "2025-12-31")?.val).toBe(570_671_000);
    expect(annualReportFact([facts[1]], "2025-01-01", "2025-12-31")?.val).toBe(113_253_000);
    expect(annualReportFact([{ ...facts[0], form: "DEF 14A" }], "2025-01-01", "2025-12-31")).toBeNull();
  });
});

describe("commodity and crypto funds", () => {
  it("are left out by industry code and name; businesses with the same code stay", () => {
    expect(isCommodityOrCryptoFund("6221", "SPDR® GOLD TRUST")).toBe(true);
    expect(isCommodityOrCryptoFund("6221", "iShares Bitcoin Trust ETF")).toBe(true);
    expect(isCommodityOrCryptoFund("6221", "United States Oil Fund, LP")).toBe(true);
    expect(isCommodityOrCryptoFund("6199", "Fidelity® Ethereum Fund")).toBe(true);
    expect(isCommodityOrCryptoFund("6221", "Uranium Royalty Corp.")).toBe(false);
    expect(isCommodityOrCryptoFund("6221", "Antalpha Platform Holding Co")).toBe(false);
    expect(isCommodityOrCryptoFund("6798", "Vornado Realty Trust")).toBe(false);
    expect(isCommodityOrCryptoFund(null, "Blackstone Secured Lending Fund")).toBe(false);
  });
});

describe("medians", () => {
  it("is the middle value among companies with one, n/a left out, and the share paying a dividend", () => {
    const rows = [
      { gross_margin: 0.1, pays_dividend: true },
      { gross_margin: 0.3, pays_dividend: false },
      { gross_margin: null, pays_dividend: null },
      { gross_margin: 0.5, pays_dividend: true },
      { gross_margin: 0.7, pays_dividend: true },
    ];
    expect(medians(rows, ["gross_margin", "roic"])).toEqual([
      { metric: "gross_margin", median: 0.4, companies: 4 },
      { metric: "pays_dividend", median: 0.75, companies: 4 },
    ]);
  });
});

describe("screenerRow", () => {
  const company: Assembled = {
    cik: 1045810,
    name: "NVIDIA CORPORATION",
    latest: year(
      {
        revenue: p(215_938e6, "K", "Revenues"),
        net_income: p(120_067e6, "K", "NetIncomeLoss"),
        operating_cash_flow: p(102_718e6, "K"),
        capex: p(6_042e6, "K"),
      },
      [],
      "2026-01-25",
    ),
    prior: null,
    balance: { cash_and_equivalents: p(10_605e6, "Q", "CashAndCashEquivalentsAtCarryingValue", "2026-01-25") },
    revenueHistory: [],
    revenueHistoryInconsistent: [],
    threeYearsBack: null,
  };
  const profile = profileRow(
    { cik: "0001045810", name: "NVIDIA CORP", sic: "3674", sicDescription: "Semiconductors", state: "CA", fiscalYearEnd: "0131", entityType: "operating", tickers: ["NVDA"], exchanges: ["Nasdaq"] },
    "2026-11-05T00:00:00Z",
  );
  const metrics = computeMetrics(company, "operating");
  const row = screenerRow({ company, ticker: "NVDA", exchange: "Nasdaq", profile, kind: "operating", metrics, fixes: {}, updatedAt: "2026-11-06T09:00:00Z" });

  it("has every column of screener_metrics", () => {
    for (const key of METRICS) expect(row).toHaveProperty(key);
    for (const key of ["cik", "ticker", "exchange", "name", "sector", "sic", "filer_kind", "state", "period_start", "period_end", "fiscal_year_end", "net_income", "free_cash_flow", "pays_dividend", "na_reasons", "sources", "updated_at"]) {
      expect(row).toHaveProperty(key);
    }
  });

  it("fills them from the company, its profile and its measures", () => {
    expect(row).toMatchObject({
      cik: "0001045810",
      ticker: "NVDA",
      sector: "Technology",
      state: "CA",
      period_end: "2026-01-25",
      revenue: 215_938e6,
      free_cash_flow: 96_676e6,
    });
    expect((row.sources as Record<string, unknown>).revenue).toEqual(["Revenues", "K"]);
  });

  it("writes the name as the company writes it", () => {
    expect(row.name).toBe("NVIDIA");
  });
});

describe("publishDecision", () => {
  it("publishes a complete run that staged nearly as many rows as are showing", () => {
    expect(publishDecision({ framesComplete: true, staged: 4_600, showingNow: 4_650 })).toEqual({ publish: true, reason: null });
    expect(publishDecision({ framesComplete: true, staged: 900, showingNow: 0 }).publish).toBe(true);
  });

  it("keeps the last complete set after a failed download or a short run", () => {
    expect(publishDecision({ framesComplete: false, staged: 4_650, showingNow: 4_650 }).publish).toBe(false);
    expect(publishDecision({ framesComplete: true, staged: 1_000, showingNow: 4_650 })).toEqual({ publish: false, reason: "only 1000 rows staged against 4650 showing" });
  });

  it("asks the database to check at least nine in ten again", () => {
    expect(minPublishRows(4_650)).toBe(4_185);
    expect(minPublishRows(0)).toBe(1);
  });
});
