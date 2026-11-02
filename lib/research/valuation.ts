// The Valuation tab's arithmetic (phase nine, stage 4). Pure: stored SEC rows
// and price history in, figures out, so every rule is tested on real filings.
//
// Everything here describes the price, never judges it. A multiple is placed
// against the company's own past ("higher than at 62% of quarter-ends since
// 2016"); nothing says what it ought to be.

import type { FinancialRow, FiscalPeriod } from "@/lib/sec/normalize";
import type { LineItem } from "@/lib/sec/concepts";
import { factorAt, type SplitStep } from "@/lib/research/splits";

const DAY_MS = 86_400_000;

function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / DAY_MS;
}

type QuarterPeriod = Exclude<FiscalPeriod, "FY">;
export type Quarter = { fiscalYear: number; fiscalPeriod: QuarterPeriod; periodEnd: string };

// Rows by line item, year and period, built once per company.
export class RowIndex {
  private byKey = new Map<string, FinancialRow>();
  readonly covers: FinancialRow[];

  constructor(rows: FinancialRow[]) {
    for (const r of rows) this.byKey.set(`${r.lineItem}|${r.fiscalYear}|${r.fiscalPeriod}`, r);
    this.covers = rows
      .filter((r) => r.lineItem === "shares_outstanding" && r.value > 0)
      .sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
  }

  get(item: LineItem, fiscalYear: number, fiscalPeriod: FiscalPeriod): FinancialRow | undefined {
    return this.byKey.get(`${item}|${fiscalYear}|${fiscalPeriod}`);
  }
}

// Every fiscal quarter the company has income-statement figures for, oldest
// first. Revenue and net income together, so a bank (which has both) and an
// odd filer missing one still get a calendar.
export function quarterList(rows: FinancialRow[]): Quarter[] {
  const seen = new Map<string, Quarter>();
  for (const r of rows) {
    if ((r.lineItem !== "revenue" && r.lineItem !== "net_income") || r.fiscalPeriod === "FY") continue;
    const key = `${r.fiscalYear}|${r.fiscalPeriod}`;
    if (!seen.has(key)) seen.set(key, { fiscalYear: r.fiscalYear, fiscalPeriod: r.fiscalPeriod, periodEnd: r.periodEnd });
  }
  return [...seen.values()].sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
}

function previousQuarters(q: Quarter, count: number): { fiscalYear: number; fiscalPeriod: QuarterPeriod }[] {
  const out: { fiscalYear: number; fiscalPeriod: QuarterPeriod }[] = [];
  const n = Number(q.fiscalPeriod[1]);
  for (let i = 0; i < count; i++) {
    let p = n - i;
    let y = q.fiscalYear;
    if (p <= 0) {
      p += 4;
      y -= 1;
    }
    out.push({ fiscalYear: y, fiscalPeriod: `Q${p}` as QuarterPeriod });
  }
  return out;
}

// The four quarters to q, added up. At a fiscal year end that is simply the
// reported full year, which is exact even where a quarter is missing. Null if
// any of the four is missing: three quarters are not a year.
export function trailingFour(idx: RowIndex, item: LineItem, q: Quarter): number | null {
  if (q.fiscalPeriod === "Q4") {
    const fy = idx.get(item, q.fiscalYear, "FY");
    if (fy) return fy.value;
  }
  let sum = 0;
  for (const p of previousQuarters(q, 4)) {
    const r = idx.get(item, p.fiscalYear, p.fiscalPeriod);
    if (!r) return null;
    sum += r.value;
  }
  return sum;
}

// A balance-sheet figure on q's own date. A figure from another date is not
// used, so a company that stopped filing a debt tag years ago (JPMorgan's
// stops in 2014) gets a blank, not an old number passed off as current.
export function balanceAt(idx: RowIndex, item: LineItem, q: Quarter): number | null {
  const r = idx.get(item, q.fiscalYear, q.fiscalPeriod);
  if (!r || Math.abs(daysBetween(q.periodEnd, r.periodEnd)) > 10) return null;
  return r.value;
}

export type ShareCount = { value: number; basisDate: string; source: "cover" | "diluted" };

// How many shares there were at q, and on what date that count was stated (a
// split after that date changes what the count means today).
//
// First choice is the cover of the filing for that quarter, stated a few weeks
// after it ends. A company with several share classes has no single cover
// count in the SEC's data (Alphabet), so the quarter's diluted share count
// stands in, stated as of the filing it was taken from.
export function sharesAt(idx: RowIndex, q: Quarter): ShareCount | null {
  const cover = idx.covers.find((c) => c.periodEnd > q.periodEnd && daysBetween(q.periodEnd, c.periodEnd) <= 130);
  if (cover) return { value: cover.value, basisDate: cover.periodEnd, source: "cover" };
  const diluted =
    idx.get("shares_diluted", q.fiscalYear, q.fiscalPeriod) ??
    (q.fiscalPeriod === "Q4" ? idx.get("shares_diluted", q.fiscalYear, "FY") : undefined);
  if (diluted && !diluted.derived && diluted.value > 0) {
    return { value: diluted.value, basisDate: diluted.filedAt || diluted.periodEnd, source: "diluted" };
  }
  return null;
}

