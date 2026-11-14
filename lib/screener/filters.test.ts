import { describe, expect, it } from "vitest";
import {
  MAX_SHOW,
  NO_FILTERS,
  PAGE_SIZE,
  RANGE_FILTERS,
  boundLabel,
  boxText,
  chipText,
  conditions,
  dayLabel,
  describeScreen,
  filterLines,
  formatFigure,
  isOpeningView,
  medianText,
  moneyParam,
  moneyWords,
  parseCount,
  parseMoney,
  parsePercent,
  parseRatio,
  parseView,
  rangeFilter,
  resultColumns,
  sortPhrase,
  sortTarget,
  viewQuery,
  withoutFilter,
  yearEnded,
  type RangeFilter,
  type View,
} from "@/lib/screener/filters";
import { METRICS } from "@/lib/screener/metrics";
import { RETIRED_SCREENS, SCREEN_GROUPS, STARTING_SCREENS, matchingScreen, screenDescription, startingScreen } from "@/lib/screener/screens";

const f = (param: string) => rangeFilter(param) as RangeFilter;

describe("the filter list", () => {
  it("has a filter for every measure the job writes, each with a plain name and a definition", () => {
    const columns = new Set(RANGE_FILTERS.map((x) => x.column));
    for (const m of METRICS) expect(columns.has(m)).toBe(true);
    for (const x of RANGE_FILTERS) {
      expect(x.definition.length).toBeGreaterThan(20);
      // No abbreviation a student wouldn't know in a name.
      expect(x.label).not.toMatch(/\b(FCF|ROIC|ROE|ROA|EPS|R&D|SG&A|yr|Op\.|Rev\.)\b/);
    }
    expect(new Set(RANGE_FILTERS.map((x) => x.param)).size).toBe(RANGE_FILTERS.length);
  });

  it("puts return on invested capital among the main filters, and seventeen more behind More filters", () => {
    expect(f("roic").group).toBe("Margins and returns");
    const more = RANGE_FILTERS.filter((x) => ["Profitability", "Spending", "Shareholder returns", "Balance sheet health", "Longer history"].includes(x.group));
    // The brief's seventeen are fifteen ranges, "pays a dividend" and the
    // state; the addendum adds three ranges.
    expect(more.length).toBe(15 + 3);
  });
});

