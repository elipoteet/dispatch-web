// Stage 1's correctness tests. Every fixture in __fixtures__ is a real SEC
// companyfacts response, trimmed to the tags our concept lists name and to
// periods ending 2013 or later — real values, real structure, small enough to
// commit.
//
// The targets below come from docs/phase-nine.md's "Done means" list and were
// cross-checked against the filings themselves.

import { describe, expect, it } from "vitest";
import { normalizeCompanyFacts, pick, type CompanyFacts } from "@/lib/sec/normalize";
import { filerKindFromSic, suppressedItems } from "@/lib/sec/concepts";

import nvdaFixture from "@/lib/sec/__fixtures__/nvda-facts.json";
import aaplFixture from "@/lib/sec/__fixtures__/aapl-facts.json";
import jpmFixture from "@/lib/sec/__fixtures__/jpm-facts.json";
import culpFixture from "@/lib/sec/__fixtures__/culp-facts.json";

type Fixture = CompanyFacts & { meta: { sic: string; name: string; fiscalYearEnd: string } };

const nvda = nvdaFixture as unknown as Fixture;
const aapl = aaplFixture as unknown as Fixture;
const jpm = jpmFixture as unknown as Fixture;
const culp = culpFixture as unknown as Fixture;

// Figures are compared in billions to one decimal, which is how a 10-K reports
// them and how the site will show them. An exact-cents comparison would fail on
// nothing a reader would ever notice.
function billions(value: number): number {
  return Math.round((value / 1e9) * 10) / 10;
}

describe("NVDA fiscal 2026 against the 10-K", () => {
  const { rows } = normalizeCompanyFacts(nvda, { sic: nvda.meta.sic });

  it("matches revenue, net income, operating cash flow and capex", () => {
    expect(billions(pick(rows, "revenue", 2026)!.value)).toBe(215.9);
    expect(billions(pick(rows, "net_income", 2026)!.value)).toBe(120.1);
    expect(billions(pick(rows, "operating_cash_flow", 2026)!.value)).toBe(102.7);
    expect(billions(pick(rows, "capex", 2026)!.value)).toBe(6.0);
  });

  it("derives free cash flow as operating cash flow minus capex", () => {
    const fcf = pick(rows, "free_cash_flow", 2026)!;
    expect(billions(fcf.value)).toBe(96.7);
    // Never presented as reported — no company files this line.
    expect(fcf.derived).toBe(true);
  });

  it("derives Q4 as the full year minus the three filed quarters", () => {
    const q4 = pick(rows, "revenue", 2026, "Q4")!;
    expect(billions(q4.value)).toBe(68.1);
    expect(q4.derived).toBe(true);
  });

  it("gets the right revenue either side of the company's tag switch", () => {
    // NVIDIA files revenue under more than one tag across its history. Which tag
    // wins is an implementation detail and shifts as coverage changes; the value
    // must not. These are the figures in the fiscal 2022 and 2026 10-Ks.
    expect(billions(pick(rows, "revenue", 2022)!.value)).toBe(26.9);
    expect(billions(pick(rows, "revenue", 2026)!.value)).toBe(215.9);
  });

  it("falls back to another tag for a year the main one does not cover", () => {
    // The point of the ordered tag list: a single tag has gaps, and the next one
    // fills them rather than leaving a hole in the table.
    const tags = new Set(
      rows.filter((r) => r.lineItem === "revenue" && r.fiscalPeriod === "FY").map((r) => r.sourceTag),
    );
    expect(tags.size).toBeGreaterThan(1);
  });

  it("follows the capex tag the company actually uses", () => {
    // The common tag (PaymentsToAcquirePropertyPlantAndEquipment) stops in 2012
    // for NVIDIA; it reports capex under PaymentsToAcquireProductiveAssets.
    expect(pick(rows, "capex", 2026)!.sourceTag).toBe("PaymentsToAcquireProductiveAssets");
  });

  it("leaves capex blank for the years the SEC has no tag for, rather than guessing", () => {
    // A documented limitation, not a bug. NVIDIA tagged capital expenditure with
    // a standard concept through fiscal 2012 and again from fiscal 2022, but not
    // in between — and the companyfacts API carries only standard taxonomies, so
    // a company-specific extension tag is invisible to it. Checked exhaustively:
    // no us-gaap concept in NVDA's facts holds the ~$1.1B fiscal 2021 capex.
    //
    // The rule from the brief is "a blank is fine; a wrong number is not", so
    // those years have no capex and therefore no free cash flow. If this ever
    // starts passing, the data got better and the test should go.
    expect(pick(rows, "capex", 2021)).toBeNull();
    expect(pick(rows, "free_cash_flow", 2021)).toBeNull();
    // The years either side of the gap do work.
    expect(pick(rows, "capex", 2026)).not.toBeNull();
  });

  it("gives a full decade of annual revenue", () => {
    const years = rows.filter((r) => r.lineItem === "revenue" && r.fiscalPeriod === "FY").map((r) => r.fiscalYear);
    expect(new Set(years).size).toBeGreaterThanOrEqual(10);
  });

  it("labels fiscal years the way the company does, not by calendar year", () => {
    // NVIDIA's fiscal 2026 ended 25 January 2026. The SEC's `frame` field calls
    // that period CY2025; the company calls it fiscal 2026, and so do we.
    expect(pick(rows, "revenue", 2026)!.periodEnd).toBe("2026-01-25");
  });
});