// The adjusted close on q's date, or the last session before it (quarters
// often end on a weekend). Nothing more than a week stale.
export function closeOnOrBefore(daily: { date: string; close: number }[], date: string): number | null {
  let lo = 0;
  let hi = daily.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (daily[mid].date <= date) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0 || daysBetween(daily[found].date, date) > 7) return null;
  return daily[found].close;
}

// —— The multiples ——
export type Multiples = {
  pe: number | null;
  evSales: number | null;
  fcfYield: number | null;
  pb: number | null;
};

type MultipleInputs = {
  marketValue: number;
  netIncome: number | null;
  revenue: number | null;
  fcf: number | null;
  debt: number | null;
  cash: number | null;
  equity: number | null;
};

export function multiples(x: MultipleInputs): Multiples {
  // A loss has no meaningful P/E; it's left out, not shown as a negative.
  const pe = x.netIncome != null && x.netIncome > 0 ? x.marketValue / x.netIncome : null;
  const ev = x.debt != null && x.cash != null ? x.marketValue + x.debt - x.cash : null;
  const evSales = ev != null && x.revenue != null && x.revenue > 0 ? ev / x.revenue : null;
  const fcfYield = x.fcf != null && x.marketValue > 0 ? x.fcf / x.marketValue : null;
  const pb = x.equity != null && x.equity > 0 ? x.marketValue / x.equity : null;
  return { pe, evSales, fcfYield, pb };
}

// —— Ten years at each quarter end ——
export type QuarterPoint = Multiples & {
  periodEnd: string;
  fiscalYear: number;
  fiscalPeriod: QuarterPeriod;
  marketValue: number;
};

