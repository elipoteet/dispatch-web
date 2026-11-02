// Revenue guidance by rules. Every positive case below is quoted from a real
// earnings release (exhibit 99.1 to the 8-K, the latest one for each company
// as of 1 November 2026), with the lines around it as htmlToText gives them.
// Run against all fifty releases sampled, the rules found the next quarter's
// revenue outlook for 15 and nothing for the other 35, with no false readings.

import { describe, expect, it } from "vitest";
import { findRevenueGuidance, parseAmount, pickGuidance } from "./guidance";

const B = 1e9;
const one = (text: string) => {
  const found = findRevenueGuidance(text);
  expect(found.length).toBeGreaterThan(0);
  return found[0];
};

describe("the shapes companies use", () => {
  it("NVIDIA: a point plus or minus a percentage, quarter in the line above", () => {
    const g = one(
      [
        "Outlook",
        "NVIDIA’s outlook for the third quarter of fiscal 2027 is as follows:",
        "•Revenue is expected to be $108.0 billion, plus or minus 2%. NVIDIA is not assuming any Data Center compute revenue from China in its outlook.",
        "•GAAP and non-GAAP gross margins are expected to be 74.0%, plus or minus 50 basis points.",
      ].join("\n"),
    );
    expect(g.quarter).toBe(3);
    expect(g.mid).toBe(108 * B);
    expect(g.low).toBeCloseTo(105.84 * B, -6);
    expect(g.high).toBeCloseTo(110.16 * B, -6);
    expect(g.quote).toBe("Revenue is expected to be $108.0 billion, plus or minus 2%.");
    expect(g.heading).toContain("third quarter of fiscal 2027");
  });

  it("AMD: a point plus or minus an amount, quarter in the sentence", () => {
    const g = one("For the third quarter of 2026, AMD expects revenue to be approximately $13 billion, plus or minus $300 million.");
    expect([g.quarter, g.low, g.high]).toEqual([3, 12.7 * B, 13.3 * B]);
  });

  it("Amazon: net sales between two figures, quarter in the heading, a comparison after", () => {
    const g = one(
      [
        "Fourth Quarter 2026 Guidance",
        "•Net sales are expected to be between $240.0 billion and $247.0 billion, or to grow between 12% and 16% compared with fourth quarter 2025.",
        "•Operating income is expected to be between $28.5 billion and $33.5 billion, compared with $25.0 billion in fourth quarter 2025.",
      ].join("\n"),
    );
    expect([g.quarter, g.low, g.high]).toEqual([4, 240 * B, 247 * B]);
  });

  it("Meta: a range written $73-76 billion", () => {
    const g = one("We expect fourth quarter 2026 total revenue to be in the range of $73-76 billion.");
    expect([g.quarter, g.low, g.high]).toEqual([4, 73 * B, 76 * B]);
  });

  it("Broadcom: 'revenue guidance of approximately'", () => {
    const g = one("•Fourth quarter fiscal year 2026 revenue guidance of approximately $34.8 billion, an increase of 93 percent from the prior year period");
    expect([g.quarter, g.mid]).toEqual([4, 34.8 * B]);
  });

  it("Intel, Texas Instruments, Analog Devices, Netflix, Lululemon", () => {
    expect(one("•Forecasting fourth-quarter 2026 revenue of $15.0 billion to $16.0 billion; forecasting fourth-quarter EPS of $0.10.").low).toBe(15 * B);
    expect(one('•"TI\'s fourth quarter outlook is for revenue in the range of $5.80 billion to $6.30 billion and earnings per share between $2.45 and $2.79."').high).toBe(6.3 * B);
    expect(one("For the fourth quarter of fiscal 2026, we are forecasting revenue of $4.3 billion, +/- $100 million.").low).toBe(4.2 * B);
    expect(one("In Q4, we expect revenue of $13.4 billion, which represents year over year growth of 12%.").mid).toBe(13.4 * B);
    expect(one("For the third quarter of 2026, the Company expects net revenue to be in the range of $2.290 billion to $2.320 billion, representing a decline of 10% to 11%.").low).toBe(2.29 * B);
  });

  it("Palo Alto: a bullet three lines under its heading", () => {
    const g = one(
      [
        "For the fiscal first quarter 2027, we expect:",
        "•Next-Generation Security ARR of $9.54 billion to $9.56 billion, representing year-over-year growth of 63%.",
        "•Remaining performance obligations of $20.8 billion to $20.9 billion, representing year-over-year growth of 34% to 35%.",
        "•Total revenue in the range of $3.300 billion to $3.310 billion, representing year-over-year growth of 33% to 34%.",
      ].join("\n"),
    );
    expect([g.quarter, g.low, g.high]).toEqual([1, 3.3 * B, 3.31 * B]);
  });

  it("Micron: a table, label and figure on separate lines", () => {
    const g = one(
      [
        "The following table presents Micron’s guidance for the first quarter of 2027:",
        "FQ1-27 GAAP(1) Outlook",
        "Non-GAAP(2) Outlook",
        "Revenue",
        "$61.5 billion ± $1.5 billion $61.5 billion ± $1.5 billion",
      ].join("\n"),
    );
    expect([g.quarter, g.low, g.high]).toEqual([1, 60 * B, 63 * B]);
  });

  it("Qualcomm: a table headed with a footnote mark", () => {
    const g = one(["Current Guidance", "Q4 FY26 Estimates1", "Revenues $9.7B - $10.5B", "Supplemental Revenue Information"].join("\n"));
    expect([g.quarter, g.low, g.high]).toEqual([4, 9.7 * B, 10.5 * B]);
  });

  it("Cisco: label and colon under a quarterly heading", () => {
    const g = one(["Q1 FY 2027 Guidance:", "◦Revenue: $18.0 billion to $18.2 billion", "◦Earnings per Share:"].join("\n"));
    expect([g.quarter, g.low]).toEqual([1, 18 * B]);
  });
});

