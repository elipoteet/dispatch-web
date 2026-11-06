import { describe, expect, it } from "vitest";
import {
  MAX_SHOW,
  PAGE_SIZE,
  boundLabel,
  boxText,
  cardText,
  chipText,
  companyName,
  conditions,
  dayLabel,
  filterLines,
  formatFigure,
  isOpeningView,
  moneyParam,
  parseMoney,
  parsePercent,
  parseView,
  rangeFilter,
  resultColumns,
  sortPhrase,
  sortTarget,
  viewQuery,
  withoutRange,
  yearEnded,
  type RangeFilter,
  type View,
} from "@/lib/screener/filters";
import { STARTING_SCREENS, matchingScreen, startingScreen } from "@/lib/screener/screens";

const f = (param: string) => rangeFilter(param) as RangeFilter;

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
  });

  it("ignores nonsense rather than guessing", () => {
    for (const bad of ["", "abc", "20abc", "2-0", "--2", "%", "1e5", "NaN", "Infinity", "20%%", "9999999"]) expect(parsePercent(bad)).toBeNull();
    expect(parsePercent(null)).toBeNull();
  });

  it("reads dollar figures with a suffix; a bare number is dollars", () => {
    expect(parseMoney("1b")).toBe(1e9);
    expect(parseMoney("1B")).toBe(1e9);
    expect(parseMoney("$1.5 billion")).toBe(1.5e9);
    expect(parseMoney("250m")).toBe(2.5e8);
    expect(parseMoney("$100M")).toBe(1e8);
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
    expect(moneyParam(1_234_000_000)).toBe("1.234b");
    expect(parseMoney(moneyParam(1_234_567_891))).toBe(1_234_567_891);
    expect(moneyParam(0)).toBe("0");
    expect(moneyParam(12_345)).toBe("12.345k");
    expect(boundLabel("money", 1e9)).toBe("$1B");
    expect(boundLabel("money", -2.5e8)).toBe("-$250M");
    expect(boundLabel("money", 0)).toBe("$0");
    expect(boundLabel("percent", -2)).toBe("-2%");
    expect(boxText("money", 1e8)).toBe("100M");
    expect(boxText("percent", 20)).toBe("20");
    expect(boxText("percent", null)).toBe("");
  });

  it("round-trips every dollar figure it writes", () => {
    for (const v of [1, 999, 1000, 1001, 999_999, 1e6, 1_500_000, 7.25e9, 123_456_789, 1e12, 2.5e12, -3e9]) expect(parseMoney(moneyParam(v))).toBe(v);
  });
});

