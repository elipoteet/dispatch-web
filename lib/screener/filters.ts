// The screener's filters, sorting and paging, and how each is written in the
// page link and in words. Pure, and shared by the page (server) and the
// filter panel (browser), so a link, a typed box and a removed chip all go
// through the same rules.
//
// The whole screen lives in the link, so copy-link, the back button and a
// texted link all reproduce it:
//   /screener?roic=25..&revenue=500m..&sector=technology&state=ma,nh&dividend=yes&sort=roic&show=100
// A range is "min..max" with either end left off. Percents and percentage
// points are written as typed ("20" is 20%), ratios as ratios ("1.5"), dollar
// figures with a suffix ("1b", "250m"). Anything in a link that doesn't parse
// is ignored, never an error.

import { formatMoney } from "@/lib/research/format";
import { SECTORS, type Sector } from "@/lib/screener/sectors";

// percent: stored as a fraction, typed as a percent (20 is 0.20)
// points:  a change in a percentage, stored as a fraction (5 points is 0.05)
// ratio:   stored and typed as is (1.5 is 1.5×)
// count:   whole years
// money:   dollars
export type Unit = "money" | "percent" | "points" | "ratio" | "count";

export const MAIN_GROUPS = ["Size and growth", "Margins and returns", "Balance sheet and shares"] as const;
export const MORE_GROUPS = ["Profitability", "Spending", "Shareholder returns", "Balance sheet health", "Longer history"] as const;
export type Group = (typeof MAIN_GROUPS)[number] | (typeof MORE_GROUPS)[number];

export type RangeFilter = {
  // Its name in the link.
  param: string;
  // Its column in screener_metrics.
  column: string;
  // Its plain name: in the filter panel, on a chip, at the head of a column.
  // Never an abbreviation a student wouldn't know.
  label: string;
  // One line on what it measures, under its name in the panel.
  definition: string;
  // After "Sorted by": "return on invested capital".
  noun: string;
  // In the sentence that restates a screen: "a return on invested capital"
  // (of 20% or more).
  phrase: string;
  unit: Unit;
  // Growth and changes show a + on positives; margins don't.
  signed: boolean;
  group: Group;
};

