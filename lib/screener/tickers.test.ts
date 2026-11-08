import { describe, expect, it } from "vitest";
import { tickerByCik, withPredecessors } from "@/lib/screener/tickers";
import type { TickerExchangeFile } from "@/lib/sec/client";

// Rows in the order the SEC's company_tickers_exchange.json lists them
// (5 November 2026), cut down to the companies with several symbols.
const FILE: TickerExchangeFile = {
  fields: ["cik", "name", "ticker", "exchange"],
  data: [
    [1045810, "NVIDIA CORP", "NVDA", "Nasdaq"],
    [1652044, "Alphabet Inc.", "GOOGL", "Nasdaq"],
    [1067983, "BERKSHIRE HATHAWAY INC", "BRK-B", "NYSE"],
    [1754301, "Fox Corp", "FOXA", "Nasdaq"],
    [1564708, "NEWS CORP", "NWSA", "Nasdaq"],
    [1652044, "Alphabet Inc.", "GOOG", "Nasdaq"],
    [1067983, "BERKSHIRE HATHAWAY INC", "BRK-A", "NYSE"],
    [1754301, "Fox Corp", "FOX", "Nasdaq"],
    [1564708, "NEWS CORP", "NWS", "Nasdaq"],
    [1564708, "NEWS CORP", "NWSLL", "OTC"],
    [1652044, "Alphabet Inc.", "GOOGM", "Nasdaq"],
    [9999999, "SOME SHELL", "SHLL", null],
  ],
};

describe("tickerByCik", () => {
  const map = tickerByCik(FILE);

  it("takes the company's first row: the main share class", () => {
    expect(map.get(1652044)?.ticker).toBe("GOOGL");
    expect(map.get(1067983)?.ticker).toBe("BRK-B");
    expect(map.get(1754301)?.ticker).toBe("FOXA");
    expect(map.get(1564708)?.ticker).toBe("NWSA");
  });

  it("keeps the exchange, including over-the-counter and unknown", () => {
    expect(map.get(1564708)?.exchange).toBe("Nasdaq");
    expect(map.get(9999999)?.exchange).toBeNull();
  });

  it("has one entry per company", () => {
    expect(map.size).toBe(6);
  });

  it("reads columns by name, not position", () => {
    const reordered: TickerExchangeFile = {
      fields: ["ticker", "exchange", "cik", "name"],
      data: [["NVDA", "Nasdaq", 1045810, "NVIDIA CORP"] as unknown as [number, string, string, string | null]],
    };
    expect(tickerByCik(reordered).get(1045810)).toEqual({ ticker: "NVDA", exchange: "Nasdaq", name: "NVIDIA CORP" });
  });
});

describe("a ticker that moved to a new holding company", () => {
  const xom = { ticker: "XOM", exchange: "NYSE", name: "ExxonMobil Holdings Corp" };
  const listed = new Map([[2115436, xom]]);

  it("goes to the old company while only the old one has annual figures", () => {
    expect(withPredecessors(listed, (cik) => cik === 34088).get(34088)).toEqual(xom);
  });

  it("stays with the new company once it files its own", () => {
    expect(withPredecessors(listed, () => true).has(34088)).toBe(false);
  });
});
