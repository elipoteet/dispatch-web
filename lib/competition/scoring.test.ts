import { describe, expect, it } from "vitest";
import {
  computeEquityFromPrices,
  computeInvestedRatio,
  computeReturnPct,
  rankStandings,
} from "./scoring";

describe("computeEquityFromPrices", () => {
  it("sums cash plus each position's market value at the given prices", () => {
    const equity = computeEquityFromPrices(
      1000,
      [
        { ticker: "AAPL", shares: 10 },
        { ticker: "MSFT", shares: 5 },
      ],
      { AAPL: 100, MSFT: 200 },
    );
    expect(equity).toBe(1000 + 1000 + 1000);
  });

  it("returns null when any held ticker has no price", () => {
    const equity = computeEquityFromPrices(1000, [{ ticker: "AAPL", shares: 10 }], {});
    expect(equity).toBeNull();
  });

  it("returns just cash when there are no positions", () => {
    expect(computeEquityFromPrices(5000, [], {})).toBe(5000);
  });
});

describe("computeInvestedRatio", () => {
  it("is 0 when fully in cash", () => {
    expect(computeInvestedRatio(10000, 10000)).toBe(0);
  });

  it("is 1 when fully invested", () => {
    expect(computeInvestedRatio(0, 10000)).toBe(1);
  });

  it("is the positions share of equity for a mixed portfolio", () => {
    expect(computeInvestedRatio(4000, 10000)).toBeCloseTo(0.6);
  });

  it("returns 0 rather than dividing by zero when equity is zero or negative", () => {
    expect(computeInvestedRatio(0, 0)).toBe(0);
    expect(computeInvestedRatio(100, -50)).toBe(0);
  });
});

describe("computeReturnPct", () => {
  it("is 0 at the untouched starting balance", () => {
    expect(computeReturnPct(10000, 10000)).toBe(0);
  });

  it("computes a positive return", () => {
    expect(computeReturnPct(11000, 10000)).toBeCloseTo(10);
  });

  it("computes a negative return", () => {
    expect(computeReturnPct(5000, 10000)).toBeCloseTo(-50);
  });
});

describe("rankStandings", () => {
  it("ranks eligible entrants by return descending", () => {
    const ranks = rankStandings([
      { userId: "a", eligible: true, returnPct: 5, firstTradeAt: "2026-07-01T00:00:00Z" },
      { userId: "b", eligible: true, returnPct: 15, firstTradeAt: "2026-07-01T00:00:00Z" },
      { userId: "c", eligible: true, returnPct: 10, firstTradeAt: "2026-07-01T00:00:00Z" },
    ]);
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("c")).toBe(2);
    expect(ranks.get("a")).toBe(3);
  });

  it("gives ineligible entrants a null rank, excluded from the eligible ordering", () => {
    const ranks = rankStandings([
      { userId: "a", eligible: true, returnPct: 5, firstTradeAt: "2026-07-01T00:00:00Z" },
      { userId: "b", eligible: false, returnPct: 50, firstTradeAt: "2026-07-01T00:00:00Z" },
    ]);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("b")).toBeNull();
  });

  it("breaks a tied return by earlier first trade", () => {
    const ranks = rankStandings([
      { userId: "late", eligible: true, returnPct: 10, firstTradeAt: "2026-07-15T00:00:00Z" },
      { userId: "early", eligible: true, returnPct: 10, firstTradeAt: "2026-07-01T00:00:00Z" },
    ]);
    expect(ranks.get("early")).toBe(1);
    expect(ranks.get("late")).toBe(2);
  });

  it("treats a null firstTradeAt as the latest possible (loses every tiebreak)", () => {
    const ranks = rankStandings([
      { userId: "noTrade", eligible: true, returnPct: 10, firstTradeAt: null },
      { userId: "hasTrade", eligible: true, returnPct: 10, firstTradeAt: "2026-07-20T00:00:00Z" },
    ]);
    expect(ranks.get("hasTrade")).toBe(1);
    expect(ranks.get("noTrade")).toBe(2);
  });
});