// In the brief's order: the main ten (with return on invested capital, the
// addendum's addition) up front, the rest behind "More filters".
export const RANGE_FILTERS: readonly RangeFilter[] = [
  // —— Main ——
  { param: "revenue", column: "revenue", label: "Revenue", definition: "Sales in the latest fiscal year.", noun: "revenue", phrase: "revenue", unit: "money", signed: false, group: "Size and growth" },
  { param: "growth1y", column: "revenue_growth_1y", label: "Revenue growth, 1 year", definition: "How much sales grew over the latest fiscal year. n/a when the year before had under $10 million of sales.", noun: "1-year revenue growth", phrase: "1-year revenue growth", unit: "percent", signed: true, group: "Size and growth" },
  { param: "growth3y", column: "revenue_growth_3y", label: "Revenue growth, 3-year average", definition: "Average yearly sales growth over the last three fiscal years. n/a when the first year had under $10 million of sales.", noun: "3-year revenue growth", phrase: "average revenue growth over three years", unit: "percent", signed: true, group: "Size and growth" },
  { param: "gross", column: "gross_margin", label: "Gross margin", definition: "Share of sales left after the direct cost of what was sold. n/a for banks, insurers, REITs and utilities, and where the cost a company files leaves most of its costs out.", noun: "gross margin", phrase: "a gross margin", unit: "percent", signed: false, group: "Margins and returns" },
  { param: "operating", column: "operating_margin", label: "Operating margin", definition: "Share of sales left as profit from running the business, before interest and tax.", noun: "operating margin", phrase: "an operating margin", unit: "percent", signed: false, group: "Margins and returns" },
  { param: "net", column: "net_margin", label: "Net margin", definition: "Share of sales left as profit after every cost, interest and tax.", noun: "net margin", phrase: "a net margin", unit: "percent", signed: false, group: "Margins and returns" },
  { param: "fcf", column: "fcf_margin", label: "Free cash flow margin", definition: "Cash the business brought in, less what it spent on equipment and buildings, as a share of sales. Calculated by The Dispatch. n/a for banks, insurers and REITs, and for companies holding their customers' money (payments, payroll).", noun: "free cash flow margin", phrase: "a free cash flow margin", unit: "percent", signed: false, group: "Margins and returns" },
  { param: "roic", column: "roic", label: "Return on invested capital", definition: "Operating profit after tax, as a share of the money tied up in the business: debt plus equity, less cash. Tax at the company's own rate, or 21% where that can't be worked out. n/a for banks, insurers, REITs and companies holding their customers' money; and when that money is under a tenth of total assets, or the return is above 100% and it's under a quarter.", noun: "return on invested capital", phrase: "a return on invested capital", unit: "percent", signed: false, group: "Margins and returns" },
  { param: "netcash", column: "net_cash", label: "Net cash or debt", definition: "Cash and short-term investments, less all debt. Below zero means more debt than cash. n/a for banks and insurers, and for companies holding their customers' money.", noun: "net cash", phrase: "net cash", unit: "money", signed: false, group: "Balance sheet and shares" },
  { param: "shares", column: "share_change_1y", label: "Share count change, 1 year", definition: "Change in the number of shares over the year. Below zero usually means buybacks; above, new shares issued.", noun: "1-year share count change", phrase: "a 1-year change in share count", unit: "percent", signed: true, group: "Balance sheet and shares" },
  // —— More filters ——
  { param: "roe", column: "roe", label: "Return on equity", definition: "Net income as a share of shareholders' equity. n/a when equity is zero or below.", noun: "return on equity", phrase: "a return on equity", unit: "percent", signed: false, group: "Profitability" },
  { param: "roa", column: "roa", label: "Return on assets", definition: "Net income as a share of everything the company owns.", noun: "return on assets", phrase: "a return on assets", unit: "percent", signed: false, group: "Profitability" },
  { param: "nigrowth", column: "net_income_growth_1y", label: "Net income growth, 1 year", definition: "How much net income grew over the year. n/a when last year was a loss.", noun: "1-year net income growth", phrase: "1-year net income growth", unit: "percent", signed: true, group: "Profitability" },
  { param: "epsgrowth", column: "eps_growth_1y", label: "Earnings per share growth, 1 year", definition: "How much diluted earnings per share grew over the year. n/a when last year was a loss.", noun: "1-year earnings per share growth", phrase: "1-year earnings per share growth", unit: "percent", signed: true, group: "Profitability" },
  { param: "marginchange", column: "operating_margin_change_3y", label: "Operating margin change, 3 years", definition: "This year's operating margin less the margin three fiscal years earlier, in percentage points.", noun: "change in operating margin over three years", phrase: "a change in operating margin over three years", unit: "points", signed: true, group: "Profitability" },
  { param: "rule40", column: "growth_plus_fcf_margin", label: "Revenue growth plus free cash flow margin", definition: "1-year revenue growth and free cash flow margin added together. Software investors call 40% or more the Rule of 40.", noun: "revenue growth plus free cash flow margin", phrase: "revenue growth plus free cash flow margin", unit: "percent", signed: true, group: "Profitability" },
  { param: "cashconv", column: "cash_conversion", label: "Cash conversion", definition: "Cash brought in by the business for each dollar of net income. Under 1× means some of the profit hasn't arrived as cash. n/a at a loss.", noun: "cash conversion", phrase: "cash conversion", unit: "ratio", signed: false, group: "Profitability" },
  { param: "rnd", column: "rnd_to_revenue", label: "Research and development, share of revenue", definition: "Spending on research and development as a share of sales.", noun: "research and development as a share of revenue", phrase: "research and development spending", unit: "percent", signed: false, group: "Spending" },
  { param: "capex", column: "capex_to_revenue", label: "Capital spending, share of revenue", definition: "Spending on equipment and buildings as a share of sales.", noun: "capital spending as a share of revenue", phrase: "capital spending", unit: "percent", signed: false, group: "Spending" },
  { param: "sga", column: "sga_to_revenue", label: "Sales and admin costs, share of revenue", definition: "Selling, general and administrative costs as a share of sales.", noun: "sales and admin costs as a share of revenue", phrase: "sales and admin costs", unit: "percent", signed: false, group: "Spending" },
  { param: "divfcf", column: "dividends_to_fcf", label: "Dividends, share of free cash flow", definition: "Dividends paid as a share of free cash flow. n/a when free cash flow is zero or below.", noun: "dividends as a share of free cash flow", phrase: "dividends", unit: "percent", signed: false, group: "Shareholder returns" },
  { param: "buyfcf", column: "buybacks_to_fcf", label: "Buybacks, share of free cash flow", definition: "Cash spent buying back shares, as a share of free cash flow. n/a when free cash flow is zero or below.", noun: "buybacks as a share of free cash flow", phrase: "buybacks", unit: "percent", signed: false, group: "Shareholder returns" },
  { param: "de", column: "debt_to_equity", label: "Debt to equity", definition: "Debt for each dollar of shareholders' equity. n/a for banks and insurers, and when equity is zero or below.", noun: "debt to equity", phrase: "debt to equity", unit: "ratio", signed: false, group: "Balance sheet health" },
  { param: "current", column: "current_ratio", label: "Current ratio", definition: "What the company owns that turns into cash within a year, over what it owes within a year.", noun: "current ratio", phrase: "a current ratio", unit: "ratio", signed: false, group: "Balance sheet health" },
  { param: "coverage", column: "interest_coverage", label: "Interest coverage", definition: "Operating profit over interest expense: how many times over the interest is paid.", noun: "interest coverage", phrase: "interest coverage", unit: "ratio", signed: false, group: "Balance sheet health" },
  { param: "growth5y", column: "revenue_growth_5y", label: "Revenue growth, 5-year average", definition: "Average yearly sales growth over the last five fiscal years.", noun: "5-year revenue growth", phrase: "average revenue growth over five years", unit: "percent", signed: true, group: "Longer history" },
  { param: "growth10y", column: "revenue_growth_10y", label: "Revenue growth, 10-year average", definition: "Average yearly sales growth over the last ten fiscal years.", noun: "10-year revenue growth", phrase: "average revenue growth over ten years", unit: "percent", signed: true, group: "Longer history" },
  { param: "years", column: "revenue_growth_years", label: "Years in a row of revenue growth", definition: "Fiscal years in a row that sales grew, counting back from the latest, up to ten.", noun: "years in a row of revenue growth", phrase: "revenue growth", unit: "count", signed: false, group: "Longer history" },
];