describe("typed values", () => {
  it("reads a percent box as typed: 20 or 20%", () => {
    expect(parsePercent("20")).toBe(20);
    expect(parsePercent("20%")).toBe(20);
    expect(parsePercent(" 20 % ")).toBe(20);
    expect(parsePercent("-2")).toBe(-2);
    expect(parsePercent("−2.5%")).toBe(-2.5);
    expect(parsePercent("+5")).toBe(5);
    expect(parsePercent(".5")).toBe(0.5);
    expect(parsePercent("1,000")).toBe(1000);
    expect(parsePercent("5 pts")).toBe(5);
    expect(parsePercent("5 points")).toBe(5);
  });

  it("reads ratios and counts", () => {
    expect(parseRatio("1.5")).toBe(1.5);
    expect(parseRatio("1.5x")).toBe(1.5);
    expect(parseRatio("0.5×")).toBe(0.5);
    expect(parseCount("10")).toBe(10);
    expect(parseCount("10 years")).toBe(10);
    expect(parseCount("2.5")).toBeNull();
    expect(parseCount("-1")).toBeNull();
  });

  it("ignores nonsense rather than guessing", () => {
    for (const bad of ["", "abc", "20abc", "2-0", "--2", "%", "1e5", "NaN", "Infinity", "20%%", "9999999"]) expect(parsePercent(bad)).toBeNull();
    expect(parsePercent(null)).toBeNull();
    expect(parseRatio("x")).toBeNull();
  });

  it("reads dollar figures with a suffix; a bare number is dollars", () => {
    expect(parseMoney("1b")).toBe(1e9);
    expect(parseMoney("1B")).toBe(1e9);
    expect(parseMoney("$1.5 billion")).toBe(1.5e9);
    expect(parseMoney("1.5B")).toBe(1.5e9);
    expect(parseMoney("$2B")).toBe(2e9);
    expect(parseMoney("500M")).toBe(5e8);
    expect(parseMoney("-$2b")).toBe(-2e9);
    expect(parseMoney("$-2b")).toBe(-2e9);
    expect(parseMoney("1,000,000")).toBe(1e6);
    expect(parseMoney("0")).toBe(0);
    expect(parseMoney("1.1b")).toBe(1_100_000_000);
    expect(parseMoney("3t")).toBe(3e12);
    for (const bad of ["", "1x", "b", "$", "--1b", "-$-1b", "1 bn dollars"]) expect(parseMoney(bad)).toBeNull();
  });

  it("writes dollars short in the link and in words", () => {
    expect(moneyParam(1e9)).toBe("1b");
    expect(moneyParam(1.5e9)).toBe("1.5b");
    expect(moneyParam(2.5e8)).toBe("250m");
    expect(moneyParam(-2e9)).toBe("-2b");
    expect(moneyParam(0)).toBe("0");
    expect(boundLabel("money", 1e9)).toBe("$1B");
    expect(boundLabel("money", -2.5e8)).toBe("-$250M");
    expect(boundLabel("percent", -2)).toBe("-2%");
    expect(boundLabel("points", 10)).toBe("10 pts");
    expect(boundLabel("ratio", 0.5)).toBe("0.5×");
    expect(boundLabel("count", 1)).toBe("1 year");
    expect(boundLabel("count", 10)).toBe("10 years");
    expect(moneyWords(5e8)).toBe("$500 million");
    expect(moneyWords(1.5e9)).toBe("$1.5 billion");
    expect(boxText("money", 1e8)).toBe("100M");
    expect(boxText("percent", 20)).toBe("20");
    expect(boxText("ratio", 0.5)).toBe("0.5");
  });

  it("round-trips every dollar figure it writes", () => {
    for (const v of [1, 999, 1000, 1001, 999_999, 1e6, 1_500_000, 7.25e9, 123_456_789, 1e12, 2.5e12, -3e9]) expect(parseMoney(moneyParam(v))).toBe(v);
  });
});

