// Twelve Data / Finnhub fetch wrappers — server-side only. Ported from the
// original client-side fetchers in the-dispatch.html; same shapes, same
// fallback behavior, just running behind our own API key instead of one
// pasted into localStorage by each visitor. Price history and quotes fall
// back to Tiingo when Twelve Data is rate-limited or down (Twelve Data's
// free tier is 8 requests/minute — the tightest quota of any provider here).

import { unstable_cache } from "next/cache";

export type PriceRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type FundamentalsProfile = {
  name?: string;
  finnhubIndustry?: string;
  exchange?: string;
  marketCapitalization?: number;
};

export type FundamentalsMetrics = {
  revenueGrowthTTMYoy?: number;
  netProfitMarginTTM?: number;
  peBasicExclExtraTTM?: number;
  "totalDebt/totalEquityAnnual"?: number;
  "52WeekHigh"?: number;
  "52WeekLow"?: number;
  [key: string]: number | undefined;
};

export type RecommendationPeriod = {
  period: string;
  strongBuy?: number;
  buy?: number;
  hold?: number;
  sell?: number;
  strongSell?: number;
};

export type EarningsPeriod = {
  period: string;
  actual?: number;
  estimate?: number;
  surprisePercent?: number;
};

export type Fundamentals = {
  profile: FundamentalsProfile | null;
  metrics: FundamentalsMetrics | null;
  quote: unknown;
  reco: RecommendationPeriod[] | null;
  earnings: EarningsPeriod[] | null;
};

export type NewsItem = {
  datetime: number;
  source?: string;
  url: string;
  headline: string;
};

// Thrown when Twelve Data has confirmed there's no usable data for this
// symbol (an unrecognized ticker, or too little price history) — distinct
// from a plain Error, which means the request itself failed (rate limit,
// outage, network issue). Callers use this to tell "this ticker is wrong"
// apart from "the provider is temporarily unavailable, try again".
export class NoTickerDataError extends Error {}

// —— Caching ——
// Wrapped here (the provider-fetch layer) rather than at each call site, so
// every caller — the analyze API route, the SSR /research/[ticker] page,
// and the homepage ticker tape — shares one cache entry per symbol instead
// of each re-spending Twelve Data/Finnhub credits independently. Backed by
// Next's built-in Data Cache (`unstable_cache`), which — unlike a plain
// in-memory Map — Vercel backs with a store that survives across separate
// serverless invocations, not just within one warm instance.
//
// Each wrapped function's own arguments (symbol, asOf date) become part of
// the cache key automatically, so live vs. historical and different tickers
// never collide — see the `unstable_cache` docs on key derivation.
//
// Failures must never get cached (a rate-limit blip shouldn't poison a
// ticker for the whole TTL), so every function passed to unstable_cache
// throws on failure rather than resolving with a null/empty placeholder;
// the public exports below catch that and translate it back to the
// existing null-on-failure contract callers already expect.
const LIVE_TTL_S = 5 * 60; // live quotes/fundamentals/news — short, prices move
const HISTORICAL_TTL_S = false; // Time Machine news — a past date's news never changes

