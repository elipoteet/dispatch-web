// Phase nine, stage 2: the Overview's facts and key stats, the Financials
// table, search, and the description's spending rule. Company checks run on
// the real SEC companyfacts saved in lib/sec/__fixtures__ (NVIDIA, JPMorgan,
// Apple, Culp), with the expected figures checked against their 10-Ks.

import { describe, expect, it } from "vitest";
import { normalizeCompanyFacts, type CompanyFacts, type FinancialRow } from "@/lib/sec/normalize";
import type { FilerKind } from "@/lib/sec/concepts";
import nvdaFixture from "@/lib/sec/__fixtures__/nvda-facts.json";
import jpmFixture from "@/lib/sec/__fixtures__/jpm-facts.json";
import aaplFixture from "@/lib/sec/__fixtures__/aapl-facts.json";
import culpFixture from "@/lib/sec/__fixtures__/culp-facts.json";
import { whatStandsOut } from "@/lib/research/standsOut";
import { keyStats, marketValue } from "@/lib/research/keyStats";
import { buildFinancialsView } from "@/lib/research/financialsView";
import { FinancialSeries } from "@/lib/research/series";
import { searchCompanies } from "@/lib/research/search";
import { fiscalYearEndMonth, formatMoney, formatSignedPct, titleCaseName, yearPhrase } from "@/lib/research/format";
import { descriptionToShow, needsDescription } from "@/lib/research/description";

type Fixture = CompanyFacts & { meta: { sic: string; fiscalYearEnd: string } };

function load(fixture: unknown) {
  const fx = fixture as Fixture;
  const { rows, filerKind, suppression } = normalizeCompanyFacts(fx, { sic: fx.meta.sic });
  return { rows, filerKind, suppression, fiscalYearEnd: fx.meta.fiscalYearEnd };
}

const nvda = load(nvdaFixture);
const jpm = load(jpmFixture);
const aapl = load(aaplFixture);
const culp = load(culpFixture);

// Words that would turn a fact into a verdict, or trip Stage 4's scan of the
// rendered page for "buy", "sell" and "hold".
const VERDICT_WORDS =
  /\b(buy|buying|sell|selling|hold|holding|strong|weak|impressive|concerning|worrying|undervalued|overvalued|cheap|expensive|attractive|should|recommend\w*|target|fair value|upside|downside)\b/i;

function row(lineItem: FinancialRow["lineItem"], fiscalYear: number, value: number, fiscalPeriod: FinancialRow["fiscalPeriod"] = "FY"): FinancialRow {
  return {
    fiscalYear,
    fiscalPeriod,
    lineItem,
    value,
    periodEnd: `${fiscalYear}-12-31`,
    unit: "USD",
    sourceTag: "test",
    accession: "test",
    filedAt: "",
    restated: false,
    derived: false,
    source: "sec",
  };
}

describe("whatStandsOut — real companies", () => {
  it("NVIDIA: growth, the gross-margin slip, and repurchases against free cash flow", () => {
    const { facts, fiscalYear } = whatStandsOut({ ...nvda });
    expect(fiscalYear).toBe(2026);
    expect(facts.map((f) => f.text)).toEqual([
      // $215.9B against $5.0B in fiscal 2016; 65% over fiscal 2025's $130.5B.
      "Revenue is 43 times what it was in fiscal 2016, and rose 65% in fiscal 2026 to $215.9B.",
      "Gross margin fell from 75.0% to 71.1% in fiscal 2026, the first decline since fiscal 2023.",
      // $40.1B of repurchases against $96.7B of free cash flow.
      "It spent $40.1B repurchasing its own shares in fiscal 2026, about 41% of its free cash flow.",
    ]);
  });

  it("NVIDIA: never states a share-count change across its stock splits", () => {
    const { facts } = whatStandsOut({ ...nvda }, 10);
    expect(facts.find((f) => f.id === "share-count")).toBeUndefined();
  });

  it("JPMorgan: compares repurchases to net income, and says nothing about gross margin", () => {
    const { facts } = whatStandsOut({ ...jpm });
    const texts = facts.map((f) => f.text);
    expect(texts).toContain("It spent $31.6B repurchasing its own shares in 2025, about 55% of its net income.");
    expect(texts.some((t) => /gross margin/i.test(t))).toBe(false);
  });

  it("Apple: reports a share count that fell with no split in the window", () => {
    const { facts } = whatStandsOut({ ...aapl }, 10);
    expect(facts.map((f) => f.text)).toContain("Its diluted share count is 14% lower than in fiscal 2020.");
  });

  it("Culp: leads with the run of losses", () => {
    const { facts } = whatStandsOut({ ...culp });
    expect(facts[0].text).toBe("It has reported a net loss in each of the last 5 years, $10.2M in 2026.");
  });

  it("never uses verdict language, for any company", () => {
    for (const company of [nvda, jpm, aapl, culp]) {
      for (const fact of whatStandsOut({ ...company, price: 100, range52: { low: 99, high: 101 } }, 10).facts) {
        expect(fact.text).not.toMatch(VERDICT_WORDS);
      }
    }
  });
});

