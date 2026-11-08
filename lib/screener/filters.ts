// The screener's filters, sorting and paging, and how each is written in the
// page link. Pure, and shared by the page (server) and the filter panel
// (browser), so a link, a typed box and a removed chip all go through the same
// rules.
//
// The whole screen lives in the link, so copy-link, the back button and a
// texted link all reproduce it:
//   /screener?growth1y=20..&fcf=0..&sector=technology,health-care&sort=net&order=asc&show=100
// A range is "min..max" with either end left off; percents are written as
// percents ("20" is 20%) and dollar figures with a suffix ("1b", "250m").
// Anything in a link that doesn't parse is ignored, never an error.

import { formatMoney } from "@/lib/research/format";
import { SECTORS, type Sector } from "@/lib/screener/sectors";

export type Unit = "money" | "percent";

export type RangeFilter = {
  // Its name in the link.
  param: string;
  // Its column in screener_metrics.
  column: string;
  // In the filter panel and on a chip: "Revenue growth, 1 yr".
  label: string;
  // On a starting screen's card and at the head of a results column.
  short: string;
  // After "Sorted by": "1-year revenue growth".
  noun: string;
  unit: Unit;
  // Growth and changes show a + on positives; margins don't.
  signed: boolean;
  group: "Size and growth" | "Margins" | "Balance sheet and shares";
};

// The main ten (nine ranges and the sector), in the brief's order. Stage D
// adds the seventeen behind "More filters".
export const RANGE_FILTERS: readonly RangeFilter[] = [
  { param: "revenue", column: "revenue", label: "Revenue, latest year", short: "Revenue", noun: "revenue", unit: "money", signed: false, group: "Size and growth" },
  { param: "growth1y", column: "revenue_growth_1y", label: "Revenue growth, 1 yr", short: "Rev. growth 1 yr", noun: "1-year revenue growth", unit: "percent", signed: true, group: "Size and growth" },
  { param: "growth3y", column: "revenue_growth_3y", label: "Revenue growth, 3 yr average", short: "Rev. growth 3 yr", noun: "3-year revenue growth", unit: "percent", signed: true, group: "Size and growth" },
  { param: "gross", column: "gross_margin", label: "Gross margin", short: "Gross margin", noun: "gross margin", unit: "percent", signed: false, group: "Margins" },
  { param: "operating", column: "operating_margin", label: "Operating margin", short: "Op. margin", noun: "operating margin", unit: "percent", signed: false, group: "Margins" },
  { param: "net", column: "net_margin", label: "Net margin", short: "Net margin", noun: "net margin", unit: "percent", signed: false, group: "Margins" },
  { param: "fcf", column: "fcf_margin", label: "Free cash flow margin", short: "FCF margin", noun: "free cash flow margin", unit: "percent", signed: false, group: "Margins" },
  { param: "netcash", column: "net_cash", label: "Net cash or debt", short: "Net cash", noun: "net cash", unit: "money", signed: false, group: "Balance sheet and shares" },
  { param: "shares", column: "share_change_1y", label: "Share count change, 1 yr", short: "Share change 1 yr", noun: "1-year share count change", unit: "percent", signed: true, group: "Balance sheet and shares" },
];

export const FILTER_GROUPS = ["Size and growth", "Margins", "Balance sheet and shares"] as const;

const BY_PARAM = new Map(RANGE_FILTERS.map((f) => [f.param, f]));

export function rangeFilter(param: string): RangeFilter | undefined {
  return BY_PARAM.get(param);
}

// The sector filter's choices: the eleven sectors, then "Other" (blank-check
// companies and anything SIC doesn't place). Fifty companies have no SIC code
// at all; they drop out of any sector filter, as n/a does everywhere.
export const SECTOR_OPTIONS: readonly Sector[] = [...SECTORS, "Other"];

export function sectorSlug(sector: string): string {
  return sector.toLowerCase().replace(/\s+/g, "-");
}

const SECTOR_BY_SLUG = new Map(SECTOR_OPTIONS.map((s) => [sectorSlug(s), s]));

// —— Values ——
// Bounds are kept as typed: percents as percents (20 means 20%), dollar
// figures in dollars. The query divides percents by 100.
export type Range = { min: number | null; max: number | null };

export type Filters = {
  ranges: Partial<Record<string, Range>>;
  sectors: Sector[];
};