const BY_PARAM = new Map(RANGE_FILTERS.map((f) => [f.param, f]));

export function rangeFilter(param: string): RangeFilter | undefined {
  return BY_PARAM.get(param);
}

export function isMoreGroup(group: Group): boolean {
  return (MORE_GROUPS as readonly string[]).includes(group);
}

// —— Choices ——
// Sector: the eleven sectors, then "Other" (blank-check companies and anything
// SIC doesn't place). Fifty companies have no SIC code at all; they drop out
// of any sector filter, as n/a does everywhere.
export const SECTOR_OPTIONS: readonly Sector[] = [...SECTORS, "Other"];

export function sectorSlug(sector: string): string {
  return sector.toLowerCase().replace(/\s+/g, "-");
}

const SECTOR_BY_SLUG = new Map(SECTOR_OPTIONS.map((s) => [sectorSlug(s), s]));

// Headquarters, from the SEC's business address: the fifty states, D.C. and
// the territories, then everywhere else.
export const OUTSIDE_US = "Outside the U.S.";
export const STATES: Readonly<Record<string, string>> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  PR: "Puerto Rico", GU: "Guam", VI: "U.S. Virgin Islands", AS: "American Samoa", MP: "Northern Mariana Islands",
};
export const STATE_OPTIONS: readonly string[] = [...Object.keys(STATES).sort((a, b) => STATES[a].localeCompare(STATES[b])), OUTSIDE_US];
export const NEW_ENGLAND = ["CT", "ME", "MA", "NH", "RI", "VT"] as const;

export function stateSlug(state: string): string {
  return state === OUTSIDE_US ? "outside" : state.toLowerCase();
}

export function stateName(state: string): string {
  return STATES[state] ?? state;
}

const STATE_BY_SLUG = new Map(STATE_OPTIONS.map((s) => [stateSlug(s), s]));

// —— Values ——
// Bounds are kept as typed: percents and points as percents (20 means 20%),
// ratios and counts as is, dollar figures in dollars. The query converts.
export type Range = { min: number | null; max: number | null };

export type Filters = {
  ranges: Partial<Record<string, Range>>;
  sectors: Sector[];
  // Two-letter codes, or OUTSIDE_US.
  states: string[];
  // "Pays a dividend": Yes, or Either (false). Never No (Eli, 5 November).
  dividend: boolean;
};

export const NO_FILTERS: Filters = { ranges: {}, sectors: [], states: [], dividend: false };

