import { describe, expect, it } from "vitest";
import { normalizeCompanyFacts, pick, type CompanyFacts } from "@/lib/sec/normalize";
import {
  RowIndex,
  balanceAt,
  closeOnOrBefore,
  finnhubShareCount,
  historyMatchesToday,
  quarterList,
  rangeStats,
  shareCountsInWindow,
  sharesAt,
  sharesToday,
  todayFigures,
  trailingFour,
  valuationHistory,
} from "./valuation";
import { needsSplitCheck, type SplitStep } from "./splits";

import nvdaFixture from "@/lib/sec/__fixtures__/nvda-facts.json";
import aaplFixture from "@/lib/sec/__fixtures__/aapl-facts.json";
import jpmFixture from "@/lib/sec/__fixtures__/jpm-facts.json";

type Fixture = CompanyFacts & { meta: { sic: string } };
const rowsOf = (f: unknown) => {
  const fx = f as Fixture;
  return normalizeCompanyFacts(fx, { sic: fx.meta.sic }).rows;
};
const nvda = rowsOf(nvdaFixture);
const aapl = rowsOf(aaplFixture);
const jpm = rowsOf(jpmFixture);

// Weekday closes at a flat $100 from 2013, with chosen prices on the dates a
// test cares about. Adjusted for splits, like the real series.
function dailyWith(overrides: Record<string, number>): { date: string; close: number }[] {
  const out: { date: string; close: number }[] = [];
  for (let t = Date.parse("2013-01-01"); t <= Date.parse("2026-10-30"); t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const date = d.toISOString().slice(0, 10);
    out.push({ date, close: overrides[date] ?? 100 });
  }
  return out;
}

// NVIDIA's splits: 4-for-1 on 20 July 2021, 10-for-1 on 10 June 2024.
const NVDA_STEPS: SplitStep[] = [
  { from: "2013-01-01", factor: 40 },
  { from: "2021-07-20", factor: 10 },
  { from: "2024-06-10", factor: 1 },
];

describe("trailing figures", () => {
  const idx = new RowIndex(nvda);
  const quarters = quarterList(nvda);
  const q = (fy: number, fp: string) => quarters.find((x) => x.fiscalYear === fy && x.fiscalPeriod === fp)!;

  it("uses the reported full year at a fiscal year end", () => {
    expect(trailingFour(idx, "net_income", q(2026, "Q4"))).toBe(pick(nvda, "net_income", 2026)!.value);
  });

  it("adds the four quarters to any other quarter end", () => {
    const sum = ["Q2", "Q3", "Q4"].reduce((s, p) => s + pick(nvda, "revenue", 2026, p as "Q2")!.value, 0) +
      pick(nvda, "revenue", 2027, "Q1")!.value;
    expect(trailingFour(idx, "revenue", q(2027, "Q1"))).toBe(sum);
  });

  it("reads balance-sheet figures only on the quarter's own date", () => {
    expect(balanceAt(idx, "total_debt", q(2026, "Q4"))).toBe(pick(nvda, "total_debt", 2026, "Q4")!.value);
    const jIdx = new RowIndex(jpm);
    const recent = quarterList(jpm).at(-1)!;
    expect(balanceAt(jIdx, "total_debt", recent)).toBeNull();
  });
});

describe("shares at a quarter end", () => {
  const idx = new RowIndex(nvda);
  const quarters = quarterList(nvda);

  it("takes the cover of that quarter's own filing", () => {
    const q = quarters.find((x) => x.fiscalYear === 2026 && x.fiscalPeriod === "Q4")!;
    const s = sharesAt(idx, q)!;
    expect(s.source).toBe("cover");
    expect(s.basisDate).toBe("2026-02-20");
    expect(s.value / 1e9).toBeCloseTo(24.3, 1);
  });
});

describe("valuation history", () => {
  // End of April 2024 NVIDIA traded near $877 before its split, $87.70 on
  // today's basis; end of July 2024 near $113. Its market value was about
  // $2.16 trillion and $2.77 trillion.
  const daily = dailyWith({ "2024-04-26": 87.7, "2024-07-26": 113, "2026-01-23": 180 });
  const points = valuationHistory({ rows: nvda, daily, steps: NVDA_STEPS, asOf: "2026-11-01" });
  const at = (end: string) => points.find((p) => p.periodEnd === end)!;

  it("gets market value right on both sides of a split", () => {
    expect(at("2024-04-28").marketValue / 1e12).toBeCloseTo(2.16, 1);
    expect(at("2024-07-28").marketValue / 1e12).toBeCloseTo(2.77, 1);
  });

  it("would be ten times too small without the split factors", () => {
    const naive = valuationHistory({ rows: nvda, daily, steps: [], asOf: "2026-11-01" });
    const p = naive.find((x) => x.periodEnd === "2024-04-28")!;
    expect(p.marketValue / 1e12).toBeCloseTo(0.216, 2);
  });

  it("computes P/E from the trailing year: $180 x 24.3B shares / $120.1B", () => {
    expect(at("2026-01-25").pe).toBeGreaterThan(36.2);
    expect(at("2026-01-25").pe).toBeLessThan(36.7);
  });

  it("builds EV/sales from market value, debt and cash on the same date", () => {
    const p = at("2026-01-25");
    const ev = p.marketValue + pick(nvda, "total_debt", 2026, "Q4")!.value - pick(nvda, "cash_and_equivalents", 2026, "Q4")!.value;
    expect(p.evSales).toBeCloseTo(ev / pick(nvda, "revenue", 2026)!.value, 6);
  });

  it("covers about ten years of quarter ends", () => {
    expect(points.length).toBeGreaterThanOrEqual(36);
    expect(points[0].periodEnd >= "2016-11-01").toBe(true);
  });

  it("leaves EV/sales and free cash flow yield out for a bank, and gives price to book", () => {
    const j = valuationHistory({ rows: jpm, daily: dailyWith({}), steps: [], asOf: "2026-11-01" });
    expect(j.length).toBeGreaterThanOrEqual(30);
    expect(j.every((p) => p.evSales == null && p.fcfYield == null)).toBe(true);
    expect(j.filter((p) => p.pb != null).length).toBeGreaterThanOrEqual(30);
  });
});

