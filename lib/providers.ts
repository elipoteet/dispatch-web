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

// —— Twelve Data's eight requests a minute (phase nine, stage 3) ——
// Every Twelve Data request goes through twelveDataSeries, which counts them.
// The free plan allows 8 a minute for the whole site; past that it answers
// 429. Two guards:
//   - a count per calendar minute, stopping at 7 so one is always left for a
//     visitor whose request is already in flight on another instance;
//   - a 429 from Twelve Data itself, which stops every further request from
//     this instance until the minute turns.
// Either way the caller gets a TwelveDataBusyError: daily history falls back
// to Tiingo, and the chart's on-demand ranges show "Updating, try again in a
// minute". Never an error page (gotcha 1).
//
// The count is per server instance, so with several instances running at once
// it can't see the others. Twelve Data's own 429 is the backstop for that.
//
// TWELVE_DATA_FORCE_BUSY=1 makes every request behave as if the allowance were
// used up, so the fallbacks can be checked without spending it.
export class TwelveDataBusyError extends Error {}

const TWELVE_DATA_PER_MINUTE = 7;
let tdMinute = -1;
let tdUsed = 0;
let tdBlockedMinute = -1;

function twelveDataBusy(message: string): TwelveDataBusyError {
  return new TwelveDataBusyError(`Twelve Data busy: ${message}`);
}

export type TwelveDataValue = Record<string, string>;

async function twelveDataSeries(params: Record<string, string>): Promise<TwelveDataValue[]> {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("Twelve Data API key not configured.");
  if (process.env.TWELVE_DATA_FORCE_BUSY === "1") throw twelveDataBusy("forced by TWELVE_DATA_FORCE_BUSY");

  const minute = Math.floor(Date.now() / 60_000);
  if (minute === tdBlockedMinute) throw twelveDataBusy("Twelve Data said 429 earlier this minute");
  if (minute !== tdMinute) {
    tdMinute = minute;
    tdUsed = 0;
  }
  if (tdUsed >= TWELVE_DATA_PER_MINUTE) throw twelveDataBusy(`${tdUsed} requests already this minute`);
  tdUsed++;

  const qs = new URLSearchParams({ ...params, apikey: key }).toString();
  const res = await fetch(`https://api.twelvedata.com/time_series?${qs}`, { cache: "no-store" });
  // Twelve Data returns a real HTTP 404 for an unrecognized symbol, not a
  // 200 with an error body — confirmed empirically while testing the
  // Tiingo fallback (a 429 rate-limit response ALSO sets status:"error" in
  // its JSON body, so that field alone can't tell "bad ticker" apart from
  // "rate limited"; the HTTP status is what actually distinguishes them).
  // Checked before the generic !res.ok branch so a bad ticker correctly
  // short-circuits instead of wasting a Tiingo fallback call on it.
  if (res.status === 404) throw new NoTickerDataError("No data for this symbol.");
  if (res.status === 429) {
    tdBlockedMinute = minute;
    throw twelveDataBusy("HTTP 429");
  }
  if (!res.ok) throw new Error("Twelve Data HTTP " + res.status);
  const j = await res.json();
  // Belt and braces: a rate-limit message in a 200 body is a busy signal, not
  // "this symbol has no data", which would 404 a real company's page.
  if (j.code === 429) {
    tdBlockedMinute = minute;
    throw twelveDataBusy("429 in the response body");
  }
  if (j.status === "error" || !j.values) throw new NoTickerDataError(j.message || "No data for this symbol.");
  return j.values as TwelveDataValue[];
}

function rowsFromTwelveData(values: TwelveDataValue[]): PriceRow[] {
  return values
    .slice()
    .reverse()
    .map((v) => ({
      date: v.datetime,
      open: +v.open,
      high: +v.high,
      low: +v.low,
      close: +v.close,
      volume: +v.volume || 0,
    }))
    .filter((r) => !isNaN(r.close));
}

// —— Twelve Data: price history ——
// (The original also had a Stooq fallback for visitors without a Twelve Data
// key, routed through a CORS proxy since it ran in the browser. Stooq now
// serves a JS proof-of-work challenge instead of raw CSV to non-browser
// clients, so that path no longer returns usable data. Tiingo now fills
// that fallback role instead — see fetchPricesTiingo below.)
// outputsize=1300 is a ~5-year window, used by the alerts cron's indicators.
// The research pages ask for 5000 (~20 years) through fetchLongDailyPrices.
async function fetchPricesTwelveData(symbol: string, outputsize = 1300): Promise<PriceRow[]> {
  const rows = rowsFromTwelveData(
    await twelveDataSeries({ symbol, interval: "1day", outputsize: String(outputsize) }),
  );
  if (rows.length < 10) throw new NoTickerDataError("Not enough price history for this symbol.");
  return rows;
}