describe("JPMorgan — a bank, where some lines mean nothing", () => {
  const sic = jpm.meta.sic;
  const { rows, filerKind, suppression } = normalizeCompanyFacts(jpm, { sic });

  it("is detected as a financial filer from its SIC code", () => {
    expect(filerKindFromSic(sic)).toBe("financial");
    expect(filerKind).toBe("financial");
  });

  it("shows no gross margin and no free cash flow, with a stated reason", () => {
    expect(rows.some((r) => r.lineItem === "gross_profit")).toBe(false);
    expect(rows.some((r) => r.lineItem === "free_cash_flow")).toBe(false);
    expect(rows.some((r) => r.lineItem === "capex")).toBe(false);
    expect(suppression?.reason).toMatch(/deposits/i);
    expect(suppression?.items).toContain("free_cash_flow");
  });

  it("still reports revenue and net income", () => {
    const revenue = rows.filter((r) => r.lineItem === "revenue" && r.fiscalPeriod === "FY");
    const income = rows.filter((r) => r.lineItem === "net_income" && r.fiscalPeriod === "FY");
    expect(revenue.length).toBeGreaterThanOrEqual(10);
    expect(income.length).toBeGreaterThanOrEqual(10);
  });

  it("keeps quarterly revenue where the year and the quarters are filed under different tags", () => {
    // Full year under Revenues, quarters under RevenuesNetOfInterestExpense,
    // the same $182.45B total either way.
    const year = pick(rows, "revenue", 2025)!.value;
    expect(billions(year)).toBe(182.4);
    for (const q of ["Q1", "Q2", "Q3", "Q4"] as const) expect(pick(rows, "revenue", 2025, q)).not.toBeNull();
    const quarters = (["Q1", "Q2", "Q3", "Q4"] as const).reduce((s, q) => s + pick(rows, "revenue", 2025, q)!.value, 0);
    expect(quarters).toBeCloseTo(year, -3);
  });

  it("would have produced a meaningless negative free cash flow if unsuppressed", () => {
    // The guard is doing real work: JPMorgan's operating cash flow is negative,
    // which is normal for a bank and would read as alarming on a page that
    // implied it was comparable to NVIDIA's.
    const { rows: unguarded } = normalizeCompanyFacts(jpm, { sic: null });
    const ocf = unguarded.find((r) => r.lineItem === "operating_cash_flow" && r.fiscalPeriod === "FY");
    expect(ocf!.value).toBeLessThan(0);
  });
});

