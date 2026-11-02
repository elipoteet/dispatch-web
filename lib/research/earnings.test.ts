import { describe, expect, it } from "vitest";
import { normalizeCompanyFacts, pick, type CompanyFacts } from "@/lib/sec/normalize";
import { findRevenueGuidance } from "@/lib/sec/guidance";
import { quarterList } from "./valuation";
import {
  earningsQuarters,
  estimateSentence,
  followsLast,
  nextQuarter,
  outlookRange,
  outlooks,
  quarterLabel,
  reportedQuarter,
  upcomingOutlook,
  type ReadRelease,
} from "./earnings";
import type { SplitStep } from "./splits";
import { fiscalYearEndFromRows } from "./format";
import nvdaFixture from "@/lib/sec/__fixtures__/nvda-facts.json";
import culpFixture from "@/lib/sec/__fixtures__/culp-facts.json";

const fx = nvdaFixture as unknown as CompanyFacts & { meta: { sic: string; fiscalYearEnd: string } };
const rows = normalizeCompanyFacts(fx, { sic: fx.meta.sic }).rows;
const FYE = "0125";

// NVIDIA's splits: 4-for-1 on 20 July 2021, 10-for-1 on 10 June 2024.
const NVDA_STEPS: SplitStep[] = [
  { from: "2013-01-01", factor: 40 },
  { from: "2021-07-20", factor: 10 },
  { from: "2024-06-10", factor: 1 },
];

// NVIDIA's outlook as its releases word it (the August one quoted exactly).
const release = (filed: string, quarterWords: string, billions: number): ReadRelease => ({
  filed,
  url: `https://www.sec.gov/Archives/edgar/data/1045810/x/${filed}.htm`,
  candidates: findRevenueGuidance(
    [`NVIDIA’s outlook for the ${quarterWords} quarter of fiscal 2027 is as follows:`, `•Revenue is expected to be $${billions.toFixed(1)} billion, plus or minus 2%.`].join("\n"),
  ),
});

describe("which quarter a release reports, and which its outlook is for", () => {
  const quarters = quarterList(rows);

  it("takes the quarter that ended just before the release", () => {
    const q = reportedQuarter("2026-08-26", quarters)!;
    expect([q.fiscalYear, q.fiscalPeriod, q.periodEnd]).toEqual([2027, "Q2", "2026-07-26"]);
    expect(nextQuarter(q)).toEqual({ fiscalYear: 2027, quarter: 3 });
  });

  it("rolls a fourth quarter into the next fiscal year", () => {
    expect(nextQuarter({ fiscalYear: 2026, fiscalPeriod: "Q4" })).toEqual({ fiscalYear: 2027, quarter: 1 });
  });

  it("counts forward when the release is ahead of the filings", () => {
    // The 10-Q comes weeks after the press release. NVIDIA's newest filed
    // quarter is Q2 FY27 (to 26 July 2026); a release on 18 November reports
    // Q3, whose 10-Q isn't in yet.
    const q = reportedQuarter("2026-11-18", quarters)!;
    expect([q.fiscalYear, q.fiscalPeriod, q.periodEnd]).toEqual([2027, "Q3", "2026-10-25"]);
    expect(nextQuarter(q)).toEqual({ fiscalYear: 2027, quarter: 4 });
  });

  it("matches nothing to a release long after any quarter it knows", () => {
    // More than two quarters past the newest filing: the filings are stale.
    expect(reportedQuarter("2027-06-01", quarters)).toBeNull();
  });
});