// —— Tiingo: price history fallback ——
// Only reached when Twelve Data fails with something other than a confirmed
// "no data for this symbol" (see fetchPricesRaw below) — a rate limit,
// outage, or network error. Tiingo uses hyphens for share classes where
// Twelve Data uses dots (BRK.B -> BRK-B); normalize before requesting.
// startDate matches the Twelve Data window it stands in for: ~5 years for the
// alerts cron, ~20 for the research pages' history (fetched at most once per
// company per day, and only when Twelve Data has failed — Tiingo's free tier
// caps bandwidth at 1 GB/month).
async function fetchPricesTiingo(symbol: string, years = 5): Promise<PriceRow[]> {
  const key = process.env.TIINGO_API_KEY;
  if (!key) throw new Error("Tiingo API key not configured.");
  const tiingoSymbol = symbol.replace(/\./g, "-");
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - years);
  const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(tiingoSymbol)}/prices?startDate=${startDate.toISOString().slice(0, 10)}&token=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) throw new NoTickerDataError("No data for this symbol.");
  if (!res.ok) throw new Error("Tiingo HTTP " + res.status);
  const j = await res.json();
  if (!Array.isArray(j)) throw new NoTickerDataError("No data for this symbol.");
  const rows = j
    .map((v: { date: string; open: number; high: number; low: number; close: number; volume: number; splitFactor?: number }) => ({
      date: String(v.date).slice(0, 10),
      open: v.open,
      high: v.high,
      low: v.low,
      close: v.close,
      volume: v.volume || 0,
      splitFactor: v.splitFactor ?? 1,
    }))
    .filter((r: { close: number }) => !isNaN(r.close))
    .sort((a: { date: string }, b: { date: string }) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (rows.length < 10) throw new NoTickerDataError("Not enough price history for this symbol.");
  return splitAdjust(rows);
}

// Tiingo's open/high/low/close are raw, but Twelve Data's are adjusted for
// stock splits (not dividends) — checked November 2026 on NVIDIA's 10-for-1
// split: Twelve Data gives $120.89 for 7 June 2024, Tiingo $1,208.88 with a
// splitFactor of 10 on 10 June. This file used to say the two matched; they
// didn't, so a day served by the fallback drew a fake 90% crash at every
// split. Prices before each split are divided by every split since (and
// volume multiplied), which is exactly Twelve Data's convention.
export function splitAdjust(rows: (PriceRow & { splitFactor: number })[]): PriceRow[] {
  let factor = 1;
  const out: PriceRow[] = new Array(rows.length);
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    out[i] = {
      date: r.date,
      open: r.open / factor,
      high: r.high / factor,
      low: r.low / factor,
      close: r.close / factor,
      volume: r.volume * factor,
    };
    // A split takes effect at the open of its own day, so it applies to every
    // day before it.
    if (r.splitFactor && r.splitFactor !== 1) factor *= r.splitFactor;
  }
  return out;
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

// —— The research pages' daily history: ~20 years in one request ——
// Twelve Data's outputsize tops out at 5000 rows, about twenty years of
// sessions (NVIDIA back to December 2006, checked November 2026). One request
// per company per day then serves every daily range on the chart (1M, 3M, 1Y,
// 5Y, 10Y), the 52-week range and the average volume. The stage 3 budget
// allowed a second daily request for 10Y; this does without it.
// Not cached here: lib/analysis/tickerChart.ts caches a compact copy for a day.
export async function fetchLongDailyPrices(symbol: string): Promise<PriceRow[]> {
  console.log(`[cache] MISS fetchLongDailyPrices(${symbol}) — calling Twelve Data`);
  try {
    return await fetchPricesTwelveData(symbol, 5000);
  } catch (err) {
    if (err instanceof NoTickerDataError) throw err;
    console.log(`[fallback] Twelve Data failed for ${symbol} (${err instanceof Error ? err.message : err}), trying Tiingo`);
    return await fetchPricesTiingo(symbol, 20);
  }
}

// —— MAX: monthly closes for the whole listed history ——
// One small request (Coca-Cola's monthly series runs back to 1970 in 79KB),
// made only when a visitor clicks MAX. Cached for a day by the caller. No
// fallback: busy means the chart says "Updating, try again in a minute".
export async function fetchMonthlyPrices(symbol: string): Promise<PriceRow[]> {
  console.log(`[cache] MISS fetchMonthlyPrices(${symbol}) — calling Twelve Data`);
  const rows = rowsFromTwelveData(await twelveDataSeries({ symbol, interval: "1month", outputsize: "5000" }));
  if (rows.length < 2) throw new NoTickerDataError("Not enough monthly history for this symbol.");
  return rows;
}