describe("AAPL — a second large filer that also changed revenue tags", () => {
  const { rows } = normalizeCompanyFacts(aapl, { sic: aapl.meta.sic });

  it("produces a decade of revenue and net income", () => {
    const revenue = rows.filter((r) => r.lineItem === "revenue" && r.fiscalPeriod === "FY");
    expect(revenue.length).toBeGreaterThanOrEqual(10);
    expect(rows.filter((r) => r.lineItem === "net_income" && r.fiscalPeriod === "FY").length).toBeGreaterThanOrEqual(10);
  });

  it("computes free cash flow for every year it has both halves", () => {
    const fcf = rows.filter((r) => r.lineItem === "free_cash_flow" && r.fiscalPeriod === "FY");
    expect(fcf.length).toBeGreaterThanOrEqual(10);
    for (const row of fcf) expect(row.derived).toBe(true);
  });

  it("keeps gross profit, which a product company does report", () => {
    expect(rows.some((r) => r.lineItem === "gross_profit" && r.fiscalPeriod === "FY")).toBe(true);
  });
});

describe("CULP — a small cap", () => {
  const { rows, filerKind } = normalizeCompanyFacts(culp, { sic: culp.meta.sic });

  it("is an operating company and produces real history", () => {
    expect(filerKind).toBe("operating");
    expect(rows.filter((r) => r.lineItem === "revenue" && r.fiscalPeriod === "FY").length).toBeGreaterThanOrEqual(10);
  });

  it("reports losses as negative numbers rather than dropping them", () => {
    // A small cap swings to losses; the normaliser must carry the sign through
    // rather than treating a negative as missing data.
    const income = rows.filter((r) => r.lineItem === "net_income" && r.fiscalPeriod === "FY");
    expect(income.length).toBeGreaterThanOrEqual(10);
    expect(income.some((r) => r.value < 0)).toBe(true);
  });
});

