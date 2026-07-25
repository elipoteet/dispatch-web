import { describe, expect, it } from "vitest";
import { buildComparison } from "./compare";
import type { PriceRow } from "@/lib/providers";
import type { ReportData, ScorecardRow } from "./report";

function row(date: string, close: number): PriceRow {
  return { date, open: close, high: close, low: close, close, volume: 0 };
}

function makeReport(overrides: {
  ticker?: string;
  rating?: string;
  ratingClass?: "buy" | "hold" | "sell";
  composite?: number;
  scorecard: ScorecardRow[];
  rows: PriceRow[];
}): ReportData {
  const { ticker = "TEST", rating = "Hold", ratingClass = "hold", composite = 5, scorecard, rows } = overrides;
  return {
    ticker,
    name: "Test Co",
    industry: "Equity",
    price: `$${rows[rows.length - 1].close}`,
    lastPrice: rows[rows.length - 1].close,
    changeText: "+0.00 (+0.00%)",
    changeClassName: "pos",
    rating,
    ratingClass,
    composite,
    timestamp: "",
    keyStats: [],
    scorecard,
    proseFundamentalsHtml: "",
    proseTechnicalsHtml: "",
    proseSentimentHtml: "",
    proseVerdictHtml: "",
    risksHtml: [],
    catalystHtml: "",
    news: null,
    rows,
    snapshot: {
      last: rows[rows.length - 1].close,
      rating,
      ratingClass,
      composite,
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

describe("buildComparison — score deltas", () => {
  it("marks the null-fundamentals case as unavailable, not a zero delta", () => {
    const thenReport = makeReport({
      scorecard: [
        { name: "Fundamentals", score: null, signal: "" },
        { name: "Technicals", score: 4, signal: "" },
        { name: "Sentiment / News", score: 6, signal: "" },
        { name: "Composite", score: 5, signal: "", isComposite: true },
      ],
      rows: [row("2024-01-02", 100)],
    });
    const nowReport = makeReport({
      scorecard: [
        { name: "Fundamentals", score: 7, signal: "" },
        { name: "Technicals", score: 7, signal: "" },
        { name: "Sentiment / News", score: 6, signal: "" },
        { name: "Composite", score: 7, signal: "", isComposite: true },
      ],
      rows: [row("2024-01-02", 100), row("2024-06-01", 110)],
    });

    const cmp = buildComparison(thenReport, nowReport, "2024-01-02");
    const fundamentals = cmp.scoreDeltas.find((d) => d.name === "Fundamentals")!;
    expect(fundamentals.thenScore).toBeNull();
    expect(fundamentals.delta).toBeNull();
  });

  it("sorts by size of change (biggest first), keeps Composite last, and identifies the top mover", () => {
    const thenReport = makeReport({
      scorecard: [
        { name: "Fundamentals", score: null, signal: "" },
        { name: "Technicals", score: 4, signal: "" },
        { name: "Sentiment / News", score: 6, signal: "" },
        { name: "Composite", score: 5, signal: "", isComposite: true },
      ],
      rows: [row("2024-01-02", 100)],
    });
    const nowReport = makeReport({
      scorecard: [
        { name: "Fundamentals", score: 7, signal: "" },
        { name: "Technicals", score: 7, signal: "" },
        { name: "Sentiment / News", score: 6, signal: "" },
        { name: "Composite", score: 7, signal: "", isComposite: true },
      ],
      rows: [row("2024-01-02", 100), row("2024-06-01", 110)],
    });

    const cmp = buildComparison(thenReport, nowReport, "2024-01-02");
    expect(cmp.scoreDeltas.map((d) => d.name)).toEqual(["Technicals", "Sentiment / News", "Fundamentals", "Composite"]);
    expect(cmp.scoreDeltas[cmp.scoreDeltas.length - 1].isComposite).toBe(true);
    expect(cmp.topMover).toBe("Technicals");
  });

  it("matches the composite delta to the composite each column already displays", () => {
    const thenReport = makeReport({
      composite: 5,
      scorecard: [
        { name: "Fundamentals", score: null, signal: "" },
        { name: "Technicals", score: 4, signal: "" },
        { name: "Sentiment / News", score: 6, signal: "" },
        { name: "Composite", score: 5, signal: "", isComposite: true },
      ],
      rows: [row("2024-01-02", 100)],
    });
    const nowReport = makeReport({
      composite: 7,
      scorecard: [
        { name: "Fundamentals", score: 9, signal: "" },
        { name: "Technicals", score: 7, signal: "" },
        { name: "Sentiment / News", score: 6, signal: "" },
        { name: "Composite", score: 7, signal: "", isComposite: true },
      ],
      rows: [row("2024-01-02", 100), row("2024-06-01", 110)],
    });

    const cmp = buildComparison(thenReport, nowReport, "2024-01-02");
    const composite = cmp.scoreDeltas.find((d) => d.isComposite)!;
    // Must equal ReportData.composite on each side — the same number the
    // Then/Now columns already show — not a recomputed average.
    expect(composite.thenScore).toBe(5);
    expect(composite.nowScore).toBe(7);
    expect(composite.delta).toBe(2);
    // But since "then" excludes Fundamentals (null as-of that date) while
    // "now" includes it, that non-like-for-like comparison must be flagged.
    expect(composite.note).toMatch(/excludes Fundamentals/);
  });

  it("does not flag the composite note when every dimension was valid on both dates", () => {
    const scorecard: ScorecardRow[] = [
      { name: "Fundamentals", score: 5, signal: "" },
      { name: "Technicals", score: 6, signal: "" },
      { name: "Sentiment / News", score: 6, signal: "" },
      { name: "Composite", score: 6, signal: "", isComposite: true },
    ];
    const thenReport = makeReport({ composite: 6, scorecard, rows: [row("2024-01-02", 100)] });
    const nowReport = makeReport({
      composite: 7,
      scorecard,
      rows: [row("2024-01-02", 100), row("2024-06-01", 110)],
    });

    const cmp = buildComparison(thenReport, nowReport, "2024-01-02");
    const composite = cmp.scoreDeltas.find((d) => d.isComposite)!;
    expect(composite.note).toBeUndefined();
  });

  it("does not treat an unchanged dimension as unavailable", () => {
    const scorecardFor = (techScore: number): ScorecardRow[] => [
      { name: "Fundamentals", score: 5, signal: "" },
      { name: "Technicals", score: techScore, signal: "" },
      { name: "Sentiment / News", score: 6, signal: "" },
      { name: "Composite", score: 5, signal: "", isComposite: true },
    ];
    const thenReport = makeReport({ scorecard: scorecardFor(6), rows: [row("2024-01-02", 100)] });
    const nowReport = makeReport({
      scorecard: scorecardFor(6),
      rows: [row("2024-01-02", 100), row("2024-06-01", 100)],
    });

    const cmp = buildComparison(thenReport, nowReport, "2024-01-02");
    const sentiment = cmp.scoreDeltas.find((d) => d.name === "Sentiment / News")!;
    expect(sentiment.thenScore).toBe(6);
    expect(sentiment.delta).toBe(0);
    expect(cmp.topMover).toBeNull();
  });
});

describe("buildComparison — interval performance", () => {
  const scorecard: ScorecardRow[] = [
    { name: "Fundamentals", score: 5, signal: "" },
    { name: "Technicals", score: 5, signal: "" },
    { name: "Sentiment / News", score: 5, signal: "" },
    { name: "Composite", score: 5, signal: "", isComposite: true },
  ];

  it("slices rows to only the then→now interval", () => {
    const rows = [
      row("2023-06-01", 50), // before the interval — must be excluded
      row("2024-01-02", 100), // thenDate itself
      row("2024-03-01", 130),
      row("2024-06-01", 120),
    ];
    const thenReport = makeReport({ scorecard, rows: rows.slice(0, 2) });
    const nowReport = makeReport({ scorecard, rows });

    const cmp = buildComparison(thenReport, nowReport, "2024-01-02");
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
    const thenReport = makeReport({ scorecard, rows: rows.slice(0, 1) });
    const nowReport = makeReport({ scorecard, rows });

    const cmp = buildComparison(thenReport, nowReport, "2024-01-02");
    expect(cmp.interval.maxDrawdownPct).toBeCloseTo(-50);
  });
});

describe("buildComparison — verdict", () => {
  const scorecard: ScorecardRow[] = [
    { name: "Fundamentals", score: 5, signal: "" },
    { name: "Technicals", score: 5, signal: "" },
    { name: "Sentiment / News", score: 5, signal: "" },
    { name: "Composite", score: 5, signal: "", isComposite: true },
  ];

  function interval(thenClose: number, nowClose: number, ratingClass: "buy" | "hold" | "sell", rating: string) {
    const rows = [row("2024-01-02", thenClose), row("2024-06-01", nowClose)];
    const thenReport = makeReport({ scorecard, rows: rows.slice(0, 1), ratingClass, rating });
    const nowReport = makeReport({ scorecard, rows });
    return buildComparison(thenReport, nowReport, "2024-01-02");
  }

  it("vindicates a buy rating that rose materially", () => {
    const cmp = interval(100, 120, "buy", "Accumulate");
    expect(cmp.verdictTone).toBe("pos");
    expect(cmp.verdict).toMatch(/held up/);
  });

  it("flags a buy rating that fell materially as wrong", () => {
    const cmp = interval(100, 85, "buy", "Buy");
    expect(cmp.verdictTone).toBe("neg");
    expect(cmp.verdict).toMatch(/hasn't held up/);
  });

  it("credits a sell rating that fell as correctly cautious", () => {
    const cmp = interval(100, 90, "sell", "Sell");
    expect(cmp.verdictTone).toBe("pos");
    expect(cmp.verdict).toMatch(/proved correct/);
  });

  it("flags a sell rating that rose materially as having missed the rebound", () => {
    const cmp = interval(100, 115, "sell", "Reduce");
    expect(cmp.verdictTone).toBe("neg");
    expect(cmp.verdict).toMatch(/missed the rebound/);
  });

  it("calls a flat move consistent with a hold rating", () => {
    const cmp = interval(100, 105, "hold", "Hold");
    expect(cmp.verdictTone).toBe("neutral");
    expect(cmp.verdict).toMatch(/wait-and-see/);
  });

  it("notes when a hold rating undersold a big move", () => {
    const cmp = interval(100, 130, "hold", "Hold");
    expect(cmp.verdict).toMatch(/bigger move than a Hold call anticipated/);
  });
});