describe("the link", () => {
  it("reads ranges written min..max, either end optional", () => {
    const v = parseView({ growth1y: "20..", shares: "..-2", revenue: "100m..1b", cashconv: "..0.5", years: "10.." });
    expect(v.filters.ranges).toEqual({
      growth1y: { min: 20, max: null },
      shares: { min: null, max: -2 },
      revenue: { min: 1e8, max: 1e9 },
      cashconv: { min: null, max: 0.5 },
      years: { min: 10, max: null },
    });
  });

  it("reads sectors, headquarters and 'pays a dividend'", () => {
    const v = parseView({ sector: "technology,health-care", state: "ma,nh,outside,zz", dividend: "yes" });
    expect(v.filters.sectors).toEqual(["Technology", "Health care"]);
    expect(v.filters.states).toEqual(["MA", "NH", "Outside the U.S."]);
    expect(v.filters.dividend).toBe(true);
    expect(parseView({ dividend: "no" }).filters.dividend).toBe(false);
  });

  it("reads a plain form's boxes too, for a panel whose script hasn't run", () => {
    const v = parseView({ gross_min: "70%", gross_max: "", revenue_min: "$100M", sector: ["technology", "health-care"], state: ["ma", "ct"], dividend: "yes" });
    expect(v.filters.ranges).toEqual({ gross: { min: 70, max: null }, revenue: { min: 1e8, max: null } });
    expect(v.filters.sectors).toEqual(["Technology", "Health care"]);
    expect(v.filters.states).toEqual(["CT", "MA"]);
  });

  it("swaps a min above its max, and drops a range with no ends", () => {
    expect(parseView({ net: "30..10" }).filters.ranges.net).toEqual({ min: 10, max: 30 });
    expect(parseView({ net: ".." }).filters.ranges.net).toBeUndefined();
  });

  it("ignores nonsense in the link instead of erroring", () => {
    const v = parseView({ growth1y: "abc..", gross: "20", net: "1..2..3", sector: "made-up,TECHNOLOGY", sort: "drop table", order: "sideways", show: "lots", edit: "yes", utm_source: "x" });
    expect(v.filters.ranges).toEqual({});
    expect(v.filters.sectors).toEqual(["Technology"]);
    expect(v.sort).toBe("revenue");
    expect(v.order).toBe("desc");
    expect(v.show).toBe(PAGE_SIZE);
    expect(v.edit).toBe(false);
  });

  it("pages in fifties up to the cap", () => {
    expect(parseView({ show: "100" }).show).toBe(100);
    expect(parseView({ show: "120" }).show).toBe(150);
    expect(parseView({ show: "10" }).show).toBe(PAGE_SIZE);
    expect(parseView({ show: "999999" }).show).toBe(MAX_SHOW);
  });

  it("writes the link in a fixed order, leaving out defaults, and reads it back the same", () => {
    const v = parseView({ shares: "..-2", roic: "25..", growth1y: "20..", sector: "health-care,technology", state: "nh,ma", dividend: "yes", sort: "net", order: "asc", show: "100" });
    const q = viewQuery(v);
    expect(q).toBe("growth1y=20..&roic=25..&shares=..-2&sector=technology,health-care&state=ma,nh&dividend=yes&sort=net&order=asc&show=100");
    expect(parseView(Object.fromEntries(new URLSearchParams(q)))).toEqual(v);
    expect(viewQuery(parseView({}))).toBe("");
  });

  it("starts a starting screen's page on that screen's own sort", () => {
    const base = { sort: "roic", order: "desc" as const };
    const v = parseView({}, base);
    expect(v).toMatchObject({ sort: "roic", order: "desc" });
    expect(viewQuery(v, { filters: false, base })).toBe("");
    expect(viewQuery({ ...v, order: "asc" }, { filters: false, base })).toBe("order=asc");
    expect(viewQuery({ ...v, sort: "revenue", order: "desc" }, { filters: false, base })).toBe("sort=revenue");
  });

  it("opens on the starting screens only when the link asks for nothing else", () => {
    expect(isOpeningView(parseView({}))).toBe(true);
    expect(isOpeningView(parseView({ utm_source: "newsletter" }))).toBe(true);
    expect(isOpeningView(parseView({ edit: "1" }))).toBe(false);
    expect(isOpeningView(parseView({ dividend: "yes" }))).toBe(false);
    expect(isOpeningView(parseView({ state: "ma" }))).toBe(false);
    expect(isOpeningView(parseView({ gross: "seventy.." }))).toBe(true);
  });
});

