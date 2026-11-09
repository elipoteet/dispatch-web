import { describe, expect, it } from "vitest";
import { SECTOR_CORRECTIONS, sectorFor } from "@/lib/screener/sectorCorrections";
import { SECTORS, sectorFromSic } from "@/lib/screener/sectors";

describe("hand-checked sectors", () => {
  it("files the companies Eli named where the standard classification does", () => {
    expect(sectorFor("0001403161", "7389")).toBe("Financials"); // Visa
    expect(sectorFor("0001141391", "7389")).toBe("Financials"); // Mastercard
    expect(sectorFor("0000707549", "3559")).toBe("Technology"); // Lam Research
    expect(sectorFor("0001405495", "6794")).toBe("Technology"); // InterDigital
    expect(sectorFor("0001099590", "7389")).toBe("Consumer discretionary"); // MercadoLibre
    expect(sectorFor("0001324424", "4700")).toBe("Consumer discretionary"); // Expedia
    expect(sectorFor("0001559720", "7340")).toBe("Consumer discretionary"); // Airbnb
  });

  it("falls back to SIC for everyone else", () => {
    expect(sectorFor("0000320193", "3571")).toBe(sectorFromSic("3571"));
    expect(sectorFor("0000000001", null)).toBeNull();
  });

  it("holds only real corrections, by ten-digit CIK, to one of the eleven sectors", () => {
    for (const [cik, c] of SECTOR_CORRECTIONS) {
      expect(cik).toMatch(/^\d{10}$/);
      expect(SECTORS).toContain(c.sector);
      expect(c.ticker).toMatch(/^[A-Z.-]+$/);
    }
    const tickers = [...SECTOR_CORRECTIONS.values()].map((c) => c.ticker);
    expect(new Set(tickers).size).toBe(tickers.length);
  });
});