// Tidies what a person types or a link carries: spaces, thousands commas, a
// typographic minus, a leading plus.
function clean(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/[\s,_]/g, "");
}

const LIMIT = 1e15;
const NUMBER = /^([+-]?)(\d+(?:\.\d+)?|\.\d+)$/;

function signedNumber(text: string, max: number): number | null {
  const m = text.match(NUMBER);
  if (!m) return null;
  const v = Number(m[2]) * (m[1] === "-" ? -1 : 1);
  return Number.isFinite(v) && Math.abs(v) <= max ? v : null;
}

// "20", "20%", "-2", "−2.5 %", "+5" → the percent as a number. Points also
// take "5 pts" or "5 points". Anything else is null.
export function parsePercent(text: string | null | undefined): number | null {
  if (text == null) return null;
  return signedNumber(clean(text).replace(/(%|pts?|points?|percent)$/, ""), 1e6);
}

// "1.5", "1.5x", "1.5×" → 1.5.
export function parseRatio(text: string | null | undefined): number | null {
  if (text == null) return null;
  return signedNumber(clean(text).replace(/[x×]$/, ""), 1e6);
}

// "10", "10 years" → 10. Whole, from 0 to 100.
export function parseCount(text: string | null | undefined): number | null {
  if (text == null) return null;
  const v = signedNumber(clean(text).replace(/(years?|yrs?)$/, ""), 100);
  return v != null && Number.isInteger(v) && v >= 0 ? v : null;
}

const MONEY_SUFFIX: Record<string, number> = {
  "": 1,
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  mn: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  t: 1e12,
  tn: 1e12,
  trillion: 1e12,
};

// "1b", "$1.5 billion", "-$250M", "100,000" → dollars. A bare number is dollars.
export function parseMoney(text: string | null | undefined): number | null {
  if (text == null) return null;
  const m = clean(text).match(/^([+-]?)\$?([+-]?)(\d+(?:\.\d+)?|\.\d+)([a-z]*)$/);
  if (!m || (m[1] && m[2])) return null;
  const mult = MONEY_SUFFIX[m[4]];
  if (mult === undefined) return null;
  const v = Math.round(Number(m[3]) * mult) * (m[1] === "-" || m[2] === "-" ? -1 : 1);
  return Number.isFinite(v) && Math.abs(v) <= LIMIT ? v : null;
}

export function parseValue(unit: Unit, text: string | null | undefined): number | null {
  if (unit === "money") return parseMoney(text);
  if (unit === "ratio") return parseRatio(text);
  if (unit === "count") return parseCount(text);
  return parsePercent(text);
}

// Dollars in the link's short form: 1e9 → "1b", 2.5e8 → "250m", -2e9 → "-2b".
export function moneyParam(value: number): string {
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(value);
  for (const [suffix, unit] of [["t", 1e12], ["b", 1e9], ["m", 1e6], ["k", 1e3]] as const) {
    if (v < unit) continue;
    const q = v / unit;
    // Up to three decimals of the unit, so 1.234b stays 1.234b.
    if (Math.abs(q * 1000 - Math.round(q * 1000)) < 1e-6) return `${sign}${Number(q.toFixed(3))}${suffix}`;
  }
  return `${sign}${Math.round(v)}`;
}

function valueParam(unit: Unit, value: number): string {
  return unit === "money" ? moneyParam(value) : String(value);
}

// What a filter box shows for a bound: "1B", "-250M", "20", "1.5".
export function boxText(unit: Unit, value: number | null): string {
  if (value == null) return "";
  return unit === "money" ? moneyParam(value).toUpperCase() : String(value);
}

// A bound, short: "$1B", "-$250M", "20%", "5 pts", "1.5×", "10 years".
export function boundLabel(unit: Unit, value: number): string {
  if (unit === "percent") return `${value}%`;
  if (unit === "points") return `${value} pts`;
  if (unit === "ratio") return `${value}×`;
  if (unit === "count") return value === 1 ? "1 year" : `${value} years`;
  const text = moneyParam(Math.abs(value)).toUpperCase();
  return `${value < 0 ? "-" : ""}$${text}`;
}

// A dollar bound in words, for a sentence: "$500 million", "$1.5 billion".
export function moneyWords(value: number): string {
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(value);
  for (const [word, unit] of [["trillion", 1e12], ["billion", 1e9], ["million", 1e6]] as const) {
    if (v >= unit) return `${sign}$${Number((v / unit).toFixed(3))} ${word}`;
  }
  return `${sign}$${Math.round(v).toLocaleString("en-US")}`;
}