describe("whatStandsOut — rules on constructed figures", () => {
  const base = (rows: FinancialRow[], filerKind: FilerKind = "operating") => ({ rows, filerKind, fiscalYearEnd: "1231" });

  it("states a swing from loss to profit", () => {
    const { facts } = whatStandsOut(base([row("revenue", 2024, 100e6), row("revenue", 2025, 120e6), row("net_income", 2024, -5e6), row("net_income", 2025, 8e6)]));
    expect(facts[0].text).toBe("It earned a $8.0M profit in 2025 after a $5.0M loss in 2024.");
  });

  it("states a swing from profit to loss", () => {
    const { facts } = whatStandsOut(base([row("revenue", 2025, 1e9), row("net_income", 2024, 2e9), row("net_income", 2025, -1.5e9)]));
    expect(facts[0].text).toBe("It lost $1.5B in 2025 after a $2.0B profit in 2024.");
  });

  it("calls a widening margin the highest shown only when it is", () => {
    const rows: FinancialRow[] = [];
    const margins = [0.3, 0.32, 0.31, 0.33, 0.36];
    margins.forEach((m, i) => {
      rows.push(row("revenue", 2021 + i, 100), row("gross_profit", 2021 + i, m * 100));
    });
    const { facts } = whatStandsOut(base(rows), 10);
    expect(facts.find((f) => f.id === "margin")?.text).toBe("Gross margin rose from 33.0% to 36.0% in 2025, the highest in the 5 years shown.");
  });

  it("ignores a margin move under two points", () => {
    const rows = [row("revenue", 2024, 100), row("gross_profit", 2024, 40), row("revenue", 2025, 100), row("gross_profit", 2025, 41.5)];
    expect(whatStandsOut(base(rows), 10).facts.find((f) => f.id === "margin")).toBeUndefined();
  });

  it("notes a price at the edge of its 52-week range, and stays quiet in the middle", () => {
    const rows = [row("revenue", 2025, 100)];
    const near = whatStandsOut({ ...base(rows), price: 99.4, range52: { low: 50, high: 100 } }, 10);
    expect(near.facts.find((f) => f.id === "range")?.text).toBe("The stock is within 1% of its 52-week high.");
    const middle = whatStandsOut({ ...base(rows), price: 75, range52: { low: 50, high: 100 } }, 10);
    expect(middle.facts.find((f) => f.id === "range")).toBeUndefined();
  });

  it("returns nothing for a company with no annual figures", () => {
    expect(whatStandsOut(base([row("revenue", 2025, 10, "Q1")]))).toEqual({ facts: [], fiscalYear: null });
  });
});

