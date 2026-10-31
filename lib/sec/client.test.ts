import { describe, expect, it } from "vitest";
import { compactSubmissions, latestFiling, type Submissions } from "@/lib/sec/client";

// JPMorgan's raw submissions file is 5.3MB, almost all 424B2 prospectus
// supplements — over the data cache's 2MB ceiling, so it was never cached.
describe("compactSubmissions", () => {
  const raw = {
    cik: "0000019617",
    name: "JPMORGAN CHASE & CO",
    sic: "6021",
    sicDescription: "National Commercial Banks",
    fiscalYearEnd: "1231",
    tickers: ["JPM"],
    exchanges: ["NYSE"],
    entityType: "operating",
    filings: {
      recent: {
        accessionNumber: ["a1", "a2", "a3", "a4", "a5"],
        filingDate: ["2026-10-30", "2026-10-29", "2026-08-01", "2026-05-01", "2026-02-13"],
        reportDate: ["", "", "2026-06-30", "", "2025-12-31"],
        form: ["424B2", "424B2", "10-Q", "4", "10-K"],
        primaryDocument: ["p1.htm", "p2.htm", "q.htm", "f4.xml", "jpm-20251231.htm"],
        acceptanceDateTime: ["x", "x", "x", "x", "x"],
        size: [1, 2, 3, 4, 5],
      },
    },
  } as unknown as Submissions;

  it("keeps the filings the research file reads, in order, and drops the rest", () => {
    const compact = compactSubmissions(raw);
    expect(compact.filings.recent.form).toEqual(["10-Q", "4", "10-K"]);
    expect(compact.filings.recent.accessionNumber).toEqual(["a3", "a4", "a5"]);
    expect(Object.keys(compact.filings.recent).sort()).toEqual(["accessionNumber", "filingDate", "form", "primaryDocument", "reportDate"]);
  });

  it("still answers which annual report is newest", () => {
    expect(latestFiling(compactSubmissions(raw), ["10-K"])).toEqual({
      accession: "a5",
      filed: "2026-02-13",
      reportDate: "2025-12-31",
      form: "10-K",
      primaryDocument: "jpm-20251231.htm",
    });
  });

  it("keeps the identity fields the header uses", () => {
    expect(compactSubmissions(raw)).toMatchObject({ sic: "6021", fiscalYearEnd: "1231", exchanges: ["NYSE"], entityType: "operating" });
  });
});