// A range from its two ends. A min above the max is read as the two swapped
// round, which is what the person meant; a range with neither end is no filter.
export function makeRange(min: number | null, max: number | null): Range | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min > max) return { min: max, max: min };
  return { min, max };
}

// "20..", "..-2", "100m..1b" → a range.
export function parseRange(unit: Unit, text: string | null | undefined): Range | null {
  if (text == null || !text.includes("..")) return null;
  const [lo, hi, ...rest] = text.split("..");
  if (rest.length) return null;
  return makeRange(lo.trim() ? parseValue(unit, lo) : null, hi.trim() ? parseValue(unit, hi) : null);
}

export function rangeParam(unit: Unit, range: Range): string {
  return `${range.min == null ? "" : valueParam(unit, range.min)}..${range.max == null ? "" : valueParam(unit, range.max)}`;
}

// —— The view: filters plus sort, paging and whether the panel starts open ——
export type SortKey = "name" | "sector" | string;
export type Order = "asc" | "desc";

export type View = {
  filters: Filters;
  sort: SortKey;
  order: Order;
  // Rows shown: fifty, then fifty more at a time.
  show: number;
  // The filter panel starts open ("Or build your own").
  edit: boolean;
};

// The sort a page starts with: revenue, largest first, on /screener; a
// starting screen's own measure on its page.
export type SortBase = { sort: SortKey; order: Order };

export const PAGE_SIZE = 50;
// Past 500 rows a list has stopped being browsable, and the page is heavy (a
// thousand rows was 2.5 MB and nearly three seconds on 6 November 2026), so
// the page asks for a narrower screen or another sort instead.
export const MAX_SHOW = 500;
export const DEFAULT_SORT: SortKey = "revenue";
export const DEFAULT_BASE: SortBase = { sort: DEFAULT_SORT, order: "desc" };

export function isSortKey(key: string): boolean {
  return key === "name" || key === "sector" || BY_PARAM.has(key);
}

// Names and sectors read A to Z first; figures largest first.
export function defaultOrder(sort: SortKey): Order {
  return sort === "name" || sort === "sector" ? "asc" : "desc";
}

function baseOrder(sort: SortKey, base: SortBase): Order {
  return sort === base.sort ? base.order : defaultOrder(sort);
}

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function list(value: string | string[] | undefined): string[] {
  return (Array.isArray(value) ? value : value ? [value] : []).flatMap((s) => s.split(",")).map((s) => s.trim());
}

export function parseFilters(params: Params): Filters {
  const ranges: Filters["ranges"] = {};
  for (const f of RANGE_FILTERS) {
    // The link's form, "20..50"; or a plain form's two boxes, growth1y_min and
    // growth1y_max, which is what the panel sends if its script hasn't run.
    const range =
      parseRange(f.unit, first(params[f.param])) ??
      makeRange(parseValue(f.unit, first(params[`${f.param}_min`])), parseValue(f.unit, first(params[`${f.param}_max`])));
    if (range) ranges[f.param] = range;
  }
  const sectorsPicked = new Set(list(params.sector).map((s) => SECTOR_BY_SLUG.get(sectorSlug(s))).filter((s): s is Sector => s != null));
  const statesPicked = new Set(list(params.state).map((s) => STATE_BY_SLUG.get(s.toLowerCase())).filter((s): s is string => s != null));
  return {
    ranges,
    sectors: SECTOR_OPTIONS.filter((s) => sectorsPicked.has(s)),
    states: STATE_OPTIONS.filter((s) => statesPicked.has(s)),
    dividend: ["yes", "1", "true"].includes(first(params.dividend)?.trim().toLowerCase() ?? ""),
  };
}

export function parseView(params: Params, base: SortBase = DEFAULT_BASE): View {
  const filters = parseFilters(params);
  const sortRaw = first(params.sort)?.trim().toLowerCase();
  const sort = sortRaw && isSortKey(sortRaw) ? sortRaw : base.sort;
  const orderRaw = first(params.order)?.trim().toLowerCase();
  const order: Order = orderRaw === "asc" || orderRaw === "desc" ? orderRaw : baseOrder(sort, base);
  const showRaw = Number(first(params.show));
  const show = Number.isFinite(showRaw) && showRaw > PAGE_SIZE ? Math.min(MAX_SHOW, Math.ceil(showRaw / PAGE_SIZE) * PAGE_SIZE) : PAGE_SIZE;
  const edit = first(params.edit) === "1";
  return { filters, sort, order, show, edit };
}