describe("words", () => {
  it("writes chips in plain language", () => {
    expect(chipText(f("growth1y"), { min: 20, max: null })).toBe("Revenue growth, 1 year: 20% or more");
    expect(chipText(f("shares"), { min: null, max: -2 })).toBe("Share count change, 1 year: -2% or less");
    expect(chipText(f("revenue"), { min: 1e8, max: null })).toBe("Revenue: at least $100M");
    expect(chipText(f("marginchange"), { min: 10, max: null })).toBe("Operating margin change, 3 years: 10 pts or more");
    expect(chipText(f("cashconv"), { min: null, max: 0.5 })).toBe("Cash conversion: 0.5× or less");
    expect(filterLines(parseView({ dividend: "yes", state: "ma,nh,me,vt,ri,ct", sector: "technology" }).filters).map((l) => l.text)).toEqual([
      "Pays a dividend",
      "Sector: Technology",
      "Headquarters: New England",
    ]);
  });

  it("restates a screen in one plain sentence", () => {
    expect(describeScreen(parseView({ roic: "20..", revenue: "500m.." }).filters)).toBe(
      "Companies with revenue of at least $500 million and a return on invested capital of 20% or more.",
    );
    expect(describeScreen(parseView({ rule40: "40..", revenue: "200m..", sector: "technology" }).filters)).toBe(
      "Companies in technology, with revenue of at least $200 million and revenue growth plus free cash flow margin of 40% or more.",
    );
    expect(describeScreen(parseView({ growth1y: "30..", net: "..0", revenue: "100m.." }).filters)).toBe(
      "Companies with revenue of at least $100 million, 1-year revenue growth of 30% or more and a net loss.",
    );
    expect(describeScreen(parseView({ shares: "..-6", fcf: "0.." }).filters)).toBe("Companies with positive free cash flow and a share count down 6% or more over the year.");
    expect(describeScreen(parseView({ dividend: "yes", divfcf: "..40" }).filters)).toBe("Companies that pay a dividend, with dividends of 40% or less of free cash flow.");
    expect(describeScreen(parseView({ state: "ma,nh,me,vt,ri,ct" }).filters)).toBe("Companies based in New England.");
    expect(describeScreen(parseView({ state: "tx" }).filters)).toBe("Companies based in Texas.");
    expect(describeScreen(NO_FILTERS)).toBe("Every company in the screener.");
  });

  it("writes the sort", () => {
    expect(sortPhrase("revenue", "desc")).toBe("Sorted by revenue, largest first");
    expect(sortPhrase("roic", "desc")).toBe("Sorted by return on invested capital, highest first");
    expect(sortPhrase("cashconv", "asc")).toBe("Sorted by cash conversion, lowest first");
    expect(sortPhrase("netcash", "desc")).toBe("Sorted by net cash, highest first");
    expect(sortPhrase("name", "asc")).toBe("Sorted by name, A to Z");
  });

  it("formats figures by unit, with n/a for a missing one and never zero", () => {
    expect(formatFigure(f("revenue"), 215_938_000_000)).toBe("$215.9B");
    expect(formatFigure(f("netcash"), -18_377_000_000)).toBe("-$18.4B");
    expect(formatFigure(f("growth1y"), 0.654735)).toBe("+65.5%");
    expect(formatFigure(f("gross"), 0.7107)).toBe("71.1%");
    expect(formatFigure(f("net"), -540.2)).toBe("-54,020%");
    expect(formatFigure(f("marginchange"), 0.1234)).toBe("+12.3 pts");
    expect(formatFigure(f("marginchange"), -0.05)).toBe("-5.0 pts");
    expect(formatFigure(f("cashconv"), 0.4217)).toBe("0.42×");
    expect(formatFigure(f("coverage"), 152.4)).toBe("152×");
    expect(formatFigure(f("years"), 10)).toBe("10");
    expect(formatFigure(f("gross"), null)).toBe("n/a");
    expect(formatFigure(f("gross"), Number.NaN)).toBe("n/a");
  });

  it("says where the middle company sits", () => {
    expect(medianText(f("roic"), 0.0912)).toBe("Half of companies: above 9.1%");
    expect(medianText(f("revenue"), 412_300_000)).toBe("Half of companies: above $412.3M");
    expect(medianText(f("years"), 1)).toBe("Half of companies: 1 year or more");
  });

  it("says a card's filters the way a person would", () => {
    const losing = startingScreen("fast-growth-still-losing-money")!.filters;
    expect(filterLines(losing, { plain: true }).map((l) => l.text)).toEqual(["Revenue: at least $100M", "Revenue growth, 1 year: 30% or more", "A net loss"]);
    const cash = startingScreen("more-cash-than-debt")!.filters;
    expect(filterLines(cash, { plain: true }).map((l) => l.text)).toEqual(["Revenue: at least $1B", "Positive free cash flow", "More cash than debt"]);
  });

  it("dates", () => {
    expect(yearEnded("2026-01-25")).toBe("Jan 2026");
    expect(yearEnded(null)).toBe("n/a");
    expect(dayLabel("2026-11-06T09:01:00Z")).toBe("6 November 2026");
    expect(dayLabel("nonsense")).toBeNull();
  });
});