// —— Twelve Data: price history ——
// (The original also had a Stooq fallback for visitors without a Twelve Data
// key, routed through a CORS proxy since it ran in the browser. Stooq now
// serves a JS proof-of-work challenge instead of raw CSV to non-browser
// clients, so that path no longer returns usable data. Tiingo now fills
// that fallback role instead — see fetchPricesTiingo below.)
// GATED FEATURE (not yet gated): outputsize=1300 is a fixed ~5-year window
// for every viewer, matching the Reader tier's promise. The pricing page
// promises Subscribers 20 years — doing that properly means requesting a
// much larger outputsize (5000+ rows) for subscribers only, which isn't
// cleanly separable here yet: fetchPrices is cached per-symbol and shared
// across every viewer regardless of tier (see the caching comments above),
// so gating this means either a second, tier-specific cache entry per
// symbol or threading the viewer's subscriber status into this call and
// its cache key. Left undone rather than forced in — see also
// lib/analysis/loadReport.ts for where the trim-to-5-years step would go
// once fetchPrices can return the longer window.
async function fetchPricesTwelveData(symbol: string): Promise<PriceRow[]> {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("Twelve Data API key not configured.");
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=1300&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store" });
  // Twelve Data returns a real HTTP 404 for an unrecognized symbol, not a
  // 200 with an error body — confirmed empirically while testing the
  // Tiingo fallback (a 429 rate-limit response ALSO sets status:"error" in
  // its JSON body, so that field alone can't tell "bad ticker" apart from
  // "rate limited"; the HTTP status is what actually distinguishes them).
  // Checked before the generic !res.ok branch so a bad ticker correctly
  // short-circuits instead of wasting a Tiingo fallback call on it.
  if (res.status === 404) throw new NoTickerDataError("No data for this symbol.");
  if (!res.ok) throw new Error("Twelve Data HTTP " + res.status);
  const j = await res.json();
  if (j.status === "error" || !j.values) throw new NoTickerDataError(j.message || "No data for this symbol.");
  const rows: PriceRow[] = j.values
    .slice()
    .reverse()
    .map((v: Record<string, string>) => ({
      date: v.datetime,
      open: +v.open,
      high: +v.high,
      low: +v.low,
      close: +v.close,
      volume: +v.volume || 0,
    }))
    .filter((r: PriceRow) => !isNaN(r.close));
  if (rows.length < 10) throw new NoTickerDataError("Not enough price history for this symbol.");
  return rows;
}

// —— Tiingo: price history fallback ——
// Only reached when Twelve Data fails with something other than a confirmed
// "no data for this symbol" (see fetchPricesRaw below) — a rate limit,
// outage, or network error. Tiingo uses hyphens for share classes where
// Twelve Data uses dots (BRK.B -> BRK-B); normalize before requesting.
// startDate is bounded to ~5 years back to match the existing outputsize
// window and to keep payloads small (Tiingo's free tier caps at 1 GB/month
// of bandwidth — no reason to pull decades of history for a fallback path).
async function fetchPricesTiingo(symbol: string): Promise<PriceRow[]> {
  const key = process.env.TIINGO_API_KEY;
  if (!key) throw new Error("Tiingo API key not configured.");
  const tiingoSymbol = symbol.replace(/\./g, "-");
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 5);
  const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(tiingoSymbol)}/prices?startDate=${startDate.toISOString().slice(0, 10)}&token=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) throw new NoTickerDataError("No data for this symbol.");
  if (!res.ok) throw new Error("Tiingo HTTP " + res.status);
  const j = await res.json();
  if (!Array.isArray(j)) throw new NoTickerDataError("No data for this symbol.");
  const rows: PriceRow[] = j
    .map((v: { date: string; open: number; high: number; low: number; close: number; volume: number }) => ({
      // Raw (unadjusted) OHLCV, not adjClose/adjOpen/etc — matches what
      // Twelve Data returns, so the rest of the pipeline (which never
      // adjusts for splits/dividends either) stays consistent regardless
      // of which provider actually served a given request.
      date: String(v.date).slice(0, 10),
      open: v.open,
      high: v.high,
      low: v.low,
      close: v.close,
      volume: v.volume || 0,
    }))
    .filter((r) => !isNaN(r.close))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (rows.length < 10) throw new NoTickerDataError("Not enough price history for this symbol.");
  return rows;
}

async function fetchPricesRaw(symbol: string): Promise<PriceRow[]> {
  console.log(`[cache] MISS fetchPrices(${symbol}) — calling Twelve Data`);
  try {
    return await fetchPricesTwelveData(symbol);
  } catch (err) {
    // A confirmed bad ticker is a bad ticker on both providers — re-throw
    // without spending a Tiingo request on it. Only a genuine request
    // failure (rate limit, outage, network) falls through.
    if (err instanceof NoTickerDataError) throw err;
    console.log(`[fallback] Twelve Data failed for ${symbol}, trying Tiingo`);
    return await fetchPricesTiingo(symbol);
  }
}
export const fetchPrices = unstable_cache(fetchPricesRaw, ["fetchPrices"], {
  revalidate: LIVE_TTL_S,
});

