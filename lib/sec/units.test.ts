import { describe, expect, it } from "vitest";
import { hasUnitsConflict, looksLikeUnitsError, settleCashFlow, settleNetIncome, settleRevenue } from "@/lib/sec/units";
import { normalizeCompanyFacts, type CompanyFacts } from "@/lib/sec/normalize";
import tygoFixture from "@/lib/sec/__fixtures__/tygo-facts.json";

const v = (tag: string, val: number) => ({ tag, val });

describe("looksLikeUnitsError", () => {
  it("recognises the same figure in two units, not two different figures far apart", () => {
    expect(looksLikeUnitsError(103_536_000_000, 103_536_000)).toBe(true); // Tigo Energy's revenue
    expect(looksLikeUnitsError(42_746_000, 42.8)).toBe(true); // net income filed in millions
    expect(looksLikeUnitsError(3_040_725_000, 7_042_000)).toBe(false); // AvalonBay: rent isn't customer-contract revenue
    expect(looksLikeUnitsError(16_978_000_000, 3_000_000)).toBe(false); // Fannie Mae 2024
    expect(looksLikeUnitsError(14_364_000_000, 9_000_000)).toBe(false); // Fannie Mae 2025: 1,596 times
    expect(looksLikeUnitsError(109_244_000, -154_000)).toBe(false); // CarGurus 2021: 709 times, both real
    expect(looksLikeUnitsError(3_307_239_000, 4_302_000)).toBe(false); // IAC 2017 revenue and its goods sales: 769 times
    expect(looksLikeUnitsError(100, 0)).toBe(false);
    expect(hasUnitsConflict([1, 2, 3])).toBe(false);
    expect(hasUnitsConflict([5, 5_000])).toBe(true);
  });
});

describe("settleRevenue", () => {
  const tigo = [v("RevenueFromContractWithCustomerExcludingAssessedTax", 103_536_000_000), v("Revenues", 103_536_000)];

  it("takes the figure that is gross profit plus cost of revenue (Tigo Energy)", () => {
    expect(settleRevenue(tigo, 44_351_000, 59_185_000)).toEqual({ picked: tigo[1], inconsistent: false });
  });

  it("is n/a without both to check against", () => {
    expect(settleRevenue(tigo, null, 59_185_000)).toEqual({ picked: null, inconsistent: true });
  });

  it("leaves agreeing tags alone, and a REIT's revenue slice too", () => {
    expect(settleRevenue([v("Revenues", 3_040_725_000), v("RevenueFromContractWithCustomerExcludingAssessedTax", 7_042_000)], null, null).picked?.tag).toBe("Revenues");
  });
});

describe("settleCashFlow", () => {
  it("is n/a when its tags disagree by a units factor, the first tag otherwise", () => {
    expect(settleCashFlow([v("A", -2_075_000), v("B", -2_075)]).inconsistent).toBe(true);
    // 1,200 times apart is not the same figure in two units: left alone.
    expect(settleCashFlow([v("A", -2_489_676), v("B", -2_075)]).picked?.tag).toBe("A");
    expect(settleCashFlow([v("A", 10), v("B", 11)]).picked?.tag).toBe("A");
  });
});

describe("settleNetIncome", () => {
  it("takes the figure in the 10-K's units when tags disagree (FedEx-like)", () => {
    const r = settleNetIncome([v("NetIncomeLoss", 4_433), v("NetIncomeLossAvailableToCommonStockholdersBasic", 4_426_000_000)], 18.19, 243.3e6, null);
    expect(r.picked?.tag).toBe("NetIncomeLossAvailableToCommonStockholdersBasic");
  });

  it("keeps net income across a real gap to income to common (Fannie Mae, 1,596 times)", () => {
    const r = settleNetIncome([v("NetIncomeLoss", 14_364_000_000), v("NetIncomeLossAvailableToCommonStockholdersBasic", 9_000_000)], 0.0, 5_867e6, null);
    expect(r.picked?.val).toBe(14_364_000_000);
  });

  it("won't pass over a figure that isn't a shifted copy of the one EPS agrees with", () => {
    // Net income $41.8 billion (a profit) against a $41.8 million loss in the
    // same units step: not the same figure, so n/a rather than a choice.
    const r = settleNetIncome([v("NetIncomeLoss", 41_799_000_000), v("NetIncomeLossAvailableToCommonStockholdersBasic", -41_799_000)], -0.36, 116e6, null);
    expect(r).toEqual({ picked: null, inconsistent: true });
  });

  it("asks operating income when the only tag disagrees with EPS x shares", () => {
    // Net income in thousands: operating income agrees with EPS, so n/a.
    expect(settleNetIncome([v("NetIncomeLoss", -4_560)], -0.56, 8_084_372, -3_900_000).inconsistent).toBe(true);
    // Share count in thousands: net income agrees with operating income, so it stands.
    expect(settleNetIncome([v("NetIncomeLoss", 18_481_000)], 0.41, 44_933, 30_000_000).picked?.val).toBe(18_481_000);
    expect(settleNetIncome([v("NetIncomeLoss", 3_511)], 2.75, 1_276.9e6, null).inconsistent).toBe(true);
  });

  it("takes the first tag when everything agrees", () => {
    expect(settleNetIncome([v("NetIncomeLoss", 120_067e6)], 4.9, 24_514e6, 130_387e6).picked?.val).toBe(120_067e6);
  });
});

describe("the research file's normaliser, on Tigo Energy's real filings", () => {
  // Tigo's 10-Ks tag revenue under Revenues correctly and under the
  // customer-contract tag a thousand times too large (companyfacts, 5 November
  // 2026). Before NORMALIZER_VERSION 10 its page showed $103.5 billion.
  const { rows } = normalizeCompanyFacts(tygoFixture as unknown as CompanyFacts, { sic: "3674" });
  const fy = (item: string, year: number) => rows.find((r) => r.lineItem === item && r.fiscalPeriod === "FY" && r.fiscalYear === year);

  it("shows 2025 revenue as $103.5 million, from Revenues", () => {
    expect(fy("revenue", 2025)).toMatchObject({ value: 103_536_000, sourceTag: "Revenues" });
    expect(fy("revenue", 2024)).toMatchObject({ value: 54_014_000, sourceTag: "Revenues" });
  });

  it("keeps the rest of the year as filed", () => {
    expect(fy("gross_profit", 2025)?.value).toBe(44_351_000);
    expect(fy("net_income", 2025)?.value).toBe(-1_880_000);
  });

  it("has no revenue figure anywhere near a billion dollars", () => {
    for (const r of rows.filter((x) => x.lineItem === "revenue")) expect(Math.abs(r.value)).toBeLessThan(1e9);
  });
});

describe("figures that are far apart but both real stay as they are", () => {
  it("CarGurus 2021: net income stands beside income to common of -$154,000 and EPS of $0.00", () => {
    const r = settleNetIncome(
      [v("NetIncomeLoss", 109_244_000), v("ProfitLoss", 110_373_000), v("NetIncomeLossAvailableToCommonStockholdersBasic", -154_000)],
      0,
      117_142_062,
      148_268_000,
    );
    expect(r).toEqual({ picked: { tag: "NetIncomeLoss", val: 109_244_000 }, inconsistent: false });
  });

  it("IAC 2017: revenue stands beside its goods sales", () => {
    const r = settleRevenue([v("Revenues", 3_307_239_000), v("SalesRevenueGoodsNet", 4_302_000)], null, 651_008_000);
    expect(r.picked?.val).toBe(3_307_239_000);
  });
});