describe("columns and sorting", () => {
  const view = (q: Record<string, string>, base?: { sort: string; order: "asc" | "desc" }): View => parseView(q, base);

  it("puts the screen's own measure first, then the other filters, then revenue, filled to three measures", () => {
    expect(resultColumns(view({ roic: "25..", revenue: "500m.." }, { sort: "roic", order: "desc" })).map((c) => c.param)).toEqual(["roic", "revenue", "growth1y", "net"]);
    expect(resultColumns(view({ growth1y: "20..", operating: "10..", revenue: "200m.." }, { sort: "growth1y", order: "desc" })).map((c) => c.param)).toEqual([
      "growth1y",
      "operating",
      "revenue",
      "net",
    ]);
    expect(resultColumns(view({})).map((c) => c.param)).toEqual(["revenue", "growth1y", "net", "fcf"]);
  });

  it("flips a column already sorted, otherwise starts it the usual way, back to fifty rows", () => {
    const v = view({ sort: "gross", show: "200" });
    expect(sortTarget(v, "gross")).toMatchObject({ sort: "gross", order: "asc", show: PAGE_SIZE });
    expect(sortTarget(v, "name")).toMatchObject({ sort: "name", order: "asc" });
  });

  it("removes one filter and keeps the rest", () => {
    const v = view({ growth1y: "20..", fcf: "0..", dividend: "yes", state: "ma" });
    expect(withoutFilter(v.filters, "fcf").ranges).toEqual({ growth1y: { min: 20, max: null } });
    expect(withoutFilter(v.filters, "dividend").dividend).toBe(false);
    expect(withoutFilter(v.filters, "state").states).toEqual([]);
    expect(v.filters.ranges.fcf).toBeDefined();
  });
});

describe("database conditions", () => {
  it("turns percents and points into fractions, keeps dollars and ratios as they are", () => {
    const { filters } = parseView({ growth1y: "20..", shares: "..-2", revenue: "1b..", marginchange: "10..", cashconv: "..0.5", sector: "technology", state: "ma", dividend: "yes" });
    expect(conditions(filters)).toEqual([
      { op: "gte", column: "revenue", value: 1e9 },
      { op: "gte", column: "revenue_growth_1y", value: 0.2 },
      { op: "lte", column: "share_change_1y", value: -0.02 },
      { op: "gte", column: "operating_margin_change_3y", value: 0.1 },
      { op: "lte", column: "cash_conversion", value: 0.5 },
      { op: "in", column: "sector", values: ["Technology"] },
      { op: "in", column: "state", values: ["MA"] },
      { op: "is", column: "pays_dividend", value: true },
    ]);
  });
});

describe("starting screens", () => {
  it("has the addendum's thirteen, grouped by question, each with a unique slug", () => {
    expect(STARTING_SCREENS).toHaveLength(13);
    expect(new Set(STARTING_SCREENS.map((s) => s.slug)).size).toBe(13);
    for (const s of STARTING_SCREENS) expect(SCREEN_GROUPS.map((g) => g.key)).toContain(s.group);
    for (const slug of RETIRED_SCREENS) expect(startingScreen(slug)).toBeUndefined();
  });

  it("words each as a description, never as a pick", () => {
    for (const s of STARTING_SCREENS) {
      expect(`${s.title} ${s.why ?? ""} ${describeScreen(s.filters)}`).not.toMatch(/\b(best|top|picks?|winners?|buy|sell|hold|undervalued|overvalued|target|cheap)\b/i);
    }
  });

  it("sorts each by its own measure, which is one of its filters (or revenue)", () => {
    for (const s of STARTING_SCREENS) {
      const own = s.sort === "revenue" || s.sort === "growth10y" || s.filters.ranges[s.sort] != null;
      expect(own).toBe(true);
    }
  });

  it("restates each one in a sentence, and builds a description from it", () => {
    const s = startingScreen("high-return-on-capital")!;
    expect(describeScreen(s.filters)).toBe("Companies with revenue of at least $500 million and a return on invested capital of 25% or more.");
    expect(screenDescription(s, describeScreen(s.filters))).toContain("Many long-term investors start here.");
    expect(describeScreen(startingScreen("based-in-new-england")!.filters)).toBe("Companies based in New England, with revenue of at least $100 million.");
  });

  it("round-trips each screen through a link, and names a link that matches one", () => {
    for (const s of STARTING_SCREENS) {
      const q = viewQuery({ filters: s.filters, sort: "revenue", order: "desc", show: PAGE_SIZE, edit: false });
      const back = parseView(Object.fromEntries(new URLSearchParams(q)));
      expect(back.filters).toEqual(s.filters);
      expect(matchingScreen(back.filters)?.slug).toBe(s.slug);
    }
  });
});