export function hasFilters(filters: Filters): boolean {
  return filters.sectors.length > 0 || filters.states.length > 0 || filters.dividend || RANGE_FILTERS.some((f) => filters.ranges[f.param]);
}

// The opening view (starting screens) shows when the link asks for nothing
// the results view would use.
export function isOpeningView(view: View): boolean {
  return !hasFilters(view.filters) && view.sort === DEFAULT_SORT && view.order === defaultOrder(DEFAULT_SORT) && view.show === PAGE_SIZE && !view.edit;
}

// The link's query, in a fixed order, leaving out every default.
export function filterQuery(filters: Filters): URLSearchParams {
  const q = new URLSearchParams();
  for (const f of RANGE_FILTERS) {
    const r = filters.ranges[f.param];
    if (r) q.set(f.param, rangeParam(f.unit, r));
  }
  if (filters.sectors.length) q.set("sector", filters.sectors.map(sectorSlug).join(","));
  if (filters.states.length) q.set("state", filters.states.map(stateSlug).join(","));
  if (filters.dividend) q.set("dividend", "yes");
  return q;
}

export function viewQuery(view: View, opts: { filters?: boolean; base?: SortBase } = {}): string {
  const base = opts.base ?? DEFAULT_BASE;
  const q = opts.filters === false ? new URLSearchParams() : filterQuery(view.filters);
  if (view.sort !== base.sort) q.set("sort", view.sort);
  if (view.order !== baseOrder(view.sort, base)) q.set("order", view.order);
  if (view.show > PAGE_SIZE) q.set("show", String(view.show));
  if (view.edit) q.set("edit", "1");
  // URLSearchParams writes "," as %2C and ".." as is; commas read better.
  return q.toString().replace(/%2C/gi, ",");
}

export function withoutRange(filters: Filters, param: string): Filters {
  const ranges = { ...filters.ranges };
  delete ranges[param];
  return { ...filters, ranges };
}

// Removes one chip's filter: a range by its param, or "sector", "state",
// "dividend".
export function withoutFilter(filters: Filters, key: string): Filters {
  if (key === "sector") return { ...filters, sectors: [] };
  if (key === "state") return { ...filters, states: [] };
  if (key === "dividend") return { ...filters, dividend: false };
  return withoutRange(filters, key);
}

export function sameFilters(a: Filters, b: Filters): boolean {
  return filterQuery(a).toString() === filterQuery(b).toString();
}

// The filters as database conditions (lib/screener/query.ts). Percents and
// points are stored as fractions; a null fails every comparison, so n/a drops
// out.
export type Condition =
  | { op: "gte" | "lte"; column: string; value: number }
  | { op: "in"; column: string; values: string[] }
  | { op: "is"; column: string; value: boolean };

export function toStored(unit: Unit, value: number): number {
  return unit === "percent" || unit === "points" ? value / 100 : value;
}

export function conditions(filters: Filters): Condition[] {
  const out: Condition[] = [];
  for (const f of RANGE_FILTERS) {
    const r = filters.ranges[f.param];
    if (!r) continue;
    if (r.min != null) out.push({ op: "gte", column: f.column, value: toStored(f.unit, r.min) });
    if (r.max != null) out.push({ op: "lte", column: f.column, value: toStored(f.unit, r.max) });
  }
  if (filters.sectors.length) out.push({ op: "in", column: "sector", values: [...filters.sectors] });
  if (filters.states.length) out.push({ op: "in", column: "state", values: [...filters.states] });
  if (filters.dividend) out.push({ op: "is", column: "pays_dividend", value: true });
  return out;
}

// —— Words ——
// "20% or more", "-2% or less", "5% to 20%"; dollars "at least $1B".
export function rangePhrase(f: RangeFilter, r: Range): string {
  const b = (v: number) => boundLabel(f.unit, v);
  if (r.min != null && r.max != null) return r.min === r.max ? `exactly ${b(r.min)}` : `${b(r.min)} to ${b(r.max)}`;
  if (f.unit === "money") return r.min != null ? `at least ${b(r.min)}` : `at most ${b(r.max as number)}`;
  if (r.min != null) return `${b(r.min)} or more`;
  return `${b(r.max as number)} or less`;
}

