import { describe, expect, it } from "vitest";
import {
  CASH_FROM_TOTAL_LABEL,
  annualReportValue,
  assembleCompany,
  collectFrame,
  looksLikeUnitsError,
  rankedTags,
  fiscalYearsOnly,
  resolveNetIncome,
  yearChain,
  type FrameCollection,
  type Picked,
} from "@/lib/screener/assemble";
import type { FrameEntry, FrameResponse } from "@/lib/sec/frames";

const TODAY = "2026-11-05";

function frame(tag: string, rows: Partial<FrameEntry>[]): FrameResponse {
  return {
    taxonomy: "us-gaap",
    tag,
    ccp: "",
    uom: "USD",
    label: "",
    description: "",
    pts: rows.length,
    data: rows.map((r) => ({ accn: "A", cik: 1, entityName: "Test Co", loc: "-", end: "", val: 0, ...r }) as FrameEntry),
  };
}

const year = (y: number, val: number, accn = `A-${y}`): Partial<FrameEntry> => ({ start: `${y}-01-01`, end: `${y}-12-31`, val, accn });
const at = (date: string, val: number): Partial<FrameEntry> => ({ end: date, val });

function company(frames: [string, Partial<FrameEntry>[]][]) {
  const c: FrameCollection = new Map();
  for (const [tag, rows] of frames) collectFrame(c, tag, frame(tag, rows));
  return c.get(1)!;
}

describe("yearChain", () => {
  it("steps back a year at a time, 52- and 53-week years included", () => {
    expect(yearChain(["2026-01-25", "2025-01-26", "2024-01-28", "2023-01-29"])).toEqual(["2026-01-25", "2025-01-26", "2024-01-28", "2023-01-29"]);
  });

  it("stops at a missing year rather than bridging the gap", () => {
    expect(yearChain(["2025-12-31", "2024-12-31", "2022-12-31"])).toEqual(["2025-12-31", "2024-12-31"]);
  });

  it("skips a short transition period that overlaps the year before", () => {
    expect(yearChain(["2025-12-31", "2025-06-30", "2024-12-31"])).toEqual(["2025-12-31", "2024-12-31"]);
  });
});

describe("rankedTags", () => {
  it("ranks revenue tags by years covered, then list order (the normaliser's Walmart rule)", () => {
    // Revenues covers four years, the customer-contract tag two: Revenues wins
    // although it comes later in the list.
    const c = company([
      ["RevenueFromContractWithCustomerExcludingAssessedTax", [year(2024, 7), year(2025, 7)]],
      ["Revenues", [year(2022, 2500), year(2023, 2700), year(2024, 2900), year(2025, 3000)]],
    ]);
    expect(rankedTags(c, "revenue")).toEqual(["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"]);
  });

  it("ranks balance-sheet tags by list order only, as the normaliser does", () => {
    const c = company([
      ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", [at("2025-03-31", 1), at("2025-06-30", 1), at("2025-12-31", 1)]],
      ["CashAndCashEquivalentsAtCarryingValue", [at("2025-12-31", 1)]],
    ]);
    expect(rankedTags(c, "cash_and_equivalents")[0]).toBe("CashAndCashEquivalentsAtCarryingValue");
  });
});