describe("what it refuses", () => {
  const none = (text: string) => expect(findRevenueGuidance(text)).toEqual([]);

  it("a segment's revenue", () => {
    none('"In Q4 the momentum continues, and we expect AI semiconductor revenue to accelerate to $21.7 billion, up 236% year-over-year."');
    none("Commercial Airplanes third quarter revenue of $10.7 billion and operating margin of (6.5) percent primarily reflects less favorable delivery mix, as expected.");
  });

  it("the full year", () => {
    none("For 2026, the Company now expects net revenue to be in the range of $10.350 billion to $10.500 billion, representing a decline of 5% to 7%.");
    none("Our guidance for Q4 means that for the full year 2026 we expect revenue of $51.1B, or growth of 13%.");
    none(["For the fiscal year 2027, we expect:", "•Total revenue in the range of $14.10 billion to $14.20 billion, representing year-over-year growth of 23% to 24%."].join("\n"));
    none("Delivered approximately $4 billion of revenue in FY 2026; $7.5 billion expected in FY 2027");
  });

  it("an annual block just below a quarterly one (Cisco)", () => {
    const text = [
      "Q1 FY 2027 Guidance:",
      "◦Revenue: $18.0 billion to $18.2 billion",
      "FY 2027 Guidance:",
      "◦Revenue: $72.2 billion to $73.4 billion",
    ].join("\n");
    expect(findRevenueGuidance(text).map((g) => g.low)).toEqual([18 * B]);
  });

  it("results, however they're phrased", () => {
    none("Q3 revenue grew 12% year over year (11% on a F/X neutral basis) to $12.9B, consistent with our forecast.");
    none("Cisco reported fourth quarter revenue of $17.3 billion, net income of $3.9 billion, as expected.");
    none("Q3 revenue included approximately $900 million of benefits, as anticipated.");
    none(["Qualcomm Announces Third Quarter Fiscal 2026 Results", "Revenues: $9.9 billion", "GAAP EPS: $1.87"].join("\n"));
  });

  it("a change in guidance rather than a level", () => {
    none("Raises FY27 revenue guidance by $200M, $300M in CC");
  });

  it("a figure with no quarter anywhere near it", () => {
    none("We expect revenue to be approximately $13 billion.");
  });

  it("a quarter mentioned only in a long paragraph above", () => {
    none(
      [
        "In addition to updates to Revenue and Performance Margin guidance, EPS guidance has been adjusted to reflect an increase of $4.07 (at the midpoint of the range), offset by $4.57 associated with the Q3 acquired IPR&D charges from recent business development activity:",
        "Revenue $85 to $87 billion $91 to $92 billion",
      ].join("\n"),
    );
  });
});

describe("parseAmount", () => {
  it("reads millions and the B and M shorthand", () => {
    expect(parseAmount("$300 million")).toEqual({ low: 3e8, high: 3e8, mid: 3e8 });
    expect(parseAmount("$9.7B - $10.5B")).toEqual({ low: 9.7 * B, high: 10.5 * B, mid: 10.1 * B });
    expect(parseAmount("$1,250 million to $1,300 million")!.low).toBe(1.25 * B);
  });

  it("needs a unit, so a table of plain numbers isn't read as billions", () => {
    expect(parseAmount("$ 54,229 $ 41,456")).toBeNull();
  });
});

describe("pickGuidance", () => {
  const found = findRevenueGuidance("For the third quarter of 2026, AMD expects revenue to be approximately $13 billion, plus or minus $300 million.");

  it("takes the outlook for the quarter expected", () => {
    expect(pickGuidance(found, { quarter: 3, lastRevenue: 11.5 * B })?.mid).toBe(13 * B);
  });

  it("ignores one for another quarter", () => {
    expect(pickGuidance(found, { quarter: 4, lastRevenue: 11.5 * B })).toBeNull();
  });

  it("rejects a figure more than double the quarter just reported, or under half", () => {
    expect(pickGuidance(found, { quarter: 3, lastRevenue: 5 * B })).toBeNull();
    expect(pickGuidance(found, { quarter: 3, lastRevenue: 30 * B })).toBeNull();
  });
});