// —— Unadjusted daily closes, for finding stock splits (phase nine, stage 4) ——
// Twelve Data's and Finnhub's split lists are paid (both answer 403 on the free
// plans), but Twelve Data's adjust=none is free and returns the prices as they
// traded: NVIDIA $1,208.88 on 7 June 2024 and $121.79 on 10 June, against
// $120.89 and $121.79 adjusted (checked November 2026). Dividing one series
// by the other gives the split factor on every date; lib/research/splits.ts
// does that. 3000 sessions is about twelve years, enough for ten years of
// valuation history. Only requested for companies whose share counts jumped
// (see needsSplitCheck), through the same eight-a-minute gate as everything
// else. Not cached here; the caller caches it for a day.
export async function fetchUnadjustedDailyCloses(symbol: string): Promise<{ date: string; close: number }[]> {
  console.log(`[cache] MISS fetchUnadjustedDailyCloses(${symbol}) — calling Twelve Data`);
  const rows = rowsFromTwelveData(
    await twelveDataSeries({ symbol, interval: "1day", outputsize: "3000", adjust: "none" }),
  );
  if (rows.length < 10) throw new NoTickerDataError("Not enough unadjusted history for this symbol.");
  return rows.map((r) => ({ date: r.date, close: r.close }));
}

// —— Twelve Data: intraday price history (the ticker page's 1D and 1W ranges) ——
// Twelve Data is the only provider configured here that serves intraday bars
// for the session in progress. Polygon's free tier has the data but refuses
// the current day outright ("NOT_AUTHORIZED: Your plan doesn't include this
// data timeframe" — verified empirically, October 2026), and Tiingo's free
// tier is end-of-day only, so neither can back a 1D chart and there is no
// fallback for this path.
//
// 5-minute bars at outputsize=400 is one request covering five full
// regular-hours sessions (78 bars each, 09:30–15:55 bar starts, no extended
// hours — checked November 2026) — so a single call serves both the 1D range
// (the newest session, in 5-minute steps) and the 1W range (the newest five),
// rather than one request per range. Deliberate, given the 8-a-minute ceiling.
// Not cached here: lib/analysis/tickerChart.ts caches it per five-minute
// window while the market is open, and once per closed period otherwise.
export async function fetchIntradayPrices(symbol: string): Promise<PriceRow[]> {
  console.log(`[cache] MISS fetchIntradayPrices(${symbol}) — calling Twelve Data`);
  // Rows keep Twelve Data's full "YYYY-MM-DD HH:MM:SS" timestamp, unlike the
  // date-only daily rows — callers split on the space to group by session.
  const rows = rowsFromTwelveData(await twelveDataSeries({ symbol, interval: "5min", outputsize: "400" }));
  if (rows.length < 2) throw new NoTickerDataError("Not enough intraday history for this symbol.");
  return rows;
}

// Tiingo fallback for the live quote. IMPORTANT: Tiingo's free tier is
// end-of-day only — this returns the previous close, not a live intraday
// price. That's an acceptable degradation for a fallback that only fires
// when Finnhub is already down, but it's worth knowing this isn't a
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