export function historyWindowStart(asOf: string, years = 10): string {
  const d = new Date(asOf);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

// The share counts the history would use, for deciding whether a split check
// is worth a request at all (splits.ts, needsSplitCheck).
export function shareCountsInWindow(rows: FinancialRow[], asOf: string, years = 10): { date: string; value: number }[] {
  const idx = new RowIndex(rows);
  const start = historyWindowStart(asOf, years);
  const out: { date: string; value: number }[] = [];
  for (const q of quarterList(rows)) {
    if (q.periodEnd < start) continue;
    const s = sharesAt(idx, q);
    if (s) out.push({ date: s.basisDate, value: s.value });
  }
  const latest = idx.covers[idx.covers.length - 1];
  if (latest && latest.periodEnd >= start) out.push({ date: latest.periodEnd, value: latest.value });
  return out;
}

export function valuationHistory(input: {
  rows: FinancialRow[];
  daily: { date: string; close: number }[];
  steps: SplitStep[];
  asOf: string;
  years?: number;
}): QuarterPoint[] {
  const idx = new RowIndex(input.rows);
  const start = historyWindowStart(input.asOf, input.years ?? 10);
  const points: QuarterPoint[] = [];

  for (const q of quarterList(input.rows)) {
    if (q.periodEnd < start) continue;
    const price = closeOnOrBefore(input.daily, q.periodEnd);
    const shares = sharesAt(idx, q);
    if (price == null || !shares) continue;
    const marketValue = price * shares.value * factorAt(input.steps, shares.basisDate);
    points.push({
      periodEnd: q.periodEnd,
      fiscalYear: q.fiscalYear,
      fiscalPeriod: q.fiscalPeriod,
      marketValue,
      ...multiples({
        marketValue,
        netIncome: trailingFour(idx, "net_income", q),
        revenue: trailingFour(idx, "revenue", q),
        fcf: trailingFour(idx, "free_cash_flow", q),
        debt: balanceAt(idx, "total_debt", q),
        cash: balanceAt(idx, "cash_and_equivalents", q),
        equity: balanceAt(idx, "total_equity", q),
      }),
    });
  }
  return points;
}

// —— Market value today ——
// Price times the shares on the newest filing's cover, per the brief, checked
// against Finnhub's count. They disagree by more than a buyback's worth only
// when something has happened the cover can't know: a split since it was
// filed, or a second share class it leaves out. Finnhub's is then used, and
// the page says so.
export type SharesToday = { shares: number; source: "cover" | "finnhub"; coverDate: string | null };

// Finnhub's share count in the units of the quoted ticker: its market value
// divided by the price. Its own share count won't do for a company with
// classes priced differently. For Berkshire it's 1.43 million (Class A
// equivalents) whichever class is asked about, which against the Class B
// price of $542 gave a market value of $776 million instead of $1.16 trillion
// (checked November 2026).
export function finnhubShareCount(
  profile: { marketCapMillions: number | null; sharesOutstandingMillions: number | null } | null,
  price: number | null,
): number | null {
  if (profile?.marketCapMillions && price && price > 0) return (profile.marketCapMillions * 1e6) / price;
  return profile?.sharesOutstandingMillions ? profile.sharesOutstandingMillions * 1e6 : null;
}

// A cover count older than this is not "today's". Berkshire's last single
// count is from April 2011; it has stated one per class since.
const STALE_COVER_DAYS = 400;

export function sharesToday(input: {
  rows: FinancialRow[];
  steps: SplitStep[] | null;
  finnhubShares: number | null;
  asOf: string;
}): SharesToday | null {
  const idx = new RowIndex(input.rows);
  const newest = idx.covers[idx.covers.length - 1];
  const latest = newest && daysBetween(newest.periodEnd, input.asOf) <= STALE_COVER_DAYS ? newest : undefined;
  if (latest) {
    const shares = latest.value * (input.steps ? factorAt(input.steps, latest.periodEnd) : 1);
    const other = input.finnhubShares;
    if (!other || other <= 0) return { shares, source: "cover", coverDate: latest.periodEnd };
    const ratio = other / shares;
    if (ratio > 0.85 && ratio < 1.18) return { shares, source: "cover", coverDate: latest.periodEnd };
    return { shares: other, source: "finnhub", coverDate: latest.periodEnd };
  }
  if (input.finnhubShares && input.finnhubShares > 0) {
    return { shares: input.finnhubShares, source: "finnhub", coverDate: null };
  }
  return null;
}

// —— Whether the history and today are on the same footing ——
// The newest quarter-end's market value, recomputed with today's share count,
// should be within a buyback or two of the one the history computed. If it's
// out by half or more, the two counts are measuring different things: shares
// of one class against another (Berkshire's filings count Class A
// equivalents, its B shares trade at a 1,500th of the price), or a split the
// check didn't find. The history is then not shown, rather than shown wrong.
export function historyMatchesToday(
  points: QuarterPoint[],
  daily: { date: string; close: number }[],
  todayShares: number,
): boolean {
  const last = points[points.length - 1];
  if (!last) return true;
  const price = closeOnOrBefore(daily, last.periodEnd);
  if (price == null) return true;
  const ratio = last.marketValue / (price * todayShares);
  return ratio > 0.67 && ratio < 1.5;
}

// —— Today's figures ——
export type TodayFigures = Multiples & {
  marketValue: number;
  // The quarter the trailing figures run to.
  through: Quarter;
  revenue: number | null;
  netIncome: number | null;
  fcf: number | null;
  buybacks: number | null;
  earningsYield: number | null;
  buybackYield: number | null;
  // Trailing-year revenue against the trailing year a year earlier.
  revenueGrowth: number | null;
};

export function todayFigures(input: { rows: FinancialRow[]; price: number; shares: number }): TodayFigures | null {
  const idx = new RowIndex(input.rows);
  const quarters = quarterList(input.rows);
  // The newest quarter with a full trailing year of revenue or, for a filer
  // without revenue tags, net income.
  const through = [...quarters]
    .reverse()
    .find((q) => trailingFour(idx, "revenue", q) != null || trailingFour(idx, "net_income", q) != null);
  if (!through) return null;

  const marketValue = input.price * input.shares;
  const revenue = trailingFour(idx, "revenue", through);
  const netIncome = trailingFour(idx, "net_income", through);
  const fcf = trailingFour(idx, "free_cash_flow", through);
  const buybacks = trailingFour(idx, "buybacks", through);
  const yearBefore = quarters.find((q) => q.fiscalYear === through.fiscalYear - 1 && q.fiscalPeriod === through.fiscalPeriod);
  const revenueBefore = yearBefore ? trailingFour(idx, "revenue", yearBefore) : null;
  return {
    revenueGrowth: revenue != null && revenueBefore != null && revenueBefore > 0 ? revenue / revenueBefore - 1 : null,
    marketValue,
    through,
    revenue,
    netIncome,
    fcf,
    buybacks,
    earningsYield: netIncome != null ? netIncome / marketValue : null,
    buybackYield: buybacks != null ? buybacks / marketValue : null,
    ...multiples({
      marketValue,
      netIncome,
      revenue,
      fcf,
      debt: balanceAt(idx, "total_debt", through),
      cash: balanceAt(idx, "cash_and_equivalents", through),
      equity: balanceAt(idx, "total_equity", through),
    }),
  };
}

// —— Today against the past ten years ——
export type RangeStats = {
  min: number;
  max: number;
  median: number;
  count: number;
  // Share of quarter-ends with a lower figure than today's, 0 to 1.
  belowToday: number | null;
};

// Three years of quarter-ends at least, or the range says too little.
export const MIN_POINTS = 12;

export function rangeStats(values: number[], today: number | null): RangeStats | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < MIN_POINTS) return null;
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return {
    min: v[0],
    max: v[v.length - 1],
    median,
    count: v.length,
    belowToday: today != null && Number.isFinite(today) ? v.filter((x) => x < today).length / v.length : null,
  };
}