describe("keyStats", () => {
  it("NVIDIA: market value, P/E from trailing earnings, and the margin move", () => {
    const stats = keyStats({ ...nvda, price: 200, sharesOutstandingMillions: 24_100, marketCapMillions: null, averageVolume: 180e6 });
    const byId = Object.fromEntries(stats.map((s) => [s.id, s]));
    expect(byId["market-value"].value).toBe("$4.82T");
    const ttm = new FinancialSeries(nvda.rows).trailingTwelveMonths("net_income")!.value;
    expect(byId.pe.value).toBe(((200 * 24_100e6) / ttm).toFixed(1));
    expect(byId.revenue).toMatchObject({ label: "Revenue FY26", value: "$215.9B", note: "+65% on the year" });
    expect(byId["gross-margin"]).toMatchObject({ value: "71.1%", note: "Down from 75.0%" });
    expect(byId.fcf.value).toBe("$96.7B");
    expect(byId.repurchases).toMatchObject({ label: "Repurchases FY26", value: "$40.1B" });
    expect(byId.volume.value).toBe("180.0M");
  });

  it("JPMorgan: no gross margin or free cash flow; total assets instead", () => {
    const ids = keyStats({ ...jpm, price: 300, sharesOutstandingMillions: 2_750, marketCapMillions: null, averageVolume: null }).map((s) => s.id);
    expect(ids).not.toContain("gross-margin");
    expect(ids).not.toContain("fcf");
    expect(ids).toContain("assets");
  });

  it("Culp: a P/E over a loss is shown as not meaningful, not as a negative number", () => {
    const pe = keyStats({ ...culp, price: 5, sharesOutstandingMillions: 12.5, marketCapMillions: null, averageVolume: null }).find((s) => s.id === "pe");
    expect(pe).toMatchObject({ value: "—", note: "Not meaningful: a loss over the last 12 months" });
  });

  it("falls back to the provider's market cap when there is no share count", () => {
    expect(marketValue({ price: 10, sharesOutstandingMillions: null, marketCapMillions: 500 })).toBe(500e6);
    expect(marketValue({ price: null, sharesOutstandingMillions: null, marketCapMillions: null })).toBeNull();
  });

  it("uses no verdict language in any label or note", () => {
    for (const company of [nvda, jpm, aapl, culp]) {
      for (const stat of keyStats({ ...company, price: 100, sharesOutstandingMillions: 100, marketCapMillions: null, averageVolume: 1e6 })) {
        expect(`${stat.label} ${stat.note}`).not.toMatch(VERDICT_WORDS);
      }
    }
  });
});