describe("the link", () => {
  it("reads ranges written min..max, either end optional", () => {
    const v = parseView({ growth1y: "20..", shares: "..-2", revenue: "100m..1b" });
    expect(v.filters.ranges).toEqual({
      growth1y: { min: 20, max: null },
      shares: { min: null, max: -2 },
      revenue: { min: 1e8, max: 1e9 },
    });
  });

  it("reads a plain form's two boxes too, for a panel whose script hasn't run", () => {
    const v = parseView({ gross_min: "70%", gross_max: "", revenue_min: "$100M", sector: ["technology", "health-care"] });
    expect(v.filters.ranges).toEqual({ gross: { min: 70, max: null }, revenue: { min: 1e8, max: null } });
    expect(v.filters.sectors).toEqual(["Technology", "Health care"]);
  });

  it("swaps a min above its max, and drops a range with no ends", () => {
    expect(parseView({ net: "30..10" }).filters.ranges.net).toEqual({ min: 10, max: 30 });
    expect(parseView({ net: ".." }).filters.ranges.net).toBeUndefined();
  });

  it("ignores nonsense in the link instead of erroring", () => {
    const v = parseView({
      growth1y: "abc..",
      gross: "20",
      net: "1..2..3",
      sector: "made-up,TECHNOLOGY",
      sort: "drop table",
      order: "sideways",
      show: "lots",
      edit: "yes",
      utm_source: "x",
    });
    expect(v.filters.ranges).toEqual({});
    expect(v.filters.sectors).toEqual(["Technology"]);
    expect(v.sort).toBe("revenue");
    expect(v.order).toBe("desc");
    expect(v.show).toBe(PAGE_SIZE);
    expect(v.edit).toBe(false);
  });

  it("keeps sectors in the list's order, once each", () => {
    expect(parseView({ sector: "utilities,technology,utilities" }).filters.sectors).toEqual(["Technology", "Utilities"]);
    expect(parseView({ sector: "other" }).filters.sectors).toEqual(["Other"]);
  });

  it("pages in fifties up to the cap", () => {
    expect(parseView({ show: "100" }).show).toBe(100);
    expect(parseView({ show: "120" }).show).toBe(150);
    expect(parseView({ show: "10" }).show).toBe(PAGE_SIZE);
    expect(parseView({ show: "-50" }).show).toBe(PAGE_SIZE);
    expect(parseView({ show: "999999" }).show).toBe(MAX_SHOW);
  });

  it("sorts names A to Z and figures largest first by default", () => {
    expect(parseView({ sort: "name" }).order).toBe("asc");
    expect(parseView({ sort: "gross" }).order).toBe("desc");
    expect(parseView({ sort: "Gross", order: "ASC" })).toMatchObject({ sort: "gross", order: "asc" });
  });

  it("writes the link in a fixed order, leaving out defaults, and reads it back the same", () => {
    const v = parseView({ shares: "..-2", growth1y: "20..", sector: "health-care,technology", sort: "net", order: "asc", show: "100" });
    const q = viewQuery(v);
    expect(q).toBe("growth1y=20..&shares=..-2&sector=technology,health-care&sort=net&order=asc&show=100");
    expect(parseView(Object.fromEntries(new URLSearchParams(q)))).toEqual(v);
    expect(viewQuery(parseView({}))).toBe("");
    expect(viewQuery(parseView({ revenue: "1b..", netcash: "0.." }))).toBe("revenue=1b..&netcash=0..");
  });

  it("can leave the filters out, for a starting screen's own page", () => {
    const v = parseView({ growth1y: "20..", sort: "net" });
    expect(viewQuery(v, { filters: false })).toBe("sort=net");
  });

  it("opens on the starting screens only when the link asks for nothing else", () => {
    expect(isOpeningView(parseView({}))).toBe(true);
    expect(isOpeningView(parseView({ utm_source: "newsletter" }))).toBe(true);
    expect(isOpeningView(parseView({ edit: "1" }))).toBe(false);
    expect(isOpeningView(parseView({ sort: "net" }))).toBe(false);
    expect(isOpeningView(parseView({ gross: "70.." }))).toBe(false);
    expect(isOpeningView(parseView({ gross: "seventy.." }))).toBe(true);
  });
});