// —— Twelve Data: single lightweight quote (used for trade execution and
// mark-to-market pricing, where a full 1300-row history is wasteful) ——
// Not wrapped here — it already has its own short-TTL cache in
// lib/portfolio.ts (getLatestPrice), deliberately separate and shorter
// since it backs live trade execution pricing.
async function fetchQuotePriceTwelveData(symbol: string): Promise<number> {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("Twelve Data API key not configured.");
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store" });
  // See the matching comment in fetchPricesTwelveData — confirmed the
  // /price endpoint has the same real-404-for-bad-symbol behavior.
  if (res.status === 404) throw new NoTickerDataError("No price data for this symbol.");
  if (!res.ok) throw new Error("Twelve Data HTTP " + res.status);
  const j = await res.json();
  const price = parseFloat(j.price);
  if (j.status === "error" || isNaN(price)) throw new NoTickerDataError(j.message || "No price data");
  return price;
}

// Tiingo fallback for the quote too. IMPORTANT: Tiingo's free tier is
// end-of-day only — this returns the previous close, not a live intraday
// price. That's an acceptable degradation for a fallback that only fires
// when Twelve Data is already down, but it's worth knowing this isn't a
// real-time quote if it's ever surfaced directly rather than just used for
// mark-to-market math.
async function fetchQuotePriceTiingo(symbol: string): Promise<number> {
  const key = process.env.TIINGO_API_KEY;
  if (!key) throw new Error("Tiingo API key not configured.");
  const tiingoSymbol = symbol.replace(/\./g, "-");
  const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(tiingoSymbol)}/prices?token=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) throw new NoTickerDataError("No price data for this symbol.");
  if (!res.ok) throw new Error("Tiingo HTTP " + res.status);
  const j = await res.json();
  const price = Array.isArray(j) && j.length > 0 ? j[0].close : NaN;
  if (isNaN(price)) throw new NoTickerDataError("No price data for this symbol.");
  return price;
}

export async function fetchQuotePrice(symbol: string): Promise<number> {
  try {
    return await fetchQuotePriceTwelveData(symbol);
  } catch (err) {
    if (err instanceof NoTickerDataError) throw err;
    console.log(`[fallback] Twelve Data failed for ${symbol}, trying Tiingo`);
    return await fetchQuotePriceTiingo(symbol);
  }
}

