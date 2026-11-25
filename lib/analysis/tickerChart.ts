import { unstable_cache } from "next/cache";
import {
  fetchIntradayPrices,
  fetchLongDailyPrices,
  fetchMonthlyPrices,
  fetchQuoteSnapshot,
  NoTickerDataError,
  TwelveDataBusyError,
  TwelveDataOutError,
} from "@/lib/providers";
import { latestSession, previousSession } from "@/lib/analysis/sessions";
import { lookupCik } from "@/lib/sec/client";
import { intradayCacheBucket, takeRecentSessions, toWeekly } from "@/lib/analysis/chartRanges";
import type { ChartPoint } from "@/lib/analysis/chartRanges";

// The research page's price history. Everything here is about spending as few
// of Twelve Data's eight requests a minute as possible (phase nine, stage 3):
//
//   daily   ~20 years in one request, cached per trading session. Serves 1M,
//           3M, 1Y, 5Y and 10Y, the header's 52-week range and the
//           average-volume stat. Never fetched for crawlers.
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

// —— One fetch per company per trading session (fix/price-credits) ——
// Daily prices only change when a session ends, so they're cached per
// session, not per day: the cache key carries the latest finished session
// (lib/analysis/sessions.ts, 5 pm New York time on trading days), and a
// company's prices are fetched at most once for each. Friday evening's copy
// serves the whole weekend and Monday until 5 pm.
//
// Only finished sessions are kept: a fetch during trading hours also returns
// today's bar so far, which is dropped, so the chart's last daily close is
// always a real close. The page header's price is the live one (Finnhub).
//
// Entries are kept two weeks, so when a fetch fails (Twelve Data out of
// credits, Tiingo too) the last copy stored is still there to show, labelled
// with its date. Looking for it never fetches: asking for any session but the
// latest throws before reaching a provider.
class NotLatestSession extends Error {}

async function getDailyHistoryRaw(session: string, symbol: string): Promise<DailyBar[]> {
  if (session !== latestSession(new Date())) throw new NotLatestSession(`${session} is not the latest session`);
  const rows = await fetchLongDailyPrices(symbol);
  return rows
    .filter((r) => r.date.slice(0, 10) <= session)
    .map((r) => ({ date: r.date, close: r.close, high: r.high, low: r.low, volume: r.volume }));
}

const cachedDailyHistory = unstable_cache(getDailyHistoryRaw, ["dailyHistory", "20y", "per-session"], {
  revalidate: 60 * 60 * 24 * 14,
});

// How far back to look for a stored copy when the latest can't be fetched.
const LAST_KNOWN_SESSIONS = 10;

export type DailyHistory = {
  bars: DailyBar[];
  // The last session in `bars`.
  through: string;
  // False when these are the last prices stored, shown because newer ones
  // couldn't be fetched. The page then says so next to the chart.
  current: boolean;
};

type Lookup = (session: string, symbol: string) => Promise<DailyBar[]>;

// The latest session's prices, or the newest stored copy from the ten
// sessions before it, or null. Never throws. Exported with its lookup as an
// argument for the tests.
export async function dailyHistoryFrom(lookup: Lookup, symbol: string, now: Date): Promise<DailyHistory | null> {
  const latest = latestSession(now);
  try {
    const bars = await lookup(latest, symbol);
    if (bars.length > 0) return { bars, through: bars[bars.length - 1].date, current: true };
  } catch (err) {
    if (!(err instanceof NoTickerDataError)) {
      console.warn(`[chart] ${symbol}: latest prices unavailable (${err instanceof Error ? err.message : err}); looking for the last stored`);
    }
  }
  const earlier: string[] = [];
  for (let s = latest; earlier.length < LAST_KNOWN_SESSIONS; ) earlier.push((s = previousSession(s)));
  const found = await Promise.all(earlier.map((s) => lookup(s, symbol).catch(() => null)));
  const bars = found.find((b) => b && b.length > 0);
  return bars ? { bars, through: bars[bars.length - 1].date, current: false } : null;
}

// Null when there's nothing to show: a symbol Twelve Data doesn't know even
// though Finnhub does, or no prices fetched for it in two weeks and none to be
// had now. The chart is best-effort: the page renders without it rather than
// throwing (error.tsx boundaries are unreliable in this Next.js setup).
export async function getDailyHistory(symbol: string, now = new Date()): Promise<DailyHistory | null> {
  return dailyHistoryFrom(cachedDailyHistory, symbol.toUpperCase(), now);
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
// minute is used up, so the chart can say "Updating, try again in a minute"
// instead of "unavailable", or with `out` when it isn't being asked today
// (lib/prices/budget.ts).
export type OnDemandSeries = { points: ChartPoint[] | null; busy: boolean; out?: boolean };

async function onDemand(load: () => Promise<ChartPoint[]>): Promise<OnDemandSeries> {
  try {
    const points = await load();
    return { points: points.length >= 2 ? points : null, busy: false };
  } catch (err) {
    if (err instanceof TwelveDataBusyError) return { points: null, busy: true };
    if (err instanceof TwelveDataOutError) return { points: null, busy: false, out: true };
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