describe("history on the same footing as today", () => {
  const daily = dailyWith({ "2026-07-24": 180 });
  const points = valuationHistory({ rows: nvda, daily, steps: NVDA_STEPS, asOf: "2026-11-01" });

  it("accepts a share count a buyback or two away", () => {
    expect(historyMatchesToday(points, daily, 24.1e9)).toBe(true);
  });

  it("rejects one measuring something else, like another share class", () => {
    expect(historyMatchesToday(points, daily, 24.1e9 * 1500)).toBe(false);
    expect(historyMatchesToday(points, daily, 24.1e9 / 10)).toBe(false);
  });
});

describe("whether to spend a request on finding splits", () => {
  it("asks for NVIDIA and Apple, which split in the last ten years", () => {
    expect(needsSplitCheck(shareCountsInWindow(nvda, "2026-11-01"), null)).toBe(true);
    expect(needsSplitCheck(shareCountsInWindow(aapl, "2026-11-01"), null)).toBe(true);
  });

  it("doesn't ask for JPMorgan, which didn't", () => {
    expect(needsSplitCheck(shareCountsInWindow(jpm, "2026-11-01"), 2.66e9)).toBe(false);
  });
});

describe("market value today", () => {
  const asOf = "2026-11-01";

  it("uses the newest cover when Finnhub broadly agrees", () => {
    const s = sharesToday({ rows: nvda, steps: [], finnhubShares: 24.3e9, asOf })!;
    expect(s.source).toBe("cover");
    expect(s.coverDate).toBe("2026-08-21");
  });

  it("uses Finnhub's count when the two are far apart", () => {
    expect(sharesToday({ rows: nvda, steps: [], finnhubShares: 241e9, asOf })!.source).toBe("finnhub");
  });

  it("ignores a cover count more than a year old", () => {
    // Berkshire's last single cover count is from 2011.
    const s = sharesToday({ rows: nvda, steps: [], finnhubShares: 24.3e9, asOf: "2028-01-01" })!;
    expect(s.source).toBe("finnhub");
    expect(s.shares).toBe(24.3e9);
  });

  it("takes Finnhub's count from its market value, in the quoted class's units", () => {
    // Berkshire, 1 November 2026: $1,162,224.81M market value, Class B at
    // $542.49, and a Finnhub share count of 1.43M (Class A equivalents).
    const profile = { marketCapMillions: 1162224.81, sharesOutstandingMillions: 1.43 };
    expect(finnhubShareCount(profile, 542.49)! / 1e9).toBeCloseTo(2.142, 3);
    expect(finnhubShareCount(profile, 815600)! / 1e6).toBeCloseTo(1.425, 3);
    expect(finnhubShareCount({ marketCapMillions: null, sharesOutstandingMillions: 24100 }, 204.64)).toBe(24.1e9);
  });

  it("falls back to Finnhub with no cover count at all", () => {
    const noCovers = nvda.filter((r) => r.lineItem !== "shares_outstanding");
    expect(sharesToday({ rows: noCovers, steps: null, finnhubShares: 12e9, asOf })).toEqual({
      shares: 12e9,
      source: "finnhub",
      coverDate: null,
    });
  });

  it("gives today's trailing figures and yields", () => {
    const t = todayFigures({ rows: nvda, price: 180, shares: 24.1e9 })!;
    expect(t.through.periodEnd).toBe("2026-07-26");
    expect(t.marketValue).toBe(180 * 24.1e9);
    expect(t.fcf! > 96.7e9).toBe(true);
    expect(t.fcfYield).toBeCloseTo(t.fcf! / t.marketValue, 10);
    expect(t.buybackYield).toBeGreaterThan(0);
  });
});

describe("rangeStats", () => {
  const values = Array.from({ length: 20 }, (_, i) => i + 1);

  it("gives min, median, max and where today sits", () => {
    expect(rangeStats(values, 15.5)).toEqual({ min: 1, max: 20, median: 10.5, count: 20, belowToday: 0.75 });
  });

  it("says nothing on fewer than three years of points", () => {
    expect(rangeStats(values.slice(0, 11), 5)).toBeNull();
  });
});

describe("closeOnOrBefore", () => {
  const daily = [
    { date: "2026-01-22", close: 1 },
    { date: "2026-01-23", close: 2 },
  ];
  it("takes the last session on or before a weekend quarter end", () => {
    expect(closeOnOrBefore(daily, "2026-01-25")).toBe(2);
  });
  it("won't reach back more than a week", () => {
    expect(closeOnOrBefore(daily, "2026-02-05")).toBeNull();
  });
});