describe("words", () => {
  it("writes chips, cards and the sort in plain language", () => {
    expect(chipText(f("growth1y"), { min: 20, max: null })).toBe("Revenue growth, 1 yr: 20% or more");
    expect(chipText(f("shares"), { min: null, max: -2 })).toBe("Share count change, 1 yr: -2% or less");
    expect(chipText(f("gross"), { min: 40, max: 60 })).toBe("Gross margin: 40% to 60%");
    expect(chipText(f("revenue"), { min: 1e9, max: null })).toBe("Revenue, latest year: $1B or more");
    expect(cardText(f("fcf"), { min: 0, max: null })).toBe("FCF margin ≥ 0%");
    expect(cardText(f("net"), { min: null, max: 0 })).toBe("Net margin ≤ 0%");
    expect(sortPhrase("revenue", "desc")).toBe("Sorted by revenue, largest first");
    expect(sortPhrase("revenue", "asc")).toBe("Sorted by revenue, smallest first");
    expect(sortPhrase("growth1y", "desc")).toBe("Sorted by 1-year revenue growth, highest first");
    expect(sortPhrase("name", "asc")).toBe("Sorted by name, A to Z");
  });

  it("formats figures, with n/a for a missing one and never zero", () => {
    expect(formatFigure(f("revenue"), 215_938_000_000)).toBe("$215.9B");
    expect(formatFigure(f("netcash"), -18_377_000_000)).toBe("-$18.4B");
    expect(formatFigure(f("growth1y"), 0.654735)).toBe("+65.5%");
    expect(formatFigure(f("growth1y"), -0.0293)).toBe("-2.9%");
    expect(formatFigure(f("gross"), 0.7107)).toBe("71.1%");
    expect(formatFigure(f("net"), -0.12345)).toBe("-12.3%");
    expect(formatFigure(f("net"), -540.2)).toBe("-54,020%");
    expect(formatFigure(f("growth1y"), 0.00002)).toBe("0.0%");
    expect(formatFigure(f("gross"), null)).toBe("n/a");
    expect(formatFigure(f("gross"), Number.NaN)).toBe("n/a");
  });

  it("names companies as a reader would", () => {
    expect(companyName("AIR PRODUCTS AND CHEMICALS, INC.")).toBe("Air Products and Chemicals");
    expect(companyName("BANK OF AMERICA CORP /DE/")).toBe("Bank of America");
    expect(companyName("Alphabet Inc.")).toBe("Alphabet");
    expect(companyName("The Trade Desk, Inc.")).toBe("Trade Desk");
    expect(companyName("Bank Of The Ozarks")).toBe("Bank Of The Ozarks");
    expect(companyName("PACIFIC GAS & ELECTRIC Co")).toBe("Pacific Gas & Electric");
    expect(companyName("CVS HEALTH Corp")).toBe("CVS Health");
    expect(companyName("McKESSON CORP")).toBe("McKesson");
    expect(companyName("McDONALD’S CORPORATION")).toBe("McDonald’s");
    expect(companyName("RxSIGHT, INC.")).toBe("RxSIGHT");
    expect(companyName("BALL Corp")).toBe("Ball");
    expect(companyName("Walt Disney Co/")).toBe("Walt Disney");
    expect(companyName("Troops, Inc. /Cayman Islands/")).toBe("Troops");
    expect(companyName("Azora Therapeutics, Inc. (DE)")).toBe("Azora Therapeutics");
    expect(companyName("STURM,     RUGER & COMPANY, INC.")).toBe("Sturm, Ruger");
    expect(companyName("HUTCHMED (China) Ltd")).toBe("Hutchmed (China)");
  });

  it("dates", () => {
    expect(yearEnded("2026-01-25")).toBe("Jan 2026");
    expect(yearEnded(null)).toBe("n/a");
    expect(dayLabel("2026-11-06T01:28:11.01+00:00")).toBe("5 November 2026");
    expect(dayLabel("2026-11-06T09:01:00Z")).toBe("6 November 2026");
    expect(dayLabel("nonsense")).toBeNull();
  });
});

