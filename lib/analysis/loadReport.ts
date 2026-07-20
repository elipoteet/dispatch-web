// Shared by the client-side analyze API route and the server-rendered
// /research/[ticker] page, so both fetch/cache/error-handle identically
// instead of the SSR path silently drifting from the API's behavior.

import { withCache } from "@/lib/cache";
import { fetchFundamentals, fetchNews, fetchNewsAsOf, fetchPrices } from "@/lib/providers";
import type { Fundamentals, NewsItem, PriceRow } from "@/lib/providers";
import { buildHistoricalFundamentals, sliceRowsAsOf } from "@/lib/analysis/historical";
import { buildReport, type ReportData } from "@/lib/analysis/report";

const CACHE_TTL_MS = 5 * 60 * 1000;

export const TICKER_PATTERN = /^[A-Z.\-]{1,10}$/;

export class TickerDataError extends Error {}

export async function loadTickerData(
  ticker: string,
  asOf: string | null,
): Promise<{ rows: PriceRow[]; fundamentals: Fundamentals | null; news: NewsItem[] | null }> {
  const { rows, fundamentals } = await withCache(`analyze:${ticker}`, CACHE_TTL_MS, async () => {
    const [rows, fundamentals] = await Promise.all([
      fetchPrices(ticker),
      fetchFundamentals(ticker).catch(() => null),
    ]);
    return { rows, fundamentals };
  });

  const news = asOf
    ? await withCache(`analyze:news:${ticker}:${asOf}`, CACHE_TTL_MS, () =>
        fetchNewsAsOf(ticker, asOf).catch(() => null),
      )
    : await withCache(`analyze:news:${ticker}:live`, CACHE_TTL_MS, () => fetchNews(ticker).catch(() => null));

  return { rows, fundamentals, news };
}

// Fetches + builds a full ReportData server-side, applying the same asOf
// slicing/fundamentals-rollback the client does for Time Machine views.
// Throws TickerDataError on any failure — callers decide what that means
// (404 for the SSR page, a JSON error for the API route).
export async function loadReport(ticker: string, asOf: string | null): Promise<{ report: ReportData; rows: PriceRow[] }> {
  const { rows, fundamentals, news } = await loadTickerData(ticker, asOf);

  if (asOf) {
    const sliced = sliceRowsAsOf(rows, asOf);
    if (sliced.length < 30) {
      throw new TickerDataError(`Not enough price history before ${asOf} for ${ticker}. Try a more recent date.`);
    }
    const histFund = buildHistoricalFundamentals(fundamentals, asOf);
    return { report: buildReport(ticker, sliced, histFund, news), rows };
  }
  return { report: buildReport(ticker, rows, fundamentals, news), rows };
}