describe("rules that apply to every filer", () => {
  for (const [name, fixture] of [
    ["NVDA", nvda],
    ["AAPL", aapl],
    ["JPM", jpm],
    ["CULP", culp],
  ] as const) {
    const { rows } = normalizeCompanyFacts(fixture, { sic: fixture.meta.sic });

    it(`${name}: never stores the same line item twice for one period`, () => {
      const seen = new Set<string>();
      for (const r of rows) {
        const key = `${r.fiscalYear}|${r.fiscalPeriod}|${r.lineItem}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    });

    it(`${name}: balance-sheet items are never summed into a Q4`, () => {
      // Instants are point-in-time. A derived Q4 for total assets would be
      // arithmetic on a photograph.
      const derivedInstants = rows.filter(
        (r) => r.derived && (r.lineItem === "total_assets" || r.lineItem === "total_equity"),
      );
      expect(derivedInstants).toHaveLength(0);
    });

    it(`${name}: every row records the tag it came from`, () => {
      for (const r of rows) expect(r.sourceTag.length).toBeGreaterThan(0);
    });
  }
});

describe("quarters unwound from year-to-date cash flow", () => {
  // Cash-flow statements in 10-Qs are running totals. The quarters we derive
  // must add back up to the six- and nine-month totals each company filed.
  // Checked against the filings themselves, so this can't pass by repeating
  // the normaliser's own arithmetic.
  const spanDays = (f: { start?: string; end: string }) =>
    f.start ? (Date.parse(f.end) - Date.parse(f.start)) / 86_400_000 : 0;

  for (const [name, fixture, tag] of [
    ["NVDA", nvda, "NetCashProvidedByUsedInOperatingActivities"],
    ["AAPL", aapl, "NetCashProvidedByUsedInOperatingActivities"],
    ["AAPL", aapl, "PaymentsForRepurchaseOfCommonStock"],
  ] as const) {
    it(`${name} ${tag}: Q1+Q2 and Q1+Q2+Q3 match the filed running totals`, () => {
      const { rows } = normalizeCompanyFacts(fixture, { sic: fixture.meta.sic });
      const item = tag.startsWith("Payments") ? "buybacks" : "operating_cash_flow";
      const filed = fixture.facts["us-gaap"][tag].units.USD.filter((f) => f.form === "10-Q");
      let checked = 0;
      for (const [quarters, lo, hi] of [
        [["Q1", "Q2"], 170, 190],
        [["Q1", "Q2", "Q3"], 260, 280],
      ] as const) {
        for (const f of filed.filter((x) => spanDays(x) >= lo && spanDays(x) <= hi)) {
          const last = rows.find((r) => r.lineItem === item && r.fiscalPeriod === quarters.at(-1) && r.periodEnd === f.end);
          if (!last || last.sourceTag !== tag) continue;
          const parts = quarters.map((q) => pick(rows, item, last.fiscalYear, q));
          if (parts.some((p) => !p)) continue;
          // The newest filing of a period wins when it was restated.
          const latest = filed
            .filter((x) => x.start === f.start && x.end === f.end)
            .sort((a, b) => (a.filed < b.filed ? 1 : -1))[0];
          expect(parts.reduce((s, p) => s + p!.value, 0)).toBeCloseTo(latest.val, -6);
          checked++;
        }
      }
      expect(checked).toBeGreaterThanOrEqual(10);
    });
  }

  it("never gives a negative quarter for money spent", () => {
    for (const fx of [nvda, aapl]) {
      const { rows } = normalizeCompanyFacts(fx, { sic: fx.meta.sic });
      const negative = rows.filter((r) => (r.lineItem === "capex" || r.lineItem === "buybacks") && r.value < 0);
      expect(negative).toEqual([]);
    }
  });
});

describe("stage 4: debt and shares outstanding", () => {
  const n = normalizeCompanyFacts(nvda, { sic: nvda.meta.sic }).rows;
  const a = normalizeCompanyFacts(aapl, { sic: aapl.meta.sic }).rows;
  const j = normalizeCompanyFacts(jpm, { sic: jpm.meta.sic }).rows;

  it("reads total debt as of the balance-sheet date", () => {
    // NVIDIA's 10-K for fiscal 2026: $8.5B of long-term debt, current portion
    // included. Apple's fiscal 2025 10-K: $90.7B of term debt.
    const nv = pick(n, "total_debt", 2026, "Q4")!;
    expect(billions(nv.value)).toBe(8.5);
    expect(nv.periodEnd).toBe("2026-01-25");
    expect(billions(pick(a, "total_debt", 2025, "Q4")!.value)).toBe(90.7);
  });

  it("reads shares outstanding from each filing's cover page, dated on the cover", () => {
    const nv = pick(n, "shares_outstanding", 2026, "FY")!;
    expect(billions(nv.value)).toBe(24.3);
    expect(nv.periodEnd).toBe("2026-02-20");
    expect(nv.sourceTag).toBe("dei:EntityCommonStockSharesOutstanding");
    expect(billions(pick(a, "shares_outstanding", 2026, "Q3")!.value)).toBe(14.6);
    expect(billions(pick(j, "shares_outstanding", 2026, "Q2")!.value)).toBe(2.7);
  });

  it("keeps each cover in the units of its own date, so a split shows as a jump", () => {
    // NVIDIA's 10-for-1 split took effect on 10 June 2024, between these covers.
    // The valuation code converts both to today's basis; the normaliser doesn't.
    const before = pick(n, "shares_outstanding", 2025, "Q1")!;
    const after = pick(n, "shares_outstanding", 2025, "Q2")!;
    expect(after.value / before.value).toBeGreaterThan(9.5);
    expect(after.value / before.value).toBeLessThan(10.5);
  });

  it("leaves debt blank where the bank stopped using the standard tag", () => {
    // JPMorgan's LongTermDebt stops in 2014. The newest debt row is old, and
    // nothing carries it forward into later years.
    const newest = j.filter((r) => r.lineItem === "total_debt").map((r) => r.periodEnd).sort().pop()!;
    expect(newest < "2015-01-01").toBe(true);
  });

  it("never derives a quarterly share count by subtraction", () => {
    for (const rows of [n, a, j]) {
      expect(rows.filter((r) => r.lineItem === "shares_diluted" && r.derived)).toHaveLength(0);
      for (const r of rows.filter((x) => x.lineItem === "shares_diluted")) expect(r.value).toBeGreaterThan(0);
    }
  });
});

describe("stage 5: diluted earnings per share", () => {
  const n = normalizeCompanyFacts(nvda, { sic: nvda.meta.sic }).rows;

  it("reads NVIDIA's quarterly EPS as filed in its 10-Qs", () => {
    // GAAP diluted EPS, fiscal 2026: $0.76, $1.08, $1.30.
    expect(pick(n, "eps_diluted", 2026, "Q1")!.value).toBeCloseTo(0.76, 2);
    expect(pick(n, "eps_diluted", 2026, "Q2")!.value).toBeCloseTo(1.08, 2);
    expect(pick(n, "eps_diluted", 2026, "Q3")!.value).toBeCloseTo(1.3, 2);
    expect(pick(n, "eps_diluted", 2026, "Q1")!.unit).toBe("USD/shares");
  });

  it("agrees with net income over diluted shares for the year", () => {
    // An independent check: the year's EPS is the year's net income divided
    // by the year's weighted diluted share count, to within a cent or two.
    const perShare = (fx: typeof nvda) => {
      const rows = normalizeCompanyFacts(fx, { sic: fx.meta.sic }).rows;
      return {
        eps: pick(rows, "eps_diluted", 2025)!.value,
        simple: pick(rows, "net_income", 2025)!.value / pick(rows, "shares_diluted", 2025)!.value,
      };
    };
    for (const fx of [nvda, aapl]) {
      const { eps, simple } = perShare(fx);
      expect(Math.abs(eps - simple)).toBeLessThan(0.02);
    }
    // JPMorgan's is lower, and should be: its EPS is struck after the dividends
    // on its preferred stock, which belong to no common shareholder.
    const j = perShare(jpm);
    expect(j.eps).toBeLessThan(j.simple);
    expect(j.simple - j.eps).toBeLessThan(1);
  });

  it("stores only what was filed: no fourth quarter, nothing derived", () => {
    // Q4 EPS is the Earnings tab's to work out, on one share basis.
    expect(pick(n, "eps_diluted", 2026, "Q4")).toBeNull();
    expect(n.filter((r) => r.lineItem === "eps_diluted" && r.derived)).toEqual([]);
    expect(pick(n, "eps_diluted", 2026, "FY")).not.toBeNull();
  });

  it("keeps a loss as a negative EPS (Culp)", () => {
    const c = normalizeCompanyFacts(culp, { sic: culp.meta.sic }).rows;
    expect(c.some((r) => r.lineItem === "eps_diluted" && r.fiscalPeriod === "FY" && r.value < 0)).toBe(true);
  });
});

describe("suppression rules", () => {
  it("leaves ordinary operating companies untouched", () => {
    expect(suppressedItems(filerKindFromSic(3674))).toBeNull();
  });

  it("hides gross margin for a REIT but keeps cash flow", () => {
    const s = suppressedItems(filerKindFromSic(6798));
    expect(s?.items).toContain("gross_profit");
    expect(s?.items).not.toContain("free_cash_flow");
  });

  it("treats an unknown SIC as an operating company", () => {
    expect(filerKindFromSic(null)).toBe("operating");
    expect(filerKindFromSic(undefined)).toBe("operating");
  });
});