describe("columns and sorting", () => {
  const view = (q: Record<string, string>): View => parseView(q);

  it("shows a column for each active filter, then the sort, filled to three", () => {
    expect(resultColumns(view({})).map((c) => c.param)).toEqual(["growth1y", "net", "fcf"]);
    expect(resultColumns(view({ gross: "70..", revenue: "100m.." })).map((c) => c.param)).toEqual(["gross", "growth1y", "net"]);
    expect(resultColumns(view({ shares: "..-2", sort: "operating" })).map((c) => c.param)).toEqual(["shares", "operating", "growth1y"]);
    const many = view({ growth1y: "0..", growth3y: "0..", gross: "0..", operating: "0..", net: "0..", fcf: "0..", netcash: "0..", shares: "..0" });
    expect(resultColumns(many)).toHaveLength(8);
  });

  it("flips a column already sorted, otherwise starts it the usual way, back to fifty rows", () => {
    const v = view({ sort: "gross", show: "200" });
    expect(sortTarget(v, "gross")).toMatchObject({ sort: "gross", order: "asc", show: PAGE_SIZE });
    expect(sortTarget(v, "name")).toMatchObject({ sort: "name", order: "asc" });
    expect(sortTarget(view({}), "revenue")).toMatchObject({ order: "asc" });
  });

  it("removes one filter and keeps the rest", () => {
    const v = view({ growth1y: "20..", fcf: "0.." });
    expect(withoutRange(v.filters, "fcf").ranges).toEqual({ growth1y: { min: 20, max: null } });
    expect(v.filters.ranges.fcf).toBeDefined();
  });
});

describe("database conditions", () => {
  it("turns percents into fractions and keeps dollars as dollars", () => {
    const { filters } = parseView({ growth1y: "20..", shares: "..-2", revenue: "1b..", sector: "technology" });
    expect(conditions(filters)).toEqual([
      { op: "gte", column: "revenue", value: 1e9 },
      { op: "gte", column: "revenue_growth_1y", value: 0.2 },
      { op: "lte", column: "share_change_1y", value: -0.02 },
      { op: "in", column: "sector", values: ["Technology"] },
    ]);
  });
});

describe("starting screens", () => {
  it("has the six that use the main filters, each with a unique slug and its own description", () => {
    expect(STARTING_SCREENS.map((s) => s.slug)).toEqual([
      "revenue-up-20-cash-flow-positive",
      "share-count-shrinking",
      "more-cash-than-debt",
      "gross-margin-above-70",
      "losing-money-revenue-up-30",
      "revenue-falling",
    ]);
    expect(new Set(STARTING_SCREENS.map((s) => s.description)).size).toBe(STARTING_SCREENS.length);
  });

  it("words each as a description, never as a pick", () => {
    for (const s of STARTING_SCREENS) expect(`${s.title} ${s.description}`).not.toMatch(/\b(best|top|picks?|winners?|buy|sell|hold|undervalued|overvalued|target)\b/i);
  });

  it("matches the brief's definitions", () => {
    expect(filterLines(startingScreen("revenue-up-20-cash-flow-positive")!.filters, "card")).toEqual(["Rev. growth 1 yr ≥ 20%", "FCF margin ≥ 0%"]);
    expect(filterLines(startingScreen("share-count-shrinking")!.filters, "card")).toEqual(["Share change 1 yr ≤ -2%"]);
    expect(filterLines(startingScreen("more-cash-than-debt")!.filters, "card")).toEqual(["Revenue ≥ $1B", "Net cash ≥ $0"]);
    expect(filterLines(startingScreen("gross-margin-above-70")!.filters, "card")).toEqual(["Revenue ≥ $100M", "Gross margin ≥ 70%"]);
    expect(filterLines(startingScreen("losing-money-revenue-up-30")!.filters, "card")).toEqual(["Rev. growth 1 yr ≥ 30%", "Net margin ≤ 0%"]);
    expect(filterLines(startingScreen("revenue-falling")!.filters, "card")).toEqual(["Rev. growth 1 yr ≤ -10%"]);
  });

  it("round-trips each screen through a link, and names a link that matches one", () => {
    for (const s of STARTING_SCREENS) {
      const q = viewQuery({ filters: s.filters, sort: "revenue", order: "desc", show: PAGE_SIZE, edit: false });
      const back = parseView(Object.fromEntries(new URLSearchParams(q)));
      expect(back.filters).toEqual(s.filters);
      expect(matchingScreen(back.filters)?.slug).toBe(s.slug);
    }
    expect(matchingScreen(parseView({ growth1y: "21.." }).filters)).toBeUndefined();
  });
});
