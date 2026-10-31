import { unstable_cache } from "next/cache";
import { fetchPrices, fetchIntradayPrices } from "@/lib/providers";
import { takeRecentSessions } from "@/lib/analysis/chartRanges";
import type { ChartPoint } from "@/lib/analysis/chartRanges";

// The ticker page's daily price line (the 1M and 1Y ranges) — expensive
// because it's backed by Twelve Data, whose free tier allows eight
// requests a minute across the whole site. fetchPrices itself is already
// wrapped in unstable_cache, but at a 5-minute TTL (LIVE_TTL_S in
// lib/providers.ts) — right for quotes, far too short for "one Twelve Data
// request per ticker per day." Wrapping *this* function in its own,
// separately-keyed unstable_cache with a 24-hour revalidate means Next's
// Data Cache only calls fetchPrices (and therefore only calls Twelve Data)
// once per symbol per day, regardless of how many times this page loads —
// daily closes don't change more often than that, so a day-old chart is
// correct, not a compromise.

// ~252 trading days is one year — fetchPrices returns roughly five years
// (outputsize=1300), so slice to the most recent year rather than pulling
// the multi-year history the ticker page doesn't show.
const ONE_YEAR_TRADING_DAYS = 252;

// —— The daily history behind the research page ——
// One compact copy of the ~5-year daily series, cached for a day: the chart's
// daily ranges, the header's 52-week range and the average-volume key stat all
// read from it, so a whole research page costs at most one Twelve Data request
// per company per day. Compact on purpose (no open price), so the cached entry
// stays well inside the data cache's ~2MB limit.
export type DailyBar = { date: string; close: number; high: number; low: number; volume: number };

async function getDailyHistoryRaw(symbol: string): Promise<DailyBar[]> {
  const rows = await fetchPrices(symbol);
  return rows.map((r) => ({ date: r.date, close: r.close, high: r.high, low: r.low, volume: r.volume }));
}

const cachedDailyHistory = unstable_cache(getDailyHistoryRaw, ["dailyHistory"], {
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

// The chart's daily line: the last year of closes.
export function toChartPoints(bars: DailyBar[]): ChartPoint[] {
  return bars.slice(-ONE_YEAR_TRADING_DAYS).map((b) => ({ date: b.date, close: b.close }));
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

// —— The 1D / 1W ranges ——
// The 1M and 1Y ranges are free: both are slices of the daily series above,
// which the ticker page already fetches once per symbol per day, so switching
// between them costs nothing. Intraday is the opposite — it is the one range
// that needs a request Twelve Data charges against the 8-req/min quota, and it
// cannot be cached for a day because the bars move all session.
//
// So it is never fetched during the page render. The page ships 1Y (and
// therefore 1M) with the HTML, and the browser asks for intraday only if a
// visitor actually clicks 1D or 1W — once, since one response covers both.
// A ticker nobody charts intraday costs exactly what it costs today.
const ONE_WEEK_SESSIONS = 5;

export async function getTickerIntraday(symbol: string): Promise<ChartPoint[] | null> {
  try {
    const rows = await fetchIntradayPrices(symbol);
    const points = takeRecentSessions(
      rows.map((r) => ({ date: r.date, close: r.close })),
      ONE_WEEK_SESSIONS,
    );
    return points.length >= 2 ? points : null;
  } catch {
    return null;
  }
}