describe("buildFinancialsView", () => {
  it("NVIDIA annual: ten fiscal years, in billions, with growth and margin rows", () => {
    const view = buildFinancialsView({ ...nvda, suppressed: [] }).annual!;
    expect(view.columns.map((c) => c.label)).toEqual(["FY17", "FY18", "FY19", "FY20", "FY21", "FY22", "FY23", "FY24", "FY25", "FY26"]);
    expect(view.unitLabel).toBe("$ billions");
    const revenue = view.rows.find((r) => r.id === "revenue")!;
    expect(revenue.cells.at(-1)!.display).toBe("216");
    expect(revenue.cells[0].display).toBe("6.91");
    expect(view.rows.find((r) => r.id === "revenue-growth")!.cells.at(-1)!.display).toBe("+65%");
    expect(view.rows.find((r) => r.id === "gross-margin")!.cells.at(-1)!.display).toBe("71.1%");
    expect(view.rows.find((r) => r.id === "free_cash_flow")!.cells.at(-1)!.display).toBe("96.68");
  });

  it("NVIDIA quarterly: twelve quarters, growth against the same quarter a year earlier", () => {
    const view = buildFinancialsView({ ...nvda, suppressed: [] }).quarterly!;
    expect(view.columns).toHaveLength(12);
    const s = new FinancialSeries(nvda.rows);
    const last = view.columns.at(-1)!.key.split("-");
    const fy = Number(last[0]);
    const q = last[1] as "Q1" | "Q2" | "Q3" | "Q4";
    const expected = Math.round(((s.quarterly("revenue", { fiscalYear: fy, quarter: q })! / s.quarterly("revenue", { fiscalYear: fy - 1, quarter: q })!) - 1) * 100);
    expect(Math.round(view.rows.find((r) => r.id === "revenue-growth")!.cells.at(-1)!.value!)).toBe(expected);
  });

  it("JPMorgan: suppressed lines are absent, restated cells are marked, years read as plain years", () => {
    const view = buildFinancialsView({ ...jpm, suppressed: jpm.suppression!.items }).annual!;
    const ids = view.rows.map((r) => r.id);
    expect(ids).not.toContain("gross-margin");
    expect(ids).not.toContain("free_cash_flow");
    expect(ids).not.toContain("capex");
    expect(view.columns.at(-1)!.label).toBe("2025");
    expect(view.rows.find((r) => r.id === "revenue")!.cells[0].marks).toContain("restated");
  });

  it("JPMorgan: balance-sheet rows show the year-end figures its 10-K states", () => {
    // Item 1 of the 2025 10-K: "$4.4 trillion in assets and $362.4 billion in
    // stockholders' equity as of December 31, 2025".
    const rows = buildFinancialsView({ ...jpm, suppressed: jpm.suppression!.items }).annual!.rows;
    const lastValue = (id: string) => rows.find((r) => r.id === id)!.cells.at(-1)!.value!;
    expect(formatMoney(lastValue("total_assets"))).toBe("$4.42T");
    expect(formatMoney(lastValue("total_equity"))).toBe("$362.4B");
  });

  it("Culp: a small company's table reads in millions", () => {
    expect(buildFinancialsView({ ...culp, suppressed: [] }).annual!.unitLabel).toBe("$ millions");
  });

  it("does not show a share-count row while splits are unadjusted", () => {
    const ids = buildFinancialsView({ ...nvda, suppressed: [] }).annual!.rows.map((r) => r.id);
    expect(ids).not.toContain("shares_diluted");
  });

  it("states the two ends rather than a multiple across a loss", () => {
    const metric = buildFinancialsView({ ...culp, suppressed: [] }).annual!.metrics.find((m) => m.id === "net_income")!;
    expect(metric.summary).toBe("$22.3M in 2017, -$10.2M in 2026");
  });
});

describe("series", () => {
  it("refuses a trailing twelve months with a missing quarter", () => {
    const s = new FinancialSeries([row("net_income", 2025, 1, "Q1"), row("net_income", 2025, 1, "Q2"), row("net_income", 2025, 1, "Q4"), row("net_income", 2026, 1, "Q1")]);
    expect(s.trailingTwelveMonths("net_income")).toBeNull();
  });

  it("sums four consecutive quarters across a year boundary", () => {
    const s = new FinancialSeries([row("net_income", 2025, 1, "Q3"), row("net_income", 2025, 2, "Q4"), row("net_income", 2026, 3, "Q1"), row("net_income", 2026, 4, "Q2")]);
    expect(s.trailingTwelveMonths("net_income")).toEqual({ value: 10, through: { fiscalYear: 2026, quarter: "Q2" } });
  });

  it("computes gross margin from cost of revenue when no gross profit line is filed", () => {
    const s = new FinancialSeries([row("revenue", 2025, 200), row("cost_of_revenue", 2025, 150)]);
    expect(s.grossMargin(2025)).toBeCloseTo(0.25);
  });
});

describe("searchCompanies", () => {
  const entries = [
    { symbol: "AAPL", name: "Apple Inc." },
    { symbol: "NVDA", name: "NVIDIA CORP" },
    { symbol: "BRK-B", name: "BERKSHIRE HATHAWAY INC" },
    { symbol: "APLE", name: "APPLE HOSPITALITY REIT, INC." },
    { symbol: "JPM", name: "JPMORGAN CHASE & CO" },
    { symbol: "PINE", name: "ALPINE INCOME PROPERTY TRUST, INC." },
  ];

  it("puts the exact ticker first", () => {
    expect(searchCompanies(entries, "aapl")[0]).toEqual({ symbol: "AAPL", name: "Apple Inc." });
  });

  it("finds a company by name, largest first, and title-cases the SEC's capitals", () => {
    expect(searchCompanies(entries, "apple").map((r) => r.symbol)).toEqual(["AAPL", "APLE"]);
    expect(searchCompanies(entries, "nvidia")[0].name).toBe("Nvidia Corp");
  });

  it("matches a word inside the name", () => {
    expect(searchCompanies(entries, "chase")[0].symbol).toBe("JPM");
  });

  it("accepts a dot for the SEC's hyphenated share classes, and links to the dotted form", () => {
    expect(searchCompanies(entries, "BRK.B")[0]).toEqual({ symbol: "BRK.B", name: "Berkshire Hathaway Inc" });
  });

  it("returns nothing for an empty query", () => {
    expect(searchCompanies(entries, "  ")).toEqual([]);
  });
});

