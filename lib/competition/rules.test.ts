import { describe, expect, it } from "vitest";
import { checkEligibility, computeLargestPositionPct, MAX_POSITION_PCT } from "./rules";

function baseInput() {
  return {
    tradeCount: 3,
    distinctTickerCount: 2,
    dailyParticipation: [{ investedRatio: 0.6 }, { investedRatio: 0.7 }],
  };
}

describe("checkEligibility", () => {
  it("is eligible when every threshold is met", () => {
    const result = checkEligibility(baseInput());
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("flags too few trades", () => {
    const result = checkEligibility({ ...baseInput(), tradeCount: 2 });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("3 trades"))).toBe(true);
  });

  it("flags too few distinct tickers even with enough trades", () => {
    const result = checkEligibility({ ...baseInput(), tradeCount: 5, distinctTickerCount: 1 });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("2 different tickers"))).toBe(true);
  });

  it("flags not being invested enough of the time", () => {
    const result = checkEligibility({
      ...baseInput(),
      dailyParticipation: [{ investedRatio: 0.1 }, { investedRatio: 0.2 }, { investedRatio: 0.6 }],
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("invested"))).toBe(true);
  });

  it("does not fail the invested-ratio rule when exactly half the days qualify", () => {
    // 2 of 4 days at >=50% invested is exactly the 50% threshold, not below it.
    const result = checkEligibility({
      ...baseInput(),
      dailyParticipation: [
        { investedRatio: 0.5 },
        { investedRatio: 0.5 },
        { investedRatio: 0.1 },
        { investedRatio: 0.1 },
      ],
    });
    expect(result.eligible).toBe(true);
  });

  it("has nothing to say about invested-ratio on the very first day (no history yet)", () => {
    const result = checkEligibility({ ...baseInput(), dailyParticipation: [] });
    expect(result.reasons.some((r) => r.includes("invested"))).toBe(false);
  });

  it("can report multiple failing reasons at once", () => {
    const result = checkEligibility({
      tradeCount: 1,
      distinctTickerCount: 1,
      dailyParticipation: [{ investedRatio: 0 }],
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("MAX_POSITION_PCT is currently disabled (null), so an all-in position is not itself flagged", () => {
    expect(MAX_POSITION_PCT).toBeNull();
    const result = checkEligibility({
      ...baseInput(),
      positions: [{ marketValue: 10000 }],
      equity: 10000,
    });
    expect(result.eligible).toBe(true);
  });
});

describe("computeLargestPositionPct", () => {
  it("returns the largest position's share of equity", () => {
    const pct = computeLargestPositionPct([{ marketValue: 3000 }, { marketValue: 7000 }], 10000);
    expect(pct).toBeCloseTo(0.7);
  });

  it("returns 0 for no positions", () => {
    expect(computeLargestPositionPct([], 10000)).toBe(0);
  });

  it("returns 0 when equity is zero or negative (avoids a divide-by-zero)", () => {
    expect(computeLargestPositionPct([{ marketValue: 100 }], 0)).toBe(0);
    expect(computeLargestPositionPct([{ marketValue: 100 }], -50)).toBe(0);
  });
});
