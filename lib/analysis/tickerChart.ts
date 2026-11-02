import { unstable_cache } from "next/cache";
import {
  fetchIntradayPrices,
  fetchLongDailyPrices,
  fetchMonthlyPrices,
  fetchQuoteSnapshot,
  NoTickerDataError,
  TwelveDataBusyError,
} from "@/lib/providers";
import { lookupCik } from "@/lib/sec/client";
import { intradayCacheBucket, takeRecentSessions, toWeekly } from "@/lib/analysis/chartRanges";
import type { ChartPoint } from "@/lib/analysis/chartRanges";

// The research page's price history. Everything here is about spending as few
// of Twelve Data's eight requests a minute as possible (phase nine, stage 3):
//
//   daily   ~20 years in one request, cached a day. Serves 1M, 3M, 1Y, 5Y and
//           10Y, the header's 52-week range and the average-volume stat.
//   intraday  5-minute bars for five sessions in one request, fetched only when
//           1D or 1W is clicked, cached per five minutes while the market is
//           open and per half-day while it's closed.
//   monthly the whole listed history in one request, fetched only when MAX is
//           clicked, cached a day.
//
// So a visitor who clicks every range on a company nobody has opened today
// costs three requests, and the next visitor costs none.

const ONE_YEAR_TRADING_DAYS = 252;
const TEN_YEARS_OF_WEEKS = 522;

// —— Daily history ——
// Compact on purpose (no open price): twenty years of daily bars cached as JSON
// is ~350KB, well inside the data cache's ~2MB limit.
export type DailyBar = { date: string; close: number; high: number; low: number; volume: number };

async function getDailyHistoryRaw(symbol: string): Promise<DailyBar[]> {
  const rows = await fetchLongDailyPrices(symbol);
  return rows.map((r) => ({ date: r.date, close: r.close, high: r.high, low: r.low, volume: r.volume }));
}

const cachedDailyHistory = unstable_cache(getDailyHistoryRaw, ["dailyHistory", "20y"], {
  revalidate: 60 * 60 * 24,
});

// Null on any failure — a rate-limited/down provider, or a symbol Twelve
// Data doesn't recognize even though Finnhub does. The chart is best-effort:
// if its data fails or is rate-limited, the page renders without it rather
// than throwing (error.tsx boundaries are unreliable in this Next.js setup).
// The page establishes that the ticker exists before this is called, so
// there's no need to distinguish failure reasons here.
export async function getDailyHistory(symbol: string): Promise<DailyBar[] | null> {
  try {
    const bars = await cachedDailyHistory(symbol.toUpperCase());
    return bars.length > 0 ? bars : null;
  } catch {
    return null;
  }
}

// What the page ships to the chart: the last year of daily closes (1M, 3M,
// 1Y) and up to ten years of weekly closes (5Y, 10Y). About 775 points in all.
export function chartSeries(bars: DailyBar[]): { daily: ChartPoint[]; weekly: ChartPoint[] } {
  const closes = bars.map((b) => ({ date: b.date, close: b.close }));
  return {
    daily: closes.slice(-ONE_YEAR_TRADING_DAYS),
    weekly: toWeekly(closes).slice(-TEN_YEARS_OF_WEEKS),
  };
}

// Highest high and lowest low over the last year of sessions, stretched to
// include today's price when it has moved past either end since the close.
export function range52Week(bars: DailyBar[], price: number | null): { low: number; high: number } | null {
  const year = bars.slice(-ONE_YEAR_TRADING_DAYS);
  if (year.length === 0) return null;
  let low = Math.min(...year.map((b) => b.low || b.close));
  let high = Math.max(...year.map((b) => b.high || b.close));
  if (price != null && price > 0) {
    low = Math.min(low, price);
    high = Math.max(high, price);
  }
  return { low, high };
}

// Average shares traded a day over the last three months (~63 sessions).
export function averageVolume(bars: DailyBar[], sessions = 63): number | null {
  const recent = bars.slice(-sessions).filter((b) => b.volume > 0);
  if (recent.length < 10) return null;
  return recent.reduce((sum, b) => sum + b.volume, 0) / recent.length;
}

// —— On-demand ranges: 1D/1W and MAX ——
// Both answer the browser with points, or with `busy` when Twelve Data's
// allowance is used up, so the chart can say "Updating, try again in a minute"
// instead of "unavailable".
export type OnDemandSeries = { points: ChartPoint[] | null; busy: boolean };

async function onDemand(load: () => Promise<ChartPoint[]>): Promise<OnDemandSeries> {
  try {
    const points = await load();
    return { points: points.length >= 2 ? points : null, busy: false };
  } catch (err) {
    if (err instanceof TwelveDataBusyError) return { points: null, busy: true };
    if (!(err instanceof NoTickerDataError)) console.error("[chart]", err instanceof Error ? err.message : err);
    return { points: null, busy: false };
  }
}

// Whether a symbol is worth one of Twelve Data's eight requests a minute: the
// same test the company page uses for existing at all, the SEC's ticker list
// or a price from Finnhub, both kept in caches. Without it, the chart's data
// routes spent a request on any string shaped like a ticker (found in the 2
// November review).
export async function isKnownSymbol(symbol: string): Promise<boolean> {
  const s = symbol.toUpperCase();
  if (await lookupCik(s)) return true;
  return (await fetchQuoteSnapshot(s)) != null;
}

const FIVE_SESSIONS = 5;

// The bucket is an argument only so it becomes part of the cache key: a new
// five-minute window while the market is open is a new entry, a closed market
// reuses one. Entries expire after a day so old windows don't pile up.
async function getIntradayRaw(_bucket: string, symbol: string): Promise<ChartPoint[]> {
  const rows = await fetchIntradayPrices(symbol);
  return takeRecentSessions(
    rows.map((r) => ({ date: r.date, close: r.close })),
    FIVE_SESSIONS,
  );
}

const cachedIntraday = unstable_cache(getIntradayRaw, ["intraday", "5min"], { revalidate: 60 * 60 * 24 });

export async function getTickerIntraday(symbol: string, now = new Date()): Promise<OnDemandSeries> {
  return onDemand(() => cachedIntraday(intradayCacheBucket(now), symbol.toUpperCase()));
}

async function getMonthlyRaw(symbol: string): Promise<ChartPoint[]> {
  const rows = await fetchMonthlyPrices(symbol);
  return rows.map((r) => ({ date: r.date, close: r.close }));
}

const cachedMonthly = unstable_cache(getMonthlyRaw, ["monthly"], { revalidate: 60 * 60 * 24 });

export async function getTickerMonthly(symbol: string): Promise<OnDemandSeries> {
  return onDemand(() => cachedMonthly(symbol.toUpperCase()));
}
