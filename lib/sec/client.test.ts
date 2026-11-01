import { describe, expect, it } from "vitest";
import { compactSubmissions, earningsReleaseDates, latestFiling, type Submissions } from "@/lib/sec/client";

// Earnings releases are 8-Ks filed under Item 2.02, "Results of Operations
// and Financial Condition".
describe("earningsReleaseDates", () => {
  const sub = (forms: string[], items: string[], dates: string[]) =>
    ({ filings: { recent: { form: forms, items, filingDate: dates, accessionNumber: [], reportDate: [], primaryDocument: [] } } }) as unknown as Submissions;

  it("finds the 8-Ks under Item 2.02, oldest first, and says how far back the list is complete", () => {
    const s = sub(
      ["8-K", "8-K", "10-Q", "8-K", "4"],
      ["2.02,9.01", "5.07", "", "2.02, 7.01", ""],
      ["2026-08-26", "2026-06-25", "2026-08-27", "2026-05-28", "2026-03-01"],
    );
    expect(earningsReleaseDates(s)).toEqual({ dates: ["2026-05-28", "2026-08-26"], completeFrom: "2026-03-01" });
  });

  it("does not mistake Item 2.02's neighbours for it", () => {
    expect(earningsReleaseDates(sub(["8-K"], ["2.03,2.020"], ["2026-01-01"])).dates).toEqual([]);
  });
});

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
    expect(Object.keys(compact.filings.recent).sort()).toEqual(["accessionNumber", "filingDate", "form", "items", "primaryDocument", "reportDate"]);
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

  it("keeps an 8-K's item numbers and no one else's", () => {
    const withItems = {
      ...raw,
      filings: {
        recent: {
          ...raw.filings.recent,
          form: ["424B2", "8-K", "4", "10-Q", "10-K"],
          items: ["", "2.02,9.01", "", "", ""],
        },
      },
    } as unknown as Submissions;
    expect(compactSubmissions(withItems).filings.recent.items).toEqual(["2.02,9.01", "", "", ""]);
  });

  it("keeps the identity fields the header uses", () => {
    expect(compactSubmissions(raw)).toMatchObject({ sic: "6021", fiscalYearEnd: "1231", exchanges: ["NYSE"], entityType: "operating" });
  });
});
