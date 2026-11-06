import { describe, expect, it } from "vitest";
import {
  applyNetIncomeFix,
  companyNameFor,
  needsAnnualReportFix,
  profileRow,
  reusableFix,
  screenerRow,
  minPublishRows,
  publishDecision,
  type NetIncomeFix,
} from "@/lib/screener/rows";
import type { Assembled, CompanyYear, Picked } from "@/lib/screener/assemble";
import { computeMetrics, METRICS } from "@/lib/screener/metrics";

const p = (val: number, accn: string, tag = "Tag", end = "2025-12-31"): Picked => ({ val, end, tag, accn });

function year(values: CompanyYear["values"], inconsistent: CompanyYear["inconsistent"] = [], end = "2025-12-31"): CompanyYear {
  return { periodStart: "2025-01-01", periodEnd: end, values, inconsistent };
}

// Tesla's 2025, as the frames give it: revenue and cash flow from the 10-K,
// net income from the proxy statement filed in October 2026.
const TESLA = year({
  revenue: p(94_827_000_000, "10K-2026"),
  operating_cash_flow: p(15_000_000_000, "10K-2026"),
  net_income: p(3_855_000_000, "DEF14A-2026", "NetIncomeLoss"),
});

describe("companyNameFor", () => {
  it("keeps the frames' name when it is the registrant's name written differently", () => {
    expect(companyNameFor("A. O. Smith Corporation", "SMITH A O CORP")).toBe("A. O. Smith Corporation");
    expect(companyNameFor("W. R. BERKLEY CORP", "BERKLEY W R CORP")).toBe("W. R. BERKLEY CORP");
    expect(companyNameFor("McDONALD’S CORPORATION", "MCDONALDS CORP")).toBe("McDONALD’S CORPORATION");
    expect(companyNameFor("COLGATE-PALMOLIVE COMPANY", "COLGATE PALMOLIVE CO")).toBe("COLGATE-PALMOLIVE COMPANY");
    expect(companyNameFor("ELI LILLY AND COMPANY", "ELI LILLY & Co")).toBe("ELI LILLY AND COMPANY");
    expect(companyNameFor("The TJX Companies, Inc.", "TJX COMPANIES INC /DE/")).toBe("The TJX Companies, Inc.");
    expect(companyNameFor("Vantage Corp", "Vantage Corp (Singapore)")).toBe("Vantage Corp");
  });

  it("takes the registrant's name over a co-filer's or an old one", () => {
    expect(companyNameFor("BofA Finance LLC", "BANK OF AMERICA CORP /DE/")).toBe("BANK OF AMERICA CORP /DE/");
    expect(companyNameFor("SKK Holdings Limited", "Rantizo")).toBe("Rantizo");
    expect(companyNameFor("FRANKLIN RESOURCES, INC.", "FRANKLIN TEMPLETON INC")).toBe("FRANKLIN TEMPLETON INC");
  });

  it("falls back to the frames' name with no profile", () => {
    expect(companyNameFor("NVIDIA CORP", null)).toBe("NVIDIA CORP");
    expect(companyNameFor("NVIDIA CORP", "  ")).toBe("NVIDIA CORP");
  });
});

describe("needsAnnualReportFix", () => {
  it("is needed when net income came from another filing than cash flow", () => {
    expect(needsAnnualReportFix(TESLA)).toBe(true);
  });

  it("isn't needed when it all came from the 10-K", () => {
    expect(needsAnnualReportFix(year({ revenue: p(1, "K"), operating_cash_flow: p(1, "K"), net_income: p(1, "K") }))).toBe(false);
  });

  it("is needed when the units rules left net income n/a", () => {
    expect(needsAnnualReportFix(year({ revenue: p(1, "K") }, ["net_income"]))).toBe(true);
    expect(needsAnnualReportFix(null)).toBe(false);
  });
});

