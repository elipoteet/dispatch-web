import { describe, expect, it } from "vitest";
import type { Submissions } from "@/lib/sec/client";
import { describe8K, filingEntries } from "./filings";

describe("describe8K", () => {
  it("names what an 8-K reports, leaving out the exhibits item that rides along", () => {
    expect(describe8K("2.02,9.01")).toBe("Results of operations");
    expect(describe8K("5.02, 9.01")).toBe("Director or officer change");
    expect(describe8K("1.01,2.03,9.01")).toBe("New material agreement; New debt or obligation");
  });

  it("names the exhibits item only when it's alone, and an unknown item by its number", () => {
    expect(describe8K("9.01")).toBe("Exhibits");
    expect(describe8K("6.05")).toBe("Item 6.05");
    expect(describe8K("")).toBe("Current report");
  });
});

describe("filingEntries", () => {
  const subs = {
    filings: {
      recent: {
        form: ["4", "10-Q", "8-K", "DEF 14A", "10-K"],
        items: ["", "", "2.02,9.01", "", ""],
        filingDate: ["2026-10-13", "2026-08-27", "2026-08-26", "2026-05-10", "2026-02-25"],
        reportDate: ["2026-10-09", "2026-07-26", "", "", "2026-01-25"],
        accessionNumber: ["a", "b", "c", "d", "e"],
        primaryDocument: ["xslF345X06/form4.xml", "nvda-20260726.htm", "nvda-8k.htm", "proxy.htm", "nvda-20260125.htm"],
      },
    },
  } as unknown as Submissions;

  it("lists every filing newest first, sorted into kinds, in plain words", () => {
    expect(filingEntries(subs).map((f) => [f.form, f.category, f.description])).toEqual([
      ["4", "insiders", "Insider trade report"],
      ["10-Q", "reports", "Quarterly report"],
      ["8-K", "events", "Results of operations"],
      ["DEF 14A", "proxy", "Proxy statement"],
      ["10-K", "reports", "Annual report"],
    ]);
  });

  it("keeps the period a report covers, and none for a filing without one", () => {
    const [form4, q, eightK] = filingEntries(subs);
    expect(q.reportDate).toBe("2026-07-26");
    expect(eightK.reportDate).toBeNull();
    expect(form4.primaryDocument).toBe("xslF345X06/form4.xml");
  });
});
