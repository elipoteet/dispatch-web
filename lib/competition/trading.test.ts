import { describe, expect, it } from "vitest";
import { computeCompetitionSummary, type CompetitionAccount, type CompetitionPositionView } from "./trading";

function account(overrides: Partial<CompetitionAccount> = {}): CompetitionAccount {
  return { cash: 10000, startingBalance: 10000, firstTradeAt: null, createdAt: "2026-07-01T00:00:00Z", ...overrides };
}

function position(overrides: Partial<CompetitionPositionView> = {}): CompetitionPositionView {
  return {
    ticker: "AAPL",
    shares: 10,
    avgCost: 100,
    currentPrice: 100,
    isStale: false,
    marketValue: 1000,
    costBasis: 1000,
    unrealizedPL: 0,
    unrealizedPLPct: 0,
    ...overrides,
  };
}

describe("computeCompetitionSummary", () => {
  it("returns 0% at the untouched starting balance", () => {
    const summary = computeCompetitionSummary(account({ cash: 10000 }), []);
    expect(summary.equity).toBe(10000);
    expect(summary.returnPct).toBe(0);
  });

  it("computes return against the fixed $10,000 base, not whatever cash happens to be", () => {
    const summary = computeCompetitionSummary(
      account({ cash: 5000 }),
      [position({ marketValue: 6000 })],
    );
    expect(summary.equity).toBe(11000);
    expect(summary.returnPct).toBeCloseTo(10); // (11000 - 10000) / 10000 * 100
  });

  it("reflects a loss as a negative return", () => {
    const summary = computeCompetitionSummary(
      account({ cash: 2000 }),
      [position({ marketValue: 3000 })],
    );
    expect(summary.equity).toBe(5000);
    expect(summary.returnPct).toBeCloseTo(-50);
  });

  it("sums multiple positions into positionsValue", () => {
    const summary = computeCompetitionSummary(account({ cash: 1000 }), [
      position({ ticker: "AAPL", marketValue: 2000 }),
      position({ ticker: "MSFT", marketValue: 3000 }),
    ]);
    expect(summary.positionsValue).toBe(5000);
    expect(summary.equity).toBe(6000);
  });
});