describe("assembleCompany", () => {
  const base: [string, Partial<FrameEntry>[]][] = [
    ["Revenues", [year(2021, 600), year(2022, 700), year(2023, 800), year(2024, 900), year(2025, 1000)]],
    ["NetIncomeLoss", [year(2024, 90), year(2025, 100)]],
    ["NetCashProvidedByUsedInOperatingActivities", [year(2024, 150), year(2025, 160)]],
    ["Assets", [at("2025-09-30", 1900), at("2025-12-31", 2000)]],
    ["LongTermDebt", [at("2025-12-31", 300)]],
    ["CashAndCashEquivalentsAtCarryingValue", [at("2025-12-31", 400)]],
  ];

  it("builds the latest year, the year before and the revenue history", () => {
    const r = assembleCompany(company(base), TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.company;
    expect(a.latest.periodEnd).toBe("2025-12-31");
    expect(a.latest.periodStart).toBe("2025-01-01");
    expect(a.latest.values.revenue?.val).toBe(1000);
    expect(a.prior?.values.net_income?.val).toBe(90);
    expect(a.revenueHistory.map((h) => h?.val)).toEqual([1000, 900, 800, 700, 600]);
  });

  it("takes the balance sheet on the year's closing date only, never a quarter's", () => {
    const r = assembleCompany(company(base), TODAY);
    if (!r.ok) throw new Error();
    expect(r.company.balance.total_assets?.val).toBe(2000);
    const noYearEnd = assembleCompany(company([...base.filter(([t]) => t !== "Assets"), ["Assets", [at("2025-09-30", 1900)]]]), TODAY);
    if (!noYearEnd.ok) throw new Error();
    expect(noYearEnd.company.balance.total_assets).toBeUndefined();
  });

  it("leaves out a company whose latest year ended more than 18 months ago", () => {
    const stale = assembleCompany(company([["Revenues", [year(2023, 800)]]]), TODAY);
    expect(stale).toMatchObject({ ok: false, reason: "stale", periodEnd: "2023-12-31" });
  });

  it("leaves out a company with no annual figures", () => {
    const r = assembleCompany(company([["Assets", [at("2025-12-31", 1)]]]), TODAY);
    expect(r).toMatchObject({ ok: false, reason: "no-annual" });
  });

  it("uses the best tag per year when a company switches tags mid-history (NVIDIA's revenue)", () => {
    const r = assembleCompany(
      company([
        ["RevenueFromContractWithCustomerExcludingAssessedTax", [year(2021, 600), year(2022, 700)]],
        ["Revenues", [year(2023, 800), year(2024, 900), year(2025, 1000)]],
      ]),
      TODAY,
    );
    if (!r.ok) throw new Error();
    expect(r.company.revenueHistory.map((h) => h?.tag)).toEqual([
      "Revenues",
      "Revenues",
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
    ]);
  });

  it("works cash out from the restricted-cash total where the company's own cash tag skips the date (Chevron)", () => {
    const r = assembleCompany(
      company([
        ...base.filter(([t]) => t !== "CashAndCashEquivalentsAtCarryingValue"),
        ["CashAndCashEquivalentsAtCarryingValue", [at("2025-09-30", 5000)]],
        ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", [at("2025-12-31", 6911)]],
        ["RestrictedCashCurrent", [at("2025-12-31", 452)]],
        ["RestrictedCashNoncurrent", [at("2025-12-31", 773)]],
      ]),
      TODAY,
    );
    if (!r.ok) throw new Error();
    expect(r.company.balance.cash_and_equivalents).toMatchObject({ val: 5686, tag: CASH_FROM_TOTAL_LABEL, derived: true });
  });

  it("doesn't subtract restricted cash the company never tags (Apple, NVIDIA)", () => {
    const r = assembleCompany(
      company([
        ...base.filter(([t]) => t !== "CashAndCashEquivalentsAtCarryingValue"),
        ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", [at("2025-12-31", 6911)]],
      ]),
      TODAY,
    );
    if (!r.ok) throw new Error();
    // Falls through to the total itself, the list's last cash tag.
    expect(r.company.balance.cash_and_equivalents).toMatchObject({ val: 6911, tag: "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents" });
  });
});

describe("units errors in the filing", () => {
  it("recognises a thousand- or million-fold gap, not an ordinary one", () => {
    expect(looksLikeUnitsError(103_536_000_000, 103_536_000)).toBe(true); // Tigo Energy's revenue
    expect(looksLikeUnitsError(42_746_000, 42.8)).toBe(true); // Middlesex Water's net income
    expect(looksLikeUnitsError(5_478_000_000, 5_942_000)).toBe(true); // Schwab: two concepts, one in the wrong units
    expect(looksLikeUnitsError(3_040_725_000, 7_042_000)).toBe(false); // AvalonBay: rent isn't customer-contract revenue
    expect(looksLikeUnitsError(16_978_000_000, 3_000_000)).toBe(false); // Fannie Mae 2024: preferred shares take the rest
    // Fannie Mae 2025 lands inside the window by coincidence (1,596 times);
    // resolveNetIncome below is what keeps that from becoming a wrong number.
    expect(looksLikeUnitsError(14_364_000_000, 9_000_000)).toBe(true);
    expect(looksLikeUnitsError(100, 0)).toBe(false);
  });

  it("makes the line item n/a for the year instead of picking one of the two", () => {
    const r = assembleCompany(
      company([
        ["RevenueFromContractWithCustomerExcludingAssessedTax", [year(2024, 54_014_000_000), year(2025, 103_536_000_000)]],
        ["Revenues", [year(2024, 54_014_000), year(2025, 103_536_000)]],
        ["NetIncomeLoss", [year(2024, -62_746_000), year(2025, -1_880_000)]],
      ]),
      TODAY,
    );
    if (!r.ok) throw new Error();
    expect(r.company.latest.values.revenue).toBeUndefined();
    expect(r.company.latest.inconsistent).toContain("revenue");
    expect(r.company.revenueHistory).toEqual([null, null]);
    expect(r.company.revenueHistoryInconsistent).toEqual([0, 1]);
    expect(r.company.latest.values.net_income?.val).toBe(-1_880_000);
  });

  it("leaves line items whose tags are parts of a whole alone (Johnson & Johnson's R&D)", () => {
    const r = assembleCompany(
      company([
        ...[["Revenues", [year(2024, 88_800), year(2025, 94_200)]] as [string, Partial<FrameEntry>[]]],
        ["ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost", [year(2024, 17_232), year(2025, 14_665)]],
        ["ResearchAndDevelopmentExpense", [year(2024, 1_841), year(2025, 109)]],
      ]),
      TODAY,
    );
    if (!r.ok) throw new Error();
    expect(r.company.latest.values.rnd).toMatchObject({ val: 14_665, tag: "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost" });
  });
});

describe("resolveNetIncome: checked against EPS x diluted shares from the 10-K", () => {
  const ni = (tag: string, val: number): Picked => ({ val, end: "2026-05-31", tag, accn: "A" });
  const eps = (val: number): Picked => ({ val, end: "2026-05-31", tag: "EarningsPerShareDiluted", accn: "K" });
  const shares = (val: number): Picked => ({ val, end: "2026-05-31", tag: "WeightedAverageNumberOfDilutedSharesOutstanding", accn: "K" });

  it("takes the best-ranked tag when everything agrees", () => {
    const r = resolveNetIncome([ni("NetIncomeLoss", 120_067e6)], eps(4.9), shares(24_514e6));
    expect(r).toEqual({ picked: ni("NetIncomeLoss", 120_067e6), inconsistent: false });
  });

  it("passes over a proxy statement's figure in millions for the 10-K's (FedEx, CY2025 frames)", () => {
    const r = resolveNetIncome(
      [ni("NetIncomeLoss", 4_433), ni("NetIncomeLossAvailableToCommonStockholdersBasic", 4_426_000_000)],
      eps(18.19),
      shares(243.3e6),
    );
    expect(r.picked?.tag).toBe("NetIncomeLossAvailableToCommonStockholdersBasic");
    expect(r.inconsistent).toBe(false);
  });

  it("passes over a figure a thousand times too large (JAKKS Pacific)", () => {
    const r = resolveNetIncome(
      [ni("NetIncomeLoss", 9_871_000_000), ni("ProfitLoss", 9_871_000), ni("NetIncomeLossAvailableToCommonStockholdersBasic", 9_871_000)],
      eps(0.88),
      shares(11.2e6),
    );
    expect(r.picked).toMatchObject({ tag: "ProfitLoss", val: 9_871_000 });
  });

  it("won't take income to common as net income across a real gap (Fannie Mae)", () => {
    const r = resolveNetIncome(
      [ni("NetIncomeLoss", 14_364_000_000), ni("ProfitLoss", 14_364_000_000), ni("NetIncomeLossAvailableToCommonStockholdersBasic", 9_000_000)],
      eps(0.0),
      shares(5_867e6),
    );
    expect(r).toEqual({ picked: null, inconsistent: true });
  });

  it("catches a units error in a company's only tag when operating income agrees with EPS (Rocky Mountain Chocolate)", () => {
    const oi = { val: -3_900_000, end: "2026-02-28", tag: "OperatingIncomeLoss", accn: "K" };
    const r = resolveNetIncome([ni("NetIncomeLoss", -4_560)], eps(-0.56), shares(8_084_372), oi);
    expect(r).toEqual({ picked: null, inconsistent: true });
  });

  it("keeps net income when it's the share count that's in thousands (Smith & Wesson)", () => {
    const oi = { val: 30_000_000, end: "2026-04-30", tag: "OperatingIncomeLoss", accn: "K" };
    const r = resolveNetIncome([ni("NetIncomeLoss", 18_481_000)], eps(0.41), shares(44_933), oi);
    expect(r.picked?.val).toBe(18_481_000);
  });

  it("is n/a when the only tag disagrees with EPS and there's no operating income to ask", () => {
    expect(resolveNetIncome([ni("NetIncomeLoss", 3_511)], eps(2.75), shares(1_276.9e6))).toEqual({ picked: null, inconsistent: true });
  });

  it("is n/a when tags disagree and there's no EPS to settle it", () => {
    expect(resolveNetIncome([ni("NetIncomeLoss", 42.8), ni("NetIncomeLossAvailableToCommonStockholdersBasic", 42_746_000)], undefined, undefined)).toEqual({
      picked: null,
      inconsistent: true,
    });
  });

  it("is n/a when the figures disagree in sign as well as units (TheRealReal)", () => {
    const r = resolveNetIncome(
      [ni("NetIncomeLoss", 41_799_000_000), ni("NetIncomeLossAvailableToCommonStockholdersBasic", -41_799_000)],
      eps(-0.36),
      shares(116e6),
    );
    // The figure that agrees with EPS is there, but the one ranked above it is
    // a profit where the 10-K has a loss, not just the same number shifted, so
    // nothing in the filing can be trusted to choose between them.
    expect(r).toEqual({ picked: null, inconsistent: true });
  });
});

describe("fiscalYearsOnly: twelve months that aren't a fiscal year", () => {
  const y = (start: string, end: string) => ({ start, end });

  it("drops a trailing twelve months from a 10-Q (Amazon, year to 30 September 2026)", () => {
    const periods = [y("2025-10-01", "2026-09-30"), y("2025-01-01", "2025-12-31"), y("2024-01-01", "2024-12-31"), y("2023-01-01", "2023-12-31")];
    expect(fiscalYearsOnly(periods).map((p) => p.end)).toEqual(["2025-12-31", "2024-12-31", "2023-12-31"]);
  });

  it("keeps every year across a change of year-end, however many old years there are (H&R Block, April to June)", () => {
    const periods = [
      ...[2016, 2017, 2018, 2019, 2020, 2021].map((yr) => y(`${yr - 1}-05-01`, `${yr}-04-30`)),
      y("2021-07-01", "2022-06-30"),
      y("2022-07-01", "2023-06-30"),
      y("2023-07-01", "2024-06-30"),
    ];
    expect(fiscalYearsOnly(periods)).toHaveLength(periods.length);
  });

  it("keeps a new year-end whose first year follows a transition period (Uxin, March to December)", () => {
    const periods = [y("2022-04-01", "2023-03-31"), y("2023-04-01", "2024-03-31"), y("2025-01-01", "2025-12-31")];
    expect(fiscalYearsOnly(periods)).toHaveLength(3);
  });

  it("keeps 52- and 53-week years, which touch but don't overlap (NVIDIA)", () => {
    const periods = [y("2025-01-27", "2026-01-25"), y("2024-01-29", "2025-01-26"), y("2023-01-30", "2024-01-28")];
    expect(fiscalYearsOnly(periods)).toHaveLength(3);
  });

  it("on a tie, keeps the dates that match the newest year-end", () => {
    const periods = [y("2023-01-01", "2023-12-31"), y("2023-10-01", "2024-09-30"), y("2024-01-01", "2024-12-31"), y("2024-10-01", "2025-09-30")];
    // The two December years each overlap a September one by a quarter or more.
    expect(fiscalYearsOnly(periods).map((p) => p.end).sort()).toEqual(["2024-09-30", "2025-09-30"]);
  });
});

describe("annualReportValue", () => {
  // Tesla's 2025 net income in its companyconcept file (5 November 2026): the
  // 10-K's figure and the proxy statement's restatement of it.
  const fact = (val: number, form: string, filed: string, start = "2025-01-01", end = "2025-12-31") => ({
    start, end, val, form, filed, accn: `${form}-${filed}`, fy: 2025, fp: "FY",
  });
  const facts = [
    fact(3_794_000_000, "10-K", "2026-01-29"),
    fact(3_855_000_000, "DEF 14A", "2026-10-19"),
    fact(1_100_000_000, "10-Q", "2025-10-23", "2025-07-01", "2025-09-30"),
  ];

  it("takes the 10-K's figure, never a proxy statement's", () => {
    expect(annualReportValue(facts, "2025-01-01", "2025-12-31")).toBe(3_794_000_000);
  });

  it("takes a later 10-K's restatement", () => {
    expect(annualReportValue([...facts, fact(3_800_000_000, "10-K", "2027-01-28")], "2025-01-01", "2025-12-31")).toBe(3_800_000_000);
  });

  it("is null when no periodic report has the period", () => {
    expect(annualReportValue([fact(1, "DEF 14A", "2026-10-19")], "2025-01-01", "2025-12-31")).toBeNull();
  });
});
