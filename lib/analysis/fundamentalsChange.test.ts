import { describe, expect, it } from "vitest";
import {
  buildFundamentalsChange,
  computePercentChange,
  pickFilingAsOf,
  pickLatestFiling,
  type FinancialsReportedFiling,
} from "./fundamentalsChange";

function filing(
  filedDate: string,
  endDate: string,
  ic: { concept: string; value: number }[],
): FinancialsReportedFiling {
  return { filedDate, endDate, form: "10-Q", report: { ic } };
}

const REVENUE_CONCEPT = "us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax";
const NET_INCOME_CONCEPT = "us-gaap_NetIncomeLoss";

describe("pickFilingAsOf", () => {
  const filings = [
    filing("2023-11-01", "2023-09-30", [{ concept: REVENUE_CONCEPT, value: 89500000000 }]),
    filing("2024-02-01", "2023-12-30", [{ concept: REVENUE_CONCEPT, value: 119575000000 }]),
    filing("2024-05-02", "2024-03-30", [{ concept: REVENUE_CONCEPT, value: 90753000000 }]),
  ];

  it("picks the latest filing on or before the as-of date", () => {
    const picked = pickFilingAsOf(filings, "2024-03-01");
    expect(picked?.filedDate).toBe("2024-02-01");
  });

  it("includes a filing filed exactly on the as-of date", () => {
    const picked = pickFilingAsOf(filings, "2024-02-01");
    expect(picked?.filedDate).toBe("2024-02-01");
  });

  it("returns null when no filing predates the as-of date", () => {
    const picked = pickFilingAsOf(filings, "2020-01-01");
    expect(picked).toBeNull();
  });
});

describe("pickLatestFiling", () => {
  it("returns the filing with the most recent filedDate regardless of array order", () => {
    const filings = [
      filing("2024-02-01", "2023-12-30", []),
      filing("2024-11-01", "2024-09-28", []),
      filing("2024-05-02", "2024-03-30", []),
    ];
    expect(pickLatestFiling(filings)?.filedDate).toBe("2024-11-01");
  });

  it("returns null for an empty list", () => {
    expect(pickLatestFiling([])).toBeNull();
  });
});

describe("computePercentChange", () => {
  it("computes a straightforward positive change", () => {
    expect(computePercentChange(100, 150)).toBeCloseTo(50);
  });

  it("computes a straightforward negative change", () => {
    expect(computePercentChange(100, 80)).toBeCloseTo(-20);
  });

  it("omits the percentage when the base is zero or negative (misleading otherwise)", () => {
    expect(computePercentChange(0, 50)).toBeNull();
    expect(computePercentChange(-10, -5)).toBeNull();
  });
});

describe("buildFundamentalsChange", () => {
  const thenFiling = filing("2023-11-01", "2023-09-30", [
    { concept: REVENUE_CONCEPT, value: 89498000000 },
    { concept: NET_INCOME_CONCEPT, value: 22956000000 },
  ]);
  const nowFiling = filing("2025-11-01", "2025-09-27", [
    { concept: REVENUE_CONCEPT, value: 102466000000 },
    { concept: NET_INCOME_CONCEPT, value: 27466000000 },
  ]);

  it("extracts both figures via the concept allow-list and computes percent change", () => {
    const result = buildFundamentalsChange([thenFiling, nowFiling], "2024-01-01");
    expect(result).not.toBeNull();
    const revenue = result!.figures.find((f) => f.label === "Revenue")!;
    expect(revenue.thenValue).toBe(89498000000);
    expect(revenue.nowValue).toBe(102466000000);
    expect(revenue.thenDate).toBe("2023-09-30");
    expect(revenue.nowDate).toBe("2025-09-27");
    expect(revenue.percentChange).toBeCloseTo(14.487, 2);

    const netIncome = result!.figures.find((f) => f.label === "Net Income")!;
    expect(netIncome.thenValue).toBe(22956000000);
    expect(netIncome.nowValue).toBe(27466000000);
  });

  it("also matches an alternate revenue concept tag (older filings often use a different one)", () => {
    const altThen = filing("2019-11-01", "2019-09-28", [{ concept: "us-gaap_Revenues", value: 64040000000 }]);
    const altNow = filing("2025-11-01", "2025-09-27", [{ concept: "us-gaap_Revenues", value: 102466000000 }]);
    const result = buildFundamentalsChange([altThen, altNow], "2020-01-01");
    const revenue = result!.figures.find((f) => f.label === "Revenue")!;
    expect(revenue.thenValue).toBe(64040000000);
  });

  it("omits a figure that can't be confidently found rather than guessing", () => {
    const sparseThen = filing("2023-11-01", "2023-09-30", [{ concept: REVENUE_CONCEPT, value: 89498000000 }]);
    const sparseNow = filing("2025-11-01", "2025-09-27", [{ concept: REVENUE_CONCEPT, value: 102466000000 }]);
    const result = buildFundamentalsChange([sparseThen, sparseNow], "2024-01-01");
    expect(result).not.toBeNull();
    expect(result!.figures.map((f) => f.label)).toEqual(["Revenue"]);
  });

  it("returns null when there's no filing before the as-of date at all", () => {
    const result = buildFundamentalsChange([thenFiling, nowFiling], "2020-01-01");
    expect(result).toBeNull();
  });

  it("returns null when neither figure can be found on the then side", () => {
    const unrecognizedThen = filing("2023-11-01", "2023-09-30", [{ concept: "us-gaap_SomeOtherConcept", value: 1 }]);
    const result = buildFundamentalsChange([unrecognizedThen, nowFiling], "2024-01-01");
    expect(result).toBeNull();
  });

  it("returns null for an empty filings list", () => {
    expect(buildFundamentalsChange([], "2024-01-01")).toBeNull();
  });
});