// A chip: "Return on invested capital: 25% or more", "Revenue: at least $500M".
export function chipText(f: RangeFilter, r: Range): string {
  return `${f.label}: ${rangePhrase(f, r)}`;
}

function listWords(items: string[], last: "and" | "or"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${last} ${items[items.length - 1]}`;
}

export function sectorChipText(sectors: readonly string[]): string {
  return sectors.length <= 3 ? `Sector: ${sectors.join(", ")}` : `Sector: ${sectors.length} chosen`;
}

export function stateChipText(states: readonly string[]): string {
  const ne = [...NEW_ENGLAND] as string[];
  if (states.length === ne.length && ne.every((s) => states.includes(s))) return "Headquarters: New England";
  return states.length <= 3 ? `Headquarters: ${states.map(stateName).join(", ")}` : `Headquarters: ${states.length} places`;
}

export const DIVIDEND_CHIP = "Pays a dividend";

// Every active filter as a line of plain words: chips, and a starting
// screen's card. On a card ("plain"), a filter a person would say in words
// is said that way: "A net loss", not "Net margin: 0% or less".
export function filterLines(filters: Filters, opts: { plain?: boolean } = {}): { key: string; text: string }[] {
  const lines: { key: string; text: string }[] = [];
  for (const f of RANGE_FILTERS) {
    const r = filters.ranges[f.param];
    if (!r) continue;
    const said = opts.plain ? spokenClause(f, r) : null;
    lines.push({ key: f.param, text: said ? said.charAt(0).toUpperCase() + said.slice(1) : chipText(f, r) });
  }
  if (filters.dividend) lines.push({ key: "dividend", text: DIVIDEND_CHIP });
  if (filters.sectors.length) lines.push({ key: "sector", text: sectorChipText(filters.sectors) });
  if (filters.states.length) lines.push({ key: "state", text: stateChipText(filters.states) });
  return lines;
}

// A few ranges said the way a person would ("a net loss", "more cash than
// debt", "a share count down 6% or more"); null for the rest.
function spokenClause(f: RangeFilter, r: Range): string | null {
  const onlyMin = r.min != null && r.max == null;
  const onlyMax = r.max != null && r.min == null;
  if (f.param === "net" && onlyMax && (r.max as number) <= 0) return "a net loss";
  if (f.param === "net" && onlyMin && r.min === 0) return "a net profit";
  if (f.param === "fcf" && onlyMin && r.min === 0) return "positive free cash flow";
  if (f.param === "netcash" && onlyMin && r.min === 0) return "more cash than debt";
  if (f.param === "shares" && onlyMax && (r.max as number) < 0) return `a share count down ${-(r.max as number)}% or more over the year`;
  if (f.param === "shares" && onlyMin && (r.min as number) > 0) return `a share count up ${r.min}% or more over the year`;
  if (f.param === "growth1y" && onlyMax && (r.max as number) < 0) return `revenue down ${-(r.max as number)}% or more over the year`;
  if (f.param === "marginchange" && onlyMin && (r.min as number) > 0) return `an operating margin up ${r.min} points or more over three years`;
  if (f.param === "years" && onlyMin) return `revenue growth in each of the last ${r.min} years`;
  return null;
}

// One range in a sentence: "a return on invested capital of 25% or more",
// "revenue of at least $500 million", or the spoken form above.
function clause(f: RangeFilter, r: Range): string {
  const said = spokenClause(f, r);
  if (said) return said;
  if (f.param === "divfcf" || f.param === "buyfcf") return `${f.phrase} of ${rangePhrase(f, r)} of free cash flow`;
  if (f.unit === "money") {
    const w = (v: number) => moneyWords(v);
    const words = r.min != null && r.max != null ? `${w(r.min)} to ${w(r.max)}` : r.min != null ? `at least ${w(r.min)}` : `at most ${w(r.max as number)}`;
    return `${f.phrase} of ${words}`;
  }
  return `${f.phrase} of ${rangePhrase(f, r)}`;
}

// The screen restated in one plain sentence, under its title: "Companies
// with a return on invested capital of 25% or more and revenue of at least
// $500 million."
export function describeScreen(filters: Filters): string {
  const lead: string[] = [];
  if (filters.sectors.length) lead.push(`in ${listWords(filters.sectors.map((s) => s.toLowerCase()), "or")}`);
  if (filters.states.length) {
    const ne = [...NEW_ENGLAND] as string[];
    const isNe = filters.states.length === ne.length && ne.every((s) => filters.states.includes(s));
    lead.push(isNe ? "based in New England" : `based in ${listWords(filters.states.map(stateName), "or")}`);
  }
  if (filters.dividend) lead.push("that pay a dividend");
  const withs = RANGE_FILTERS.filter((f) => filters.ranges[f.param]).map((f) => clause(f, filters.ranges[f.param] as Range));
  if (!lead.length && !withs.length) return "Every company in the screener.";
  return `Companies${lead.length ? ` ${lead.join(", ")}` : ""}${withs.length ? `${lead.length ? "," : ""} with ${listWords(withs, "and")}` : ""}.`;
}

// "Sorted by revenue, largest first."
export function sortPhrase(sort: SortKey, order: Order): string {
  if (sort === "name") return `Sorted by name, ${order === "asc" ? "A to Z" : "Z to A"}`;
  if (sort === "sector") return `Sorted by sector, ${order === "asc" ? "A to Z" : "Z to A"}`;
  const f = rangeFilter(sort);
  if (!f) return "";
  const which = f.unit === "money" && f.param !== "netcash" ? (order === "desc" ? "largest" : "smallest") : order === "desc" ? "highest" : "lowest";
  return `Sorted by ${f.noun}, ${which} first`;
}

// A figure in the results: "$215.9B", "+65.5%", "-12.3%", "+5.0 pts",
// "1.42×", "10", "n/a".
export function formatFigure(f: RangeFilter, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (f.unit === "money") return formatMoney(value);
  if (f.unit === "count") return String(Math.round(value));
  if (f.unit === "ratio") {
    const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
    return `${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}×`;
  }
  const pct = value * 100;
  const big = Math.abs(pct) >= 1000;
  const rounded = Number(pct.toFixed(big ? 0 : 1));
  const body = big ? Math.abs(rounded).toLocaleString("en-US") : Math.abs(rounded).toFixed(1);
  const sign = rounded < 0 ? "-" : (f.signed || f.unit === "points") && rounded > 0 ? "+" : "";
  return f.unit === "points" ? `${sign}${body} pts` : `${sign}${body}%`;
}

// Where the middle company sits, under a filter's name: "Half of companies:
// above 38.2%". For "pays a dividend", the share that do.
export function medianText(f: RangeFilter, median: number): string {
  // A count's middle is a whole number many companies share: "1 year or more".
  if (f.unit === "count") return `Half of companies: ${boundLabel("count", Math.round(median))} or more`;
  return `Half of companies: above ${formatFigure(f, median)}`;
}

export function dividendShareText(share: number): string {
  return `Paid by ${Math.round(share * 100)}% of companies`;
}

// —— Results columns ——
// The screen's own measure first after the company (what it sorts by), then
// the other active filters, then revenue. A screen with few filters is filled
// to three measures with growth and two margins, so every row says
// something. A phone shows the first two measures after revenue.
const DEFAULT_COLUMNS = ["growth1y", "net", "fcf"];

export function resultColumns(view: View): RangeFilter[] {
  const keys: string[] = [];
  if (view.sort !== "revenue" && BY_PARAM.has(view.sort)) keys.push(view.sort);
  for (const f of RANGE_FILTERS) if (f.param !== "revenue" && view.filters.ranges[f.param] && !keys.includes(f.param)) keys.push(f.param);
  const measures = keys.length;
  keys.push("revenue");
  for (const d of DEFAULT_COLUMNS) {
    if (keys.length - 1 >= Math.max(3, measures)) break;
    if (!keys.includes(d)) keys.push(d);
  }
  return keys.map((k) => BY_PARAM.get(k) as RangeFilter);
}

// What a column head's link asks for: the other direction if it's already the
// sort, otherwise that column in its usual direction. Back to fifty rows.
export function sortTarget(view: View, key: SortKey): View {
  const order = view.sort === key ? (view.order === "asc" ? "desc" : "asc") : defaultOrder(key);
  return { ...view, sort: key, order, show: PAGE_SIZE, edit: false };
}

// "2026-01-25" → "Jan 2026".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function yearEnded(periodEnd: string | null | undefined): string {
  const m = periodEnd?.match(/^(\d{4})-(\d{2})/);
  if (!m) return "n/a";
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

// "2026-11-06T09:01:12Z" → "6 November 2026", in U.S. Eastern time, where
// the SEC is.
export function dayLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "America/New_York" });
}