describe("description download rule", () => {
  const filing = { accession: "0001-26-000021", filed: "2026-02-25", reportDate: "2026-01-25", form: "10-K", primaryDocument: "x.htm" };
  const stored = (accession: string, status: "ok" | "unavailable" = "ok") => ({
    available: true as const,
    row: { status, description: status === "ok" ? "Two sentences." : "", sourceAccession: accession, sourceForm: "10-K", generatedAt: "" },
  });

  it("downloads nothing until the table exists", () => {
    expect(needsDescription({ available: false }, filing)).toBe(false);
  });

  it("reads the 10-K once for a company with no description", () => {
    expect(needsDescription({ available: true, row: null }, filing)).toBe(true);
  });

  it("does not re-read the same annual report, even one marked unavailable", () => {
    expect(needsDescription(stored(filing.accession), filing)).toBe(false);
    expect(needsDescription(stored(filing.accession, "unavailable"), filing)).toBe(false);
  });

  it("re-reads when a newer annual report is filed", () => {
    expect(needsDescription(stored("0001-25-000001"), filing)).toBe(true);
  });

  it("shows only a successful quote", () => {
    expect(descriptionToShow(stored(filing.accession))?.description).toBe("Two sentences.");
    expect(descriptionToShow(stored(filing.accession, "unavailable"))).toBeNull();
  });
});

describe("format", () => {
  it("formats the money sizes the pages use", () => {
    expect(formatMoney(5.77e12)).toBe("$5.77T");
    expect(formatMoney(215.938e9)).toBe("$215.9B");
    expect(formatMoney(-10.21e6)).toBe("-$10.2M");
  });

  it("never prints a negative zero", () => {
    expect(formatSignedPct(-0.004)).toBe("0%");
    expect(formatSignedPct(64.7)).toBe("+65%");
  });

  it("reads fiscal calendars the way the company does", () => {
    expect(fiscalYearEndMonth("0131")).toBe("January");
    expect(yearPhrase(2026, "0131")).toBe("fiscal 2026");
    expect(yearPhrase(2025, "1231")).toBe("2025");
    // A 52/53-week year ending within a week of New Year is the calendar year.
    expect(yearPhrase(2025, "1227")).toBe("2025");
    expect(yearPhrase(2025, "0103")).toBe("2025");
    expect(yearPhrase(2025, "0927")).toBe("fiscal 2025");
    expect(yearPhrase(2025, "1130")).toBe("fiscal 2025");
  });

  it("title-cases SEC names but keeps names already in mixed case", () => {
    expect(titleCaseName("JPMORGAN CHASE & CO")).toBe("Jpmorgan Chase & Co");
    expect(titleCaseName("Apple Inc.")).toBe("Apple Inc.");
  });

  it("keeps abbreviations in capitals", () => {
    expect(titleCaseName("SPDR S&P 500 ETF TRUST")).toBe("SPDR S&P 500 ETF Trust");
    expect(titleCaseName("AT&T INC.")).toBe("AT&T Inc.");
  });

  it("drops the SEC's filing suffixes from names", () => {
    expect(titleCaseName("COSTCO WHOLESALE CORP /NEW")).toBe("Costco Wholesale Corp");
    expect(titleCaseName("EXXON MOBIL CORP /DE/")).toBe("Exxon Mobil Corp");
  });
});