describe("applyNetIncomeFix", () => {
  const company: Assembled = {
    cik: 1318605,
    name: "Tesla, Inc.",
    latest: TESLA,
    prior: null,
    balance: {},
    revenueHistory: [],
    revenueHistoryInconsistent: [],
  };
  const fix: NetIncomeFix = { frames: "DEF14A-2026", end: "2025-12-31", val: 3_794_000_000, accn: "10K-2026" };

  it("puts the 10-K's figure in place of the proxy's", () => {
    const fixed = applyNetIncomeFix(company, "NetIncomeLoss", fix);
    expect(fixed.latest.values.net_income).toEqual({ val: 3_794_000_000, end: "2025-12-31", tag: "NetIncomeLoss", accn: "10K-2026" });
    expect(company.latest.values.net_income?.val).toBe(3_855_000_000); // the original is untouched
  });

  it("clears an n/a the units rules left, now the 10-K has spoken", () => {
    const fixed = applyNetIncomeFix({ ...company, latest: year({ revenue: p(1, "K") }, ["net_income"]) }, "NetIncomeLoss", fix);
    expect(fixed.latest.inconsistent).toEqual([]);
    expect(fixed.latest.values.net_income?.val).toBe(3_794_000_000);
  });

  it("keeps the frames figure when the 10-K has none under that tag, and remembers that", () => {
    const none: NetIncomeFix = { frames: "DEF14A-2026", end: "2025-12-31", val: null, accn: null };
    expect(applyNetIncomeFix(company, "NetIncomeLoss", none).latest.values.net_income?.val).toBe(3_855_000_000);
    expect(reusableFix(none, TESLA)).toBe(none);
  });

  it("ignores a fix for another year", () => {
    expect(applyNetIncomeFix(company, "NetIncomeLoss", { ...fix, end: "2024-12-31" }).latest.values.net_income?.val).toBe(3_855_000_000);
  });
});

describe("reusableFix", () => {
  const fix: NetIncomeFix = { frames: "DEF14A-2026", end: "2025-12-31", val: 3_794_000_000, accn: "10K-2026" };
  it("reuses last night's answer while the frames still hold the same filing", () => {
    expect(reusableFix(fix, TESLA)).toBe(fix);
  });
  it("asks again once the frames hold a newer filing or year", () => {
    expect(reusableFix(fix, year({ net_income: p(1, "DEF14A-2027") }))).toBeUndefined();
    expect(reusableFix(fix, year({ net_income: p(1, "DEF14A-2026") }, [], "2026-12-31"))).toBeUndefined();
  });
});

describe("screenerRow", () => {
  const company: Assembled = {
    cik: 1045810,
    name: "NVIDIA CORPORATION",
    latest: year(
      {
        revenue: p(215_938e6, "K", "Revenues"),
        net_income: p(120_067e6, "K", "NetIncomeLoss"),
        operating_cash_flow: p(102_718e6, "K"),
        capex: p(6_042e6, "K"),
      },
      [],
      "2026-01-25",
    ),
    prior: null,
    balance: { cash_and_equivalents: p(10_605e6, "Q", "CashAndCashEquivalentsAtCarryingValue", "2026-01-25") },
    revenueHistory: [],
    revenueHistoryInconsistent: [],
  };
  const profile = profileRow(
    { cik: "0001045810", name: "NVIDIA CORP", sic: "3674", sicDescription: "Semiconductors", state: "CA", fiscalYearEnd: "0131", entityType: "operating", tickers: ["NVDA"], exchanges: ["Nasdaq"] },
    "2026-11-05T00:00:00Z",
  );
  const metrics = computeMetrics(company, "operating");
  const row = screenerRow({ company, ticker: "NVDA", exchange: "Nasdaq", profile, kind: "operating", metrics, fixes: {}, updatedAt: "2026-11-06T09:00:00Z" });

  it("has every column of screener_metrics", () => {
    for (const key of METRICS) expect(row).toHaveProperty(key);
    for (const key of ["cik", "ticker", "exchange", "name", "sector", "sic", "filer_kind", "state", "period_start", "period_end", "fiscal_year_end", "net_income", "free_cash_flow", "pays_dividend", "na_reasons", "sources", "updated_at"]) {
      expect(row).toHaveProperty(key);
    }
  });

  it("fills them from the company, its profile and its measures", () => {
    expect(row).toMatchObject({
      cik: "0001045810",
      ticker: "NVDA",
      sector: "Technology",
      state: "CA",
      period_end: "2026-01-25",
      revenue: 215_938e6,
      free_cash_flow: 96_676e6,
    });
    expect((row.sources as Record<string, unknown>).revenue).toEqual(["Revenues", "K"]);
  });
});

describe("publishDecision", () => {
  it("publishes a complete run that staged nearly as many rows as are showing", () => {
    expect(publishDecision({ framesComplete: true, staged: 4_600, showingNow: 4_650 })).toEqual({ publish: true, reason: null });
    expect(publishDecision({ framesComplete: true, staged: 900, showingNow: 0 }).publish).toBe(true);
  });

  it("keeps the last complete set after a failed download or a short run", () => {
    expect(publishDecision({ framesComplete: false, staged: 4_650, showingNow: 4_650 }).publish).toBe(false);
    expect(publishDecision({ framesComplete: true, staged: 1_000, showingNow: 4_650 })).toEqual({ publish: false, reason: "only 1000 rows staged against 4650 showing" });
  });

  it("asks the database to check at least nine in ten again", () => {
    expect(minPublishRows(4_650)).toBe(4_185);
    expect(minPublishRows(0)).toBe(1);
  });
});