describe("outlooks against what was reported", () => {
  const q2Actual = pick(rows, "revenue", 2027, "Q2")!.value;
  const guided = outlooks(
    [release("2026-08-26", "third", 108), release("2026-05-20", "second", Math.round(q2Actual / 1e8) / 10)],
    rows,
  );
  const quarters = earningsQuarters(rows, guided, FYE, NVDA_STEPS);

  it("files each outlook under the quarter after its release", () => {
    expect(guided.map((g) => [g.fiscalYear, g.quarter])).toEqual([
      [2027, 3],
      [2027, 2],
    ]);
  });

  it("shows the outlook for a reported quarter beside what came in", () => {
    const q2 = quarters.find((q) => q.label === "Q2 FY27")!;
    expect(q2.outlook?.quote).toMatch(/^Revenue is expected to be/);
    expect(q2.revenue).toBe(q2Actual);
  });

  it("keeps the newest release's outlook as the one for the quarter not yet reported", () => {
    const up = upcomingOutlook(guided, { filed: "2026-08-26" })!;
    expect([up.fiscalYear, up.quarter, up.mid]).toEqual([2027, 3, 108e9]);
    expect(followsLast(up, quarters)).toBe(true);
  });

  it("reads the outlook in a release that's ahead of the filings, for the quarter after", () => {
    const ahead = outlooks([release("2026-11-18", "fourth", 120)], rows);
    expect(ahead.map((g) => [g.fiscalYear, g.quarter, g.mid])).toEqual([[2027, 4, 120e9]]);
    // Q3's 10-Q isn't in, so a bar for Q4 would skip a quarter.
    expect(followsLast(ahead[0], quarters)).toBe(false);
  });

  it("ignores an outlook that names a different quarter from the one expected", () => {
    expect(outlooks([release("2026-08-26", "fourth", 108)], rows)).toEqual([]);
  });

  it("lays out twelve quarters, oldest first, with Q4 EPS marked as calculated", () => {
    expect(quarters).toHaveLength(12);
    expect(quarters[11].label).toBe("Q2 FY27");
    const q4 = quarters.find((q) => q.label === "Q4 FY26")!;
    expect(q4.epsCalculated).toBe(true);
    expect(quarters.find((q) => q.label === "Q1 FY26")!.eps).toBeCloseTo(0.76, 2);
  });
});

describe("EPS across a stock split", () => {
  const q4fy24 = (steps: SplitStep[] | null) =>
    earningsQuarters(rows, [], FYE, steps, 20).find((q) => q.label === "Q4 FY24")!;

  it("puts every quarter on today's share basis before working out Q4", () => {
    // NVIDIA's Q4 fiscal 2024 GAAP EPS was $4.93 before the 2024 split: $0.49
    // in today's shares. Its Q1 ($0.82) was filed before the split, its full
    // year ($1.19) after.
    const q = q4fy24(NVDA_STEPS);
    expect(q.eps).toBeCloseTo(0.49, 2);
    expect(q.epsCalculated).toBe(true);
  });

  it("would have mixed share sizes without the split factors", () => {
    expect(q4fy24([]).eps).toBeCloseTo(-0.25, 2);
  });

  it("shows no EPS at all when the splits couldn't be checked", () => {
    expect(q4fy24(null).eps).toBeNull();
    expect(earningsQuarters(rows, [], FYE, null).every((q) => q.eps == null)).toBe(true);
  });

  it("converts a filed quarter from before the split too", () => {
    // Q1 fiscal 2024: $0.82 in the 10-Q of May 2023, $0.08 in today's shares.
    expect(earningsQuarters(rows, [], FYE, NVDA_STEPS, 20).find((q) => q.label === "Q1 FY24")!.eps).toBeCloseTo(0.082, 3);
  });
});

describe("the year end the figures run to", () => {
  it("comes from the latest full year, not the SEC's stated year end", () => {
    expect(fiscalYearEndFromRows(rows)).toBe("0125");
    // Culp's submissions file says 1231; its reports run to early May.
    const culp = normalizeCompanyFacts(culpFixture as unknown as CompanyFacts, {}).rows;
    expect(fiscalYearEndFromRows(culp)!.slice(0, 2)).toMatch(/^0[45]$/);
    expect(fiscalYearEndFromRows([])).toBeNull();
  });
});

describe("words", () => {
  it("labels quarters the way the company's year runs", () => {
    expect(quarterLabel(2027, 3, "0125")).toBe("Q3 FY27");
    expect(quarterLabel(2026, 3, "1231")).toBe("Q3 2026");
  });

  it("compares reported EPS with the estimate in cents, without verdicts", () => {
    expect(estimateSentence(2.22, 2.1384)).toBe("came in $0.08 above the average estimate");
    expect(estimateSentence(1.91, 1.9271)).toBe("came in $0.02 below the average estimate");
    expect(estimateSentence(-0.17, 0.4488)).toBe("came in $0.62 below the average estimate");
    expect(estimateSentence(1.3, 1.2996)).toBe("matched the average estimate");
  });

  it("states an outlook as a range or a single figure", () => {
    expect(outlookRange({ low: 105.84e9, high: 110.16e9 })).toBe("$105.8B to $110.2B");
    expect(outlookRange({ low: 2.29e9, high: 2.32e9 })).toBe("$2.29B to $2.32B");
    expect(outlookRange({ low: 34.8e9, high: 34.8e9 })).toBe("$34.8B");
  });
});
