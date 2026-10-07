import { unstable_cache } from "next/cache";
import { fetchPrices, fetchIntradayPrices } from "@/lib/providers";
import { takeRecentSessions } from "@/lib/analysis/chartRanges";
import type { ChartPoint } from "@/lib/analysis/chartRanges";

// The ticker page's one-year price line (docs/phase-five.md section A) —
// the only genuinely expensive part of that page, since it's the only
// piece backed by Twelve Data rather than the free Finnhub fundamentals
// already fetched by getTickerSnapshot. fetchPrices itself is already
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

async function getTickerChartRaw(symbol: string): Promise<ChartPoint[]> {
  const rows = await fetchPrices(symbol);
  return rows.slice(-ONE_YEAR_TRADING_DAYS).map((r) => ({ date: r.date, close: r.close }));
}

const cachedGetTickerChart = unstable_cache(getTickerChartRaw, ["tickerChart"], {
  revalidate: 60 * 60 * 24,
});

// Null on any failure — a rate-limited/down provider, or a symbol Twelve
// Data doesn't recognize even though Finnhub does. Per docs/phase-five.md:
// "If the chart data fails or is rate-limited, render the page without the
// chart — stats and posts still work. Do not throw." Ticker existence
// itself is already established by getTickerSnapshot before this is ever
// called, so there's no need to distinguish failure reasons here.
export async function getTickerChart(symbol: string): Promise<ChartPoint[] | null> {
  try {
    const points = await cachedGetTickerChart(symbol);
    return points.length > 0 ? points : null;
  } catch {
    return null;
  }
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
