// The capex fallback, against Finnhub's real as-reported response for NVIDIA.
//
// Every expected figure below was read out of the cash-flow statement of the
// matching 10-K on EDGAR, not copied from Finnhub — so this test compares two
// independent sources and fails if either drifts.

import { describe, expect, it } from "vitest";
import {
  findCapexInFiling,
  indexAnnualFilings,
  mergeCapexFromFilings,
  yearsMissingCapex,
} from "@/lib/sec/capexFallback";
import type { FinancialsReportedFiling } from "@/lib/providers";
import fixture from "@/lib/sec/__fixtures__/nvda-finnhub-annual.json";

const filings = (fixture as { data: FinancialsReportedFiling[] }).data;

// Fiscal year end -> capital expenditure, as printed in that year's 10-K.
// NVIDIA's fiscal years end in late January, so fiscal 2017 ends 2017-01-29.
const FROM_THE_10K: Record<string, number> = {
  "2017-01-29": 176_000_000,
  "2018-01-28": 593_000_000,
  "2019-01-27": 600_000_000,
  "2020-01-26": 489_000_000,
  "2021-01-31": 1_128_000_000,
};

describe("capex recovered from the filings, for the years companyfacts has none", () => {
  const byEnd = indexAnnualFilings(filings);

  for (const [periodEnd, expected] of Object.entries(FROM_THE_10K)) {
    it(`matches the 10-K for the year ending ${periodEnd}`, () => {
      const match = byEnd.get(periodEnd);
      expect(match, `no confident capex match for ${periodEnd}`).toBeTruthy();
      expect(match!.value).toBe(expected);
    });
  }

  it("picks the real capex line and not the financing repayment beside it", () => {
    // NVIDIA's fiscal 2021 cash-flow statement carries two lines mentioning
    // property and equipment: the $1,128M purchase and a $17M principal payment
    // on financed equipment. Matching loosely would swap one for the other.
    const match = byEnd.get("2021-01-31")!;
    expect(match.value).toBe(1_128_000_000);
    expect(match.label.toLowerCase()).toContain("purchas");
    expect(match.label.toLowerCase()).not.toContain("principal");
  });

  it("keeps the filing's own concept, which is why companyfacts had nothing", () => {
    // A company extension tag — not part of the standard taxonomy the SEC's
    // companyfacts API serves, which is the entire reason this fallback exists.
    const match = byEnd.get("2021-01-31")!;
    expect(match.concept).toMatch(/^nvda[_:]/i);
  });
});

describe("refusing to guess", () => {
  const base: FinancialsReportedFiling = {
    filedDate: "2021-03-01",
    endDate: "2021-01-31",
    form: "10-K",
    report: { cf: [] },
  };

  it("returns nothing when no line looks like capital expenditure", () => {
    expect(findCapexInFiling({ ...base, report: { cf: [{ concept: "x", label: "Net income", value: 5 }] } })).toBeNull();
  });

  it("returns nothing when two lines both look like it", () => {
    const ambiguous: FinancialsReportedFiling = {
      ...base,
      report: {
        cf: [
          { concept: "a", label: "Purchases of property and equipment", value: 100 },
          { concept: "b", label: "Additions to property, plant and equipment", value: 200 },
        ],
      },
    };
    // Two plausible readings is a reason to show a blank, not to pick one.
    expect(findCapexInFiling(ambiguous)).toBeNull();
  });

  it("ignores proceeds from selling assets", () => {
    const sale: FinancialsReportedFiling = {
      ...base,
      report: { cf: [{ concept: "a", label: "Proceeds from sale of property and equipment", value: 50 }] },
    };
    expect(findCapexInFiling(sale)).toBeNull();
  });

  it("ignores buying whole businesses", () => {
    const acquisition: FinancialsReportedFiling = {
      ...base,
      report: { cf: [{ concept: "a", label: "Acquisition of business, net of cash acquired", value: 900 }] },
    };
    expect(findCapexInFiling(acquisition)).toBeNull();
  });

  it("reports an outflow filed as a negative number as a positive figure", () => {
    // Capex is positive everywhere else in this codebase, so free cash flow stays
    // operating cash flow minus capex regardless of how a filer signs it.
    const negative: FinancialsReportedFiling = {
      ...base,
      report: { cf: [{ concept: "a", label: "Purchases of property and equipment", value: -250 }] },
    };
    expect(findCapexInFiling(negative)!.value).toBe(250);
  });

  it("skips filings that are not annual reports", () => {
    const eightK: FinancialsReportedFiling = {
      ...base,
      form: "8-K",
      report: { cf: [{ concept: "a", label: "Purchases of property and equipment", value: 100 }] },
    };
    expect(indexAnnualFilings([eightK]).size).toBe(0);
  });
});

describe("the two sources together, for NVIDIA's gap years", () => {
  it("turns five years of missing capex into capex and free cash flow", async () => {
    const { normalizeCompanyFacts, pick } = await import("@/lib/sec/normalize");
    const secFacts = (await import("@/lib/sec/__fixtures__/nvda-facts.json")).default;
    const { rows: secRows } = normalizeCompanyFacts(secFacts as never, { sic: "3674" });

    // The SEC's companyfacts has nothing for these years — that is the gap.
    expect(yearsMissingCapex(secRows).map((r) => r.fiscalYear).sort()).toEqual(
      expect.arrayContaining([2017, 2018, 2019, 2020, 2021]),
    );

    const merged = mergeCapexFromFilings(secRows, indexAnnualFilings(filings));

    for (const [periodEnd, expected] of Object.entries(FROM_THE_10K)) {
      const year = Number(periodEnd.slice(0, 4));
      const capex = pick(merged, "capex", year);
      expect(capex, `no capex for FY${year}`).toBeTruthy();
      expect(capex!.value).toBe(expected);
      // Provenance survives, so the page can say where the figure came from.
      expect(capex!.source).toBe("finnhub");

      // And free cash flow now exists, equal to operating cash flow minus capex.
      const ocf = pick(merged, "operating_cash_flow", year)!;
      const fcf = pick(merged, "free_cash_flow", year);
      expect(fcf, `no free cash flow for FY${year}`).toBeTruthy();
      expect(fcf!.value).toBe(ocf.value - expected);
      expect(fcf!.derived).toBe(true);
    }
  });

  it("leaves the SEC's own figures alone", async () => {
    const { normalizeCompanyFacts, pick } = await import("@/lib/sec/normalize");
    const secFacts = (await import("@/lib/sec/__fixtures__/nvda-facts.json")).default;
    const { rows } = normalizeCompanyFacts(secFacts as never, { sic: "3674" });
    const merged = mergeCapexFromFilings(rows, indexAnnualFilings(filings));

    // Fiscal 2026 already had capex from the SEC; the fallback must not touch it.
    const capex2026 = pick(merged, "capex", 2026)!;
    expect(capex2026.source).toBe("sec");
    expect(Math.round(capex2026.value / 1e6)).toBe(6042);
  });
});
