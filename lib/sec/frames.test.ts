import { describe, expect, it } from "vitest";
import {
  SCREENER_INPUTS,
  framePlan,
  indexFrame,
  instantPeriodsBetween,
  reportCutoff,
  type FrameResponse,
} from "@/lib/sec/frames";
import { CONCEPT_TAGS } from "@/lib/sec/concepts";

const TODAY = "2026-11-05";

describe("reportCutoff", () => {
  it("is 18 months back", () => {
    expect(reportCutoff(TODAY)).toBe("2025-05-05");
    expect(reportCutoff("2026-02-28")).toBe("2024-08-28");
  });
});

describe("instantPeriodsBetween", () => {
  it("covers every quarter end a balance-sheet date in the window could be filed under", () => {
    // 5 May 2025 is nearer 31 March than 30 June, so Q1 2025 is the first
    // frame that can hold it; nothing dated after 5 November 2026 exists yet,
    // and the nearest quarter end to that is 30 September.
    expect(instantPeriodsBetween("2025-05-05", TODAY)).toEqual([
      "CY2025Q1I",
      "CY2025Q2I",
      "CY2025Q3I",
      "CY2025Q4I",
      "CY2026Q1I",
      "CY2026Q2I",
      "CY2026Q3I",
    ]);
  });
});

describe("framePlan", () => {
  const full = framePlan(TODAY, "full");
  const nightly = framePlan(TODAY, "nightly");
  const periodsOf = (plan: typeof full, tag: string) => plan.filter((r) => r.tag === tag).map((r) => r.period);

  it("asks for every tag in each line item's fallback list, reusing CONCEPT_TAGS", () => {
    const tags = new Set(full.map((r) => r.tag));
    for (const list of Object.values(CONCEPT_TAGS)) for (const tag of list) expect(tags.has(tag)).toBe(true);
  });

  it("reads ten years back from the oldest possible latest year, for revenue only", () => {
    const years = periodsOf(full, "Revenues");
    expect(years[0]).toBe("CY2014");
    expect(years.at(-1)).toBe("CY2026");
    expect(years).toHaveLength(13);
    expect(periodsOf(full, "NetIncomeLoss")).toEqual(["CY2023", "CY2024", "CY2025", "CY2026"]);
  });

  it("reads balance sheets at quarter ends, never as calendar years", () => {
    expect(periodsOf(full, "Assets")).toHaveLength(7);
    expect(periodsOf(full, "Assets").every((p) => p.endsWith("I"))).toBe(true);
  });

  it("asks for each file once, even when a tag serves two line items", () => {
    const keys = full.map((r) => `${r.tag}|${r.unit}|${r.period}`);
    expect(new Set(keys).size).toBe(keys.length);
    // Cash's last fallback and the base of the restricted-cash calculation.
    expect(periodsOf(full, "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents")).toHaveLength(7);
  });

  it("uses the frames API's unit names", () => {
    expect(full.find((r) => r.tag === "EarningsPerShareDiluted")?.unit).toBe("USD-per-shares");
    expect(full.find((r) => r.tag === "WeightedAverageNumberOfDilutedSharesOutstanding")?.unit).toBe("shares");
    expect(full.find((r) => r.tag === "Revenues")?.unit).toBe("USD");
  });

  it("nightly is the two newest calendar years and the three newest quarter ends", () => {
    expect(periodsOf(nightly, "Revenues")).toEqual(["CY2025", "CY2026"]);
    expect(periodsOf(nightly, "Assets")).toEqual(["CY2026Q1I", "CY2026Q2I", "CY2026Q3I"]);
    expect(nightly.length).toBeLessThan(full.length / 2);
  });

  it("covers every tag of every input, each fetched once", () => {
    // A tag two items share (cash's restricted-inclusive total; the noncurrent
    // debt tags, also total-debt fallbacks) is fetched under the first.
    const tags = new Set(full.map((r) => r.tag));
    for (const spec of SCREENER_INPUTS) for (const tag of spec.tags) expect(tags.has(tag)).toBe(true);
    const keys = full.map((r) => `${r.tag}|${r.unit}|${r.period}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("reads the cover page's share count from the company-information taxonomy, the rest from us-gaap", () => {
    const cover = full.filter((r) => r.tag === "EntityCommonStockSharesOutstanding");
    expect(cover).toHaveLength(7);
    expect(cover.every((r) => r.taxonomy === "dei" && r.unit === "shares" && r.period.endsWith("I"))).toBe(true);
    expect(full.filter((r) => r.taxonomy !== "us-gaap")).toHaveLength(7);
  });

  it("reads operating income four years back, for the change in operating margin", () => {
    const periods = full.filter((r) => r.tag === "OperatingIncomeLoss").map((r) => r.period);
    expect(periods).toContain("CY2021");
    expect(full.filter((r) => r.tag === "NetIncomeLoss").map((r) => r.period)).not.toContain("CY2021");
  });
});

describe("indexFrame", () => {
  it("keeps one compact value per company and drops rows without a number", () => {
    const frame: FrameResponse = {
      taxonomy: "us-gaap",
      tag: "NetIncomeLoss",
      ccp: "CY2025",
      uom: "USD",
      label: "",
      description: "",
      pts: 3,
      data: [
        { accn: "0001045810-26-000036", cik: 1045810, entityName: "NVIDIA CORPORATION", loc: "-", start: "2025-01-27", end: "2026-01-25", val: 120067000000 },
        { accn: "x", cik: 2, entityName: "B", loc: "US-IL", end: "2025-12-31", val: Number.NaN },
        { accn: "y", cik: 3, entityName: "C", loc: "US-IL", end: "", val: 5 },
      ],
    };
    const index = indexFrame(frame);
    expect(index.size).toBe(1);
    expect(index.get(1045810)).toEqual({ val: 120067000000, start: "2025-01-27", end: "2026-01-25", accn: "0001045810-26-000036" });
  });
});
