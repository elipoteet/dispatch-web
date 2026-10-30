import { describe, expect, it } from "vitest";
import { buildComparison } from "./compare";
import type { PriceRow } from "@/lib/providers";
import type { ReportData } from "./report";

function row(date: string, close: number): PriceRow {
  return { date, open: close, high: close, low: close, close, volume: 0 };
}

function makeReport(rows: PriceRow[]): ReportData {
  return {
    ticker: "TEST",
    name: "Test Co",
    industry: "Equity",
    price: `$${rows[rows.length - 1].close}`,
    lastPrice: rows[rows.length - 1].close,
    changeText: "+0.00 (+0.00%)",
    changeClassName: "pos",
    timestamp: "",
    keyStats: [],
    proseFundamentalsHtml: "",
    proseTechnicalsHtml: "",
    proseSentimentHtml: "",
    risksHtml: [],
    catalystHtml: "",
    news: null,
    rows,
    snapshot: {
      last: rows[rows.length - 1].close,
      w52high: Math.max(...rows.map((r) => r.close)),
      w52low: Math.min(...rows.map((r) => r.close)),
      pctFromHigh: 0,
      ma50: null,
      ma200: null,
      rsiVal: null,
      d30: null,
      d90: null,
      d365: null,
      vol: null,
      dd: 0,
      date: rows[rows.length - 1].date,
    },
  };
}

describe("buildComparison — interval performance", () => {
  it("slices rows to only the then→now interval", () => {
    const rows = [
      row("2023-06-01", 50), // before the interval — must be excluded
      row("2024-01-02", 100), // thenDate itself
      row("2024-03-01", 130),
      row("2024-06-01", 120),
    ];

    const cmp = buildComparison(makeReport(rows), "2024-01-02");
    expect(cmp.interval.startDate).toBe("2024-01-02");
    expect(cmp.interval.endDate).toBe("2024-06-01");
    expect(cmp.interval.startPrice).toBe(100);
    expect(cmp.interval.endPrice).toBe(120);
    expect(cmp.interval.totalReturnPct).toBeCloseTo(20);
    expect(cmp.interval.high).toBe(130);
    expect(cmp.interval.low).toBe(100);
  });

  it("computes the interval's own max drawdown, not a trailing-252-day one", () => {
    const rows = [
      row("2024-01-02", 100),
      row("2024-02-01", 200), // interval peak
      row("2024-03-01", 100), // 50% drawdown from the interval peak
      row("2024-06-01", 150),
    ];

    const cmp = buildComparison(makeReport(rows), "2024-01-02");
    expect(cmp.interval.maxDrawdownPct).toBeCloseTo(-50);
  });
});

describe("buildComparison — no track record", () => {
  it("returns facts about the interval and nothing that grades a past call", () => {
    const rows = [row("2024-01-02", 100), row("2024-06-01", 85)];
    const cmp = buildComparison(makeReport(rows), "2024-01-02");
    expect(Object.keys(cmp)).toEqual(["interval"]);
  });
});