// Single lightweight quote for trade execution and mark-to-market pricing
// (used for every held position, on every portfolio page load — see
// lib/portfolio.ts's getLatestPrice). Deliberately Finnhub, not
// Twelve Data: this fires far more often than a ticker search does, and
// sharing Twelve Data's tight 8-req/min quota with it caused real,
// intermittent ticker-search failures (the tape had the same problem —
// see fetchFinnhubDayChange above). Falls back to Tiingo (end-of-day) if
// Finnhub is down, never to Twelve Data, so this path can never compete
// for that quota. Not wrapped in unstable_cache here — getLatestPrice
// already has its own short-TTL cache, deliberately separate and shorter
// since it backs live trade execution pricing.
export async function fetchLatestQuote(symbol: string): Promise<number> {
  const finnhub = await fetchFinnhubQuote(symbol);
  if (finnhub != null) return finnhub;
  console.log(`[fallback] Finnhub quote failed for ${symbol}, trying Tiingo`);
  return await fetchQuotePriceTiingo(symbol);
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

// —— Finnhub: lightweight quote. Backs fetchLatestQuote above (portfolio
// trade execution and mark-to-market). It was first written for the Monthly
// Leaderboard's daily scoring cron, removed on 30 October 2026. Not run
// through unstable_cache like the rest of this file: getLatestPrice already
// has its own short-TTL cache, so a second layer here would be redundant.
// Empirically confirmed (real throttled test, July 2026) that Finnhub's free
// tier allows 60 requests/minute via the x-ratelimit-* response headers, then
// hard-fails with 429 and remaining=0 for the rest of that rolling window.
export async function fetchFinnhubQuote(symbol: string): Promise<number | null> {
  const data = await fh<{ c: number }>("quote", { symbol: symbol.toUpperCase() });
  if (!data || typeof data.c !== "number" || data.c <= 0) return null;
  return data.c;
}

// —— Finnhub: the research page header (phase nine, stage 2) ——
// Price, day change and company profile for /research/[ticker]. Finnhub, not
// Twelve Data, for the same reason as fetchLatestQuote: a header loads on every
// visit, and Twelve Data's 8-per-minute allowance is kept for price history.

export type QuoteSnapshot = {
  price: number;
  change: number;
  changePct: number;
  previousClose: number;
  // Unix seconds of the last trade Finnhub saw.
  asOf: number;
};

async function fetchQuoteSnapshotRaw(symbol: string): Promise<QuoteSnapshot | null> {
  const data = await fh<{ c: number; d: number | null; dp: number | null; pc: number; t: number }>("quote", {
    symbol: symbol.toUpperCase(),
  });
  // No answer at all is a failed request: throw, so the cache keeps nothing and
  // the next visit asks again. Zeros are Finnhub's answer for an unknown
  // symbol, which is worth remembering.
  if (!data) throw new Error("Finnhub quote request failed");
  if (typeof data.c !== "number" || data.c <= 0) return null;
  const previousClose = typeof data.pc === "number" && data.pc > 0 ? data.pc : data.c;
  return {
    price: data.c,
    change: data.d ?? data.c - previousClose,
    changePct: data.dp ?? ((data.c - previousClose) / previousClose) * 100,
    previousClose,
    asOf: data.t,
  };
}

// One minute: fresh enough for a page header, and it keeps a busy ticker page
// at one Finnhub call a minute however many people have it open.
const cachedQuoteSnapshot = unstable_cache(fetchQuoteSnapshotRaw, ["quoteSnapshot"], { revalidate: 60 });

export async function fetchQuoteSnapshot(symbol: string): Promise<QuoteSnapshot | null> {
  if (!process.env.FINNHUB_API_KEY) return null;
  try {
    return await cachedQuoteSnapshot(symbol.toUpperCase());
  } catch {
    return null;
  }
}

export type CompanyProfile = {
  name: string | null;
  exchange: string | null;
  industry: string | null;
  // Finnhub reports both in millions.
  marketCapMillions: number | null;
  sharesOutstandingMillions: number | null;
};

async function fetchCompanyProfileRaw(symbol: string): Promise<CompanyProfile | null> {
  const data = await fh<{
    name?: string;
    exchange?: string;
    finnhubIndustry?: string;
    marketCapitalization?: number;
    shareOutstanding?: number;
  }>("stock/profile2", { symbol: symbol.toUpperCase() });
  // A failed request throws so a day-long cache never remembers an outage as
  // "no profile". An empty object is Finnhub's real answer for a symbol it has
  // no profile for (ETFs among them), and that is worth caching.
  if (!data) throw new Error("Finnhub profile request failed");
  if (!data.name) return null;
  return {
    name: data.name ?? null,
    exchange: data.exchange ?? null,
    industry: data.finnhubIndustry || null,
    marketCapMillions: typeof data.marketCapitalization === "number" ? data.marketCapitalization : null,
    sharesOutstandingMillions: typeof data.shareOutstanding === "number" ? data.shareOutstanding : null,
  };
}

const cachedCompanyProfile = unstable_cache(fetchCompanyProfileRaw, ["companyProfile"], {
  revalidate: 60 * 60 * 24,
});

export async function fetchCompanyProfile(symbol: string): Promise<CompanyProfile | null> {
  if (!process.env.FINNHUB_API_KEY) return null;
  try {
    return await cachedCompanyProfile(symbol.toUpperCase());
  } catch {
    return null;
  }
}

// —— Finnhub: the next earnings date ——
// Finnhub's free calendar lists upcoming reports only: asked for NVIDIA's
// reports from 2016 to now it returned none, and for the months ahead it
// returned the next two (checked November 2026). So past earnings dates come
// from the company's own SEC filings (lib/sec/client.ts, earningsReleaseDates)
// and only the next one comes from here.
export type NextEarnings = {
  date: string;
  // bmo: before the market opens; amc: after it closes; dmh: during hours.
  hour: "bmo" | "amc" | "dmh" | null;
};

async function fetchNextEarningsRaw(symbol: string): Promise<NextEarnings | null> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 150 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const data = await fh<{ earningsCalendar?: { date: string; hour?: string }[] }>("calendar/earnings", {
    symbol: symbol.toUpperCase(),
    from: today,
    to: horizon,
  });
  if (!data) throw new Error("Finnhub earnings calendar request failed");
  const next = (data.earningsCalendar ?? [])
    .filter((r) => typeof r.date === "string" && r.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (!next) return null;
  const hour = next.hour === "bmo" || next.hour === "amc" || next.hour === "dmh" ? next.hour : null;
  return { date: next.date, hour };
}

const cachedNextEarnings = unstable_cache(fetchNextEarningsRaw, ["nextEarnings"], { revalidate: 60 * 60 * 12 });

export async function fetchNextEarnings(symbol: string): Promise<NextEarnings | null> {
  if (!process.env.FINNHUB_API_KEY) return null;
  try {
    return await cachedNextEarnings(symbol.toUpperCase());
  } catch {
    return null;
  }
}

// —— Finnhub: a company's peers (phase nine, stage 4) ——
// Free, and a list of tickers in the same industry, the company itself first.
// Cached a day: peer groups don't change from one hour to the next.
async function fetchPeersRaw(symbol: string): Promise<string[]> {
  const data = await fh<string[]>("stock/peers", { symbol: symbol.toUpperCase() });
  if (!Array.isArray(data)) throw new Error("Finnhub peers request failed");
  return data.filter((s): s is string => typeof s === "string").map((s) => s.toUpperCase());
}

const cachedPeers = unstable_cache(fetchPeersRaw, ["peers"], { revalidate: 60 * 60 * 24 });

export async function fetchPeers(symbol: string): Promise<string[] | null> {
  if (!process.env.FINNHUB_API_KEY) return null;
  try {
    return await cachedPeers(symbol.toUpperCase());
  } catch {
    return null;
  }
}

// Day-over-day change for the homepage ticker tape (app/api/tape/route.ts)
// — deliberately Finnhub, not Twelve Data. The tape only ever needs
// today's price and yesterday's close, both of which the quote endpoint
// returns in one call (`c`/`pc`), and Twelve Data's 8-req/min quota is the
// same one actual ticker searches depend on — every tape load used to
// spend 5 of those 8 requests just to render a scrolling banner, so a
// search made right after a homepage load could get rate-limited. Finnhub
// has its own, far more generous quota (60 req/min, confirmed empirically
// July 2026), so this can't compete with a real search anymore.
export async function fetchFinnhubDayChange(symbol: string): Promise<{ last: number; pct: number } | null> {
  const data = await fh<{ c: number; pc: number }>("quote", { symbol: symbol.toUpperCase() });
  if (!data || typeof data.c !== "number" || data.c <= 0 || typeof data.pc !== "number" || data.pc <= 0) {
    return null;
  }
  return { last: data.c, pct: ((data.c - data.pc) / data.pc) * 100 };
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
// freq defaults to quarterly, which is what the Time Machine's
// "how the business changed" panel has always asked for. Phase nine's SEC layer
// asks for annual, to recover capital expenditure for companies whose own filings
// tag it with a company-specific concept the SEC's companyfacts API does not
// carry (see lib/sec/capexFallback.ts). Each argument joins the cache key, so the
// two frequencies never collide.
export type ReportedFrequency = "annual" | "quarterly";

async function fetchFinancialsReportedRaw(
  symbol: string,
  freq: ReportedFrequency,
): Promise<FinancialsReportedFiling[]> {
  console.log(`[cache] MISS fetchFinancialsReported(${symbol}, ${freq}) — calling Finnhub`);
  const res = await fh<{ data: FinancialsReportedFiling[] }>("stock/financials-reported", {
    symbol: symbol.toUpperCase(),
    freq,
  });
  if (!res || !Array.isArray(res.data)) throw new Error("Finnhub financials-reported request failed");
  return res.data;
}
const cachedFetchFinancialsReported = unstable_cache(fetchFinancialsReportedRaw, ["fetchFinancialsReported"], {
  revalidate: LIVE_TTL_S,
});
export async function fetchFinancialsReported(
  symbol: string,
  freq: ReportedFrequency = "quarterly",
): Promise<FinancialsReportedFiling[] | null> {
  if (!process.env.FINNHUB_API_KEY) return null;
  try {
    return await cachedFetchFinancialsReported(symbol, freq);
  } catch {
    return null;
  }
}
