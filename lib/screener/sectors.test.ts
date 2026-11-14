import { describe, expect, it } from "vitest";
import { SECTORS, sectorFromSic } from "@/lib/screener/sectors";

// SIC codes from each company's own submissions file, 5 November 2026.
const KNOWN: [string, string, string][] = [
  ["NVDA", "3674", "Technology"],
  ["AAPL", "3571", "Technology"],
  ["MSFT", "7372", "Technology"],
  ["GOOGL", "7370", "Technology"],
  ["META", "7370", "Technology"],
  ["AVGO", "3674", "Technology"],
  ["AMZN", "5961", "Consumer discretionary"],
  ["TSLA", "3711", "Consumer discretionary"],
  ["RIVN", "3711", "Consumer discretionary"],
  ["MCD", "5812", "Consumer discretionary"],
  ["JPM", "6021", "Financials"],
  ["UNH", "6324", "Health care"],
  ["JNJ", "2834", "Health care"],
  ["LLY", "2834", "Health care"],
  ["WMT", "5331", "Consumer staples"],
  ["COST", "5331", "Consumer staples"],
  ["PG", "2840", "Consumer staples"],
  ["KO", "2080", "Consumer staples"],
  ["XOM", "2911", "Energy"],
  ["CVX", "2911", "Energy"],
  ["CAT", "3531", "Industrials"],
  ["VZ", "4813", "Communication"],
  ["O", "6798", "Real estate"],
];

describe("sectorFromSic", () => {
  it.each(KNOWN)("%s (%s) is %s", (_symbol, sic, sector) => {
    expect(sectorFromSic(sic)).toBe(sector);
  });

  it("files blank-check companies under Other, not Financials", () => {
    expect(sectorFromSic("6770")).toBe("Other");
  });

  it("says nothing rather than guessing when there is no SIC", () => {
    expect(sectorFromSic(null)).toBeNull();
    expect(sectorFromSic("")).toBeNull();
  });

  it("returns only the eleven sectors or Other", () => {
    const allowed = new Set<string>([...SECTORS, "Other"]);
    for (let sic = 100; sic <= 9999; sic++) expect(allowed.has(sectorFromSic(sic)!)).toBe(true);
  });

  // Every SIC code held by a company in the screener on 5 November 2026 (from
  // the full profile download in Stage A) maps to a named sector, apart from
  // blank checks and the SEC's non-operating codes.
  it.each([
    ["7600", "Industrials"], // miscellaneous repair services
    ["8111", "Industrials"], // legal services
    ["3812", "Industrials"], // defense electronics
    ["3826", "Health care"], // laboratory instruments
    ["4922", "Energy"], // natural gas transmission
    ["4953", "Industrials"], // refuse systems
    ["5311", "Consumer discretionary"], // department stores
    ["8731", "Health care"], // biological research
  ])("%s is %s", (sic, sector) => {
    expect(sectorFromSic(sic)).toBe(sector);
  });

  it("files the SEC's non-operating codes under Other", () => {
    expect(sectorFromSic("9995")).toBe("Other");
    expect(sectorFromSic("8880")).toBe("Other");
  });

  it("uses exactly eleven named sectors", () => {
    expect(SECTORS).toHaveLength(11);
  });
});
