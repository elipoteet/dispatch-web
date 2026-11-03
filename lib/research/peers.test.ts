// Review of 2 November 2026, mistake 5: a peer without figures always read "No
// current price", even ExxonMobil, which had a price but no filings yet under
// its new 2026 SEC registration; and its name came out "Exxonmobil".

import { describe, expect, it } from "vitest";
import { peerMissing, peerName } from "./peers";
import type { SharesToday, TodayFigures } from "./valuation";

const shares: SharesToday = { shares: 4.08e9, source: "finnhub", coverDate: null };

describe("peerMissing: what a peer without figures lacks", () => {
  it("says nothing is missing when there are figures", () => {
    expect(peerMissing({ price: 180, rowCount: 400, shares, figures: {} as TodayFigures })).toBeNull();
  });

  it("names a missing price only when the price is missing", () => {
    expect(peerMissing({ price: null, rowCount: 400, shares, figures: null })).toBe("price");
  });

  it("names missing filings for a company with a price but nothing filed (ExxonMobil, November 2026)", () => {
    expect(peerMissing({ price: 179.67, rowCount: 0, shares, figures: null })).toBe("filings");
  });

  it("names a missing share count, and a year of quarters not yet filed", () => {
    expect(peerMissing({ price: 50, rowCount: 120, shares: null, figures: null })).toBe("shares");
    expect(peerMissing({ price: 50, rowCount: 3, shares, figures: null })).toBe("trailing");
  });
});

describe("peerName: the company's own spelling", () => {
  it("keeps the SEC's mixed-case name over Finnhub's", () => {
    expect(peerName("ExxonMobil Holdings Corp", "Exxonmobil Holdings Corp")).toBe("ExxonMobil Holdings Corp");
  });

  it("takes Finnhub's when the SEC has only capitals", () => {
    expect(peerName("CHEVRON CORP", "Chevron Corp")).toBe("Chevron Corp");
  });

  it("title-cases the SEC's capitals when Finnhub has nothing", () => {
    expect(peerName("CHEVRON CORP", null)).toBe("Chevron Corp");
  });
});