// —— Finnhub: fundamentals, consensus, news ——
async function fh<T = unknown>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const qs = new URLSearchParams({ ...params, token: key }).toString();
  const url = `https://finnhub.io/api/v1/${path}?${qs}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// fh() swallows per-endpoint failures to null so one flaky sub-request (of
// the five below) doesn't kill the whole fundamentals fetch — a ticker with
// no earnings history yet is a normal, cacheable result. But if *all five*
// come back null, that's not sparse data, that's Finnhub being down/rate-
// limited — throw so the cache layer doesn't store it as "no fundamentals".
async function fetchFundamentalsRaw(symbol: string): Promise<Fundamentals> {
  console.log(`[cache] MISS fetchFundamentals(${symbol}) — calling Finnhub`);
  const s = symbol.toUpperCase();
  const [profile, metricsRes, quote, reco, earnings] = await Promise.all([
    fh<FundamentalsProfile>("stock/profile2", { symbol: s }),
    fh<{ metric: FundamentalsMetrics }>("stock/metric", { symbol: s, metric: "all" }),
    fh("quote", { symbol: s }),
    fh<RecommendationPeriod[]>("stock/recommendation", { symbol: s }),
    fh<EarningsPeriod[]>("stock/earnings", { symbol: s }),
  ]);
  if (!profile && !metricsRes && !quote && !reco && !earnings) {
    throw new Error("Finnhub fundamentals request failed (all sub-requests errored)");
  }
  return {
    profile: profile ?? null,
    metrics: metricsRes?.metric ?? null,
    quote: quote ?? null,
    reco: reco ?? null,
    earnings: earnings ?? null,
  };
}
const cachedFetchFundamentals = unstable_cache(fetchFundamentalsRaw, ["fetchFundamentals"], {
  revalidate: LIVE_TTL_S,
});
export async function fetchFundamentals(symbol: string): Promise<Fundamentals | null> {
  if (!process.env.FINNHUB_API_KEY) return null;
  try {
    return await cachedFetchFundamentals(symbol);
  } catch {
    return null;
  }
}

// Finnhub's free-tier company-news feed is sorted newest-first and mixes in
// loosely-related market listicles alongside real company news — the first
// few items are sometimes all noise, so this returns a much larger pool for
// buildReport's relevance filter to pick the top 6 *relevant* ones from,
// rather than truncating here and risking the filter zeroing out the batch.
async function fetchNewsRaw(symbol: string): Promise<NewsItem[]> {
  console.log(`[cache] MISS fetchNews(${symbol}) — calling Finnhub`);
  const now = new Date();
  const past = new Date(now.getTime() - 30 * 864e5);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const news = await fh<NewsItem[]>("company-news", {
    symbol: symbol.toUpperCase(),
    from: fmt(past),
    to: fmt(now),
  });
  if (!Array.isArray(news)) throw new Error("Finnhub company-news request failed");
  return news.slice(0, 60);
}
const cachedFetchNews = unstable_cache(fetchNewsRaw, ["fetchNews"], { revalidate: LIVE_TTL_S });
export async function fetchNews(symbol: string): Promise<NewsItem[] | null> {
  if (!process.env.FINNHUB_API_KEY) return null;
  try {
    return await cachedFetchNews(symbol);
  } catch {
    return null;
  }
}

// News within ±14 days of a historical date — used by the Time Machine
// view, where "last 30 days" (fetchNews above) wouldn't be relevant.
async function fetchNewsAsOfRaw(symbol: string, asOfDate: string): Promise<NewsItem[]> {
  console.log(`[cache] MISS fetchNewsAsOf(${symbol}, ${asOfDate}) — calling Finnhub`);
  const d = new Date(asOfDate + "T00:00:00");
  const from = new Date(d.getTime() - 14 * 864e5);
  const to = new Date(d.getTime() + 1 * 864e5);
  const fmt = (dd: Date) => dd.toISOString().slice(0, 10);
  const news = await fh<NewsItem[]>("company-news", {
    symbol: symbol.toUpperCase(),
    from: fmt(from),
    to: fmt(to),
  });
  if (!Array.isArray(news)) throw new Error("Finnhub company-news (historical) request failed");
  return news.slice(0, 60);
}
const cachedFetchNewsAsOf = unstable_cache(fetchNewsAsOfRaw, ["fetchNewsAsOf"], {
  revalidate: HISTORICAL_TTL_S,
});
export async function fetchNewsAsOf(symbol: string, asOfDate: string): Promise<NewsItem[] | null> {
  if (!process.env.FINNHUB_API_KEY) return null;
  try {
    return await cachedFetchNewsAsOf(symbol, asOfDate);
  } catch {
    return null;
  }
}

// As-reported quarterly filings — used by the Time Machine's "how the
// business changed" figures (lib/analysis/fundamentalsChange.ts). Distinct
// from stock/metric above: that endpoint only ever returns today's
// pre-computed ratios, while this returns each actual filed quarterly report
// (with its own filedDate/endDate and raw income-statement line items), which
// is what makes a genuine then-vs-now comparison possible. One fetch returns
// every filing on record, so it's cached per-symbol same as everything else.
export type FinancialsReportedLineItem = {
  concept: string;
  label?: string;
  value: number;
  unit?: string;
};
export type FinancialsReportedFiling = {
  filedDate: string;
  endDate: string;
  form?: string;
  report: {
    ic?: FinancialsReportedLineItem[];
    bs?: FinancialsReportedLineItem[];
    cf?: FinancialsReportedLineItem[];
  };
};
async function fetchFinancialsReportedRaw(symbol: string): Promise<FinancialsReportedFiling[]> {
  console.log(`[cache] MISS fetchFinancialsReported(${symbol}) — calling Finnhub`);
  const res = await fh<{ data: FinancialsReportedFiling[] }>("stock/financials-reported", {
    symbol: symbol.toUpperCase(),
    freq: "quarterly",
  });
  if (!res || !Array.isArray(res.data)) throw new Error("Finnhub financials-reported request failed");
  return res.data;
}
const cachedFetchFinancialsReported = unstable_cache(fetchFinancialsReportedRaw, ["fetchFinancialsReported"], {
  revalidate: LIVE_TTL_S,
});
export async function fetchFinancialsReported(symbol: string): Promise<FinancialsReportedFiling[] | null> {
  if (!process.env.FINNHUB_API_KEY) return null;
  try {
    return await cachedFetchFinancialsReported(symbol);
  } catch {
    return null;
  }
}