export const NO_FILTERS: Filters = { ranges: {}, sectors: [] };

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

// "20", "20%", "-2", "−2.5 %", "+5" → the percent as a number. Anything else is null.
export function parsePercent(text: string | null | undefined): number | null {
  if (text == null) return null;
  const m = clean(text).replace(/%$/, "").match(/^([+-]?)(\d+(?:\.\d+)?|\.\d+)$/);
  if (!m) return null;
  const v = Number(m[2]) * (m[1] === "-" ? -1 : 1);
  return Number.isFinite(v) && Math.abs(v) <= 1e6 ? v : null;
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
  return unit === "money" ? parseMoney(text) : parsePercent(text);
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

// What a filter box shows for a bound: "1B", "-250M", "20".
export function boxText(unit: Unit, value: number | null): string {
  if (value == null) return "";
  return unit === "money" ? moneyParam(value).toUpperCase() : String(value);
}

// A bound in words: "$1B", "-$250M", "20%", "-2%".
export function boundLabel(unit: Unit, value: number): string {
  if (unit === "percent") return `${value}%`;
  const text = moneyParam(Math.abs(value)).toUpperCase();
  return `${value < 0 ? "-" : ""}$${text}`;
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

export const PAGE_SIZE = 50;
// Past 500 rows a list has stopped being browsable, and the page is heavy (a
// thousand rows was 2.5 MB and nearly three seconds on 6 November 2026), so
// the page asks for a narrower screen or another sort instead.
export const MAX_SHOW = 500;
export const DEFAULT_SORT: SortKey = "revenue";

export function isSortKey(key: string): boolean {
  return key === "name" || key === "sector" || BY_PARAM.has(key);
}

// Names and sectors read A to Z first; figures largest first.
export function defaultOrder(sort: SortKey): Order {
  return sort === "name" || sort === "sector" ? "asc" : "desc";
}

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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
  const raw = params.sector;
  const slugs = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((s) => s.split(","));
  const picked = new Set(slugs.map((s) => SECTOR_BY_SLUG.get(sectorSlug(s.trim()))).filter((s): s is Sector => s != null));
  return { ranges, sectors: SECTOR_OPTIONS.filter((s) => picked.has(s)) };
}

export function parseView(params: Params): View {
  const filters = parseFilters(params);
  const sortRaw = first(params.sort)?.trim().toLowerCase();
  const sort = sortRaw && isSortKey(sortRaw) ? sortRaw : DEFAULT_SORT;
  const orderRaw = first(params.order)?.trim().toLowerCase();
  const order: Order = orderRaw === "asc" || orderRaw === "desc" ? orderRaw : defaultOrder(sort);
  const showRaw = Number(first(params.show));
  const show = Number.isFinite(showRaw) && showRaw > PAGE_SIZE ? Math.min(MAX_SHOW, Math.ceil(showRaw / PAGE_SIZE) * PAGE_SIZE) : PAGE_SIZE;
  const edit = first(params.edit) === "1";
  return { filters, sort, order, show, edit };
}

export function hasFilters(filters: Filters): boolean {
  return filters.sectors.length > 0 || RANGE_FILTERS.some((f) => filters.ranges[f.param]);
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
  return q;
}

export function viewQuery(view: View, opts: { filters?: boolean } = {}): string {
  const q = opts.filters === false ? new URLSearchParams() : filterQuery(view.filters);
  if (view.sort !== DEFAULT_SORT) q.set("sort", view.sort);
  if (view.order !== defaultOrder(view.sort)) q.set("order", view.order);
  if (view.show > PAGE_SIZE) q.set("show", String(view.show));
  if (view.edit) q.set("edit", "1");
  // URLSearchParams writes "," as %2C and ".." as is; commas read better.
  return q.toString().replace(/%2C/gi, ",");
}

export function withoutRange(filters: Filters, param: string): Filters {
  const ranges = { ...filters.ranges };
  delete ranges[param];
  return { ranges, sectors: filters.sectors };
}

export function sameFilters(a: Filters, b: Filters): boolean {
  return filterQuery(a).toString() === filterQuery(b).toString();
}

// The filters as database conditions (lib/screener/query.ts). Percents are
// stored as fractions; a null fails every comparison, so n/a drops out.
export type Condition = { op: "gte" | "lte"; column: string; value: number } | { op: "in"; column: string; values: string[] };

export function conditions(filters: Filters): Condition[] {
  const out: Condition[] = [];
  for (const f of RANGE_FILTERS) {
    const r = filters.ranges[f.param];
    if (!r) continue;
    const db = (v: number) => (f.unit === "percent" ? v / 100 : v);
    if (r.min != null) out.push({ op: "gte", column: f.column, value: db(r.min) });
    if (r.max != null) out.push({ op: "lte", column: f.column, value: db(r.max) });
  }
  if (filters.sectors.length) out.push({ op: "in", column: "sector", values: [...filters.sectors] });
  return out;
}

// —— Words ——
// "20% or more", "-2% or less", "5% to 20%".
export function rangePhrase(f: RangeFilter, r: Range): string {
  const b = (v: number) => boundLabel(f.unit, v);
  if (r.min != null && r.max != null) return r.min === r.max ? `exactly ${b(r.min)}` : `${b(r.min)} to ${b(r.max)}`;
  if (r.min != null) return `${b(r.min)} or more`;
  return `${b(r.max as number)} or less`;
}

// A chip: "Revenue growth, 1 yr: 20% or more".
export function chipText(f: RangeFilter, r: Range): string {
  return `${f.label}: ${rangePhrase(f, r)}`;
}

export function sectorChipText(sectors: readonly string[]): string {
  return sectors.length <= 3 ? `Sector: ${sectors.join(", ")}` : `Sector: ${sectors.length} chosen`;
}

// A starting screen's card, in mono: "Rev. growth 1 yr ≥ 20%".
export function cardText(f: RangeFilter, r: Range): string {
  const b = (v: number) => boundLabel(f.unit, v);
  if (r.min != null && r.max != null) return `${f.short} ${b(r.min)} to ${b(r.max)}`;
  if (r.min != null) return `${f.short} ≥ ${b(r.min)}`;
  return `${f.short} ≤ ${b(r.max as number)}`;
}

export function filterLines(filters: Filters, style: "card" | "chip"): string[] {
  const lines: string[] = [];
  for (const f of RANGE_FILTERS) {
    const r = filters.ranges[f.param];
    if (r) lines.push(style === "card" ? cardText(f, r) : chipText(f, r));
  }
  if (filters.sectors.length) lines.push(sectorChipText(filters.sectors));
  return lines;
}

// "Sorted by revenue, largest first."
export function sortPhrase(sort: SortKey, order: Order): string {
  if (sort === "name") return `Sorted by name, ${order === "asc" ? "A to Z" : "Z to A"}`;
  if (sort === "sector") return `Sorted by sector, ${order === "asc" ? "A to Z" : "Z to A"}`;
  const f = rangeFilter(sort);
  if (!f) return "";
  const which = f.unit === "money" && f.param === "revenue" ? (order === "desc" ? "largest" : "smallest") : order === "desc" ? "highest" : "lowest";
  return `Sorted by ${f.noun}, ${which} first`;
}

// A figure in the results: "$215.9B", "+65.5%", "-12.3%", "n/a".
export function formatFigure(f: RangeFilter, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (f.unit === "money") return formatMoney(value);
  const pct = value * 100;
  const big = Math.abs(pct) >= 1000;
  const rounded = Number(pct.toFixed(big ? 0 : 1));
  if (rounded === 0) return big ? "0%" : "0.0%";
  const body = big ? Math.abs(rounded).toLocaleString("en-US") : Math.abs(rounded).toFixed(1);
  const sign = rounded < 0 ? "-" : f.signed ? "+" : "";
  return `${sign}${body}%`;
}

// —— Results columns ——
// After name, sector and revenue, the table shows a column for each active
// filter, then the sort column if it isn't one of them, then fills to three
// with growth and two margins, so a screen with one filter still says
// something about each company. A phone shows the first two.
const DEFAULT_COLUMNS = ["growth1y", "net", "fcf"];

export function resultColumns(view: View): RangeFilter[] {
  const keys: string[] = [];
  for (const f of RANGE_FILTERS) if (f.param !== "revenue" && view.filters.ranges[f.param]) keys.push(f.param);
  if (view.sort !== "revenue" && BY_PARAM.has(view.sort) && !keys.includes(view.sort)) keys.push(view.sort);
  for (const d of DEFAULT_COLUMNS) {
    if (keys.length >= 3) break;
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
