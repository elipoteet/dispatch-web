// Twelve Data / Finnhub fetch wrappers — server-side only. Ported from the
// original client-side fetchers in the-dispatch.html; same shapes, same
// fallback behavior, just running behind our own API key instead of one
// pasted into localStorage by each visitor.

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

// —— Twelve Data: price history ——
// (The original also had a Stooq fallback for visitors without a Twelve Data
// key, routed through a CORS proxy since it ran in the browser. Stooq now
// serves a JS proof-of-work challenge instead of raw CSV to non-browser
// clients, so that path no longer returns usable data — dropped rather than
// shipping a fallback that always fails.)
export async function fetchPrices(symbol: string): Promise<PriceRow[]> {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("Twelve Data API key not configured.");
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=1300&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Twelve Data HTTP " + res.status);
  const j = await res.json();
  if (j.status === "error" || !j.values) throw new Error(j.message || "No data");
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
  if (rows.length < 10) throw new Error("Not enough data");
  return rows;
}

// —— Twelve Data: single lightweight quote (used for trade execution and
// mark-to-market pricing, where a full 1300-row history is wasteful) ——
export async function fetchQuotePrice(symbol: string): Promise<number> {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("Twelve Data API key not configured.");
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Twelve Data HTTP " + res.status);
  const j = await res.json();
  const price = parseFloat(j.price);
  if (j.status === "error" || isNaN(price)) throw new Error(j.message || "No price data");
  return price;
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

export async function fetchFundamentals(symbol: string): Promise<Fundamentals | null> {
  if (!process.env.FINNHUB_API_KEY) return null;
  const s = symbol.toUpperCase();
  const [profile, metricsRes, quote, reco, earnings] = await Promise.all([
    fh<FundamentalsProfile>("stock/profile2", { symbol: s }),
    fh<{ metric: FundamentalsMetrics }>("stock/metric", { symbol: s, metric: "all" }),
    fh("quote", { symbol: s }),
    fh<RecommendationPeriod[]>("stock/recommendation", { symbol: s }),
    fh<EarningsPeriod[]>("stock/earnings", { symbol: s }),
  ]);
  return {
    profile: profile ?? null,
    metrics: metricsRes?.metric ?? null,
    quote: quote ?? null,
    reco: reco ?? null,
    earnings: earnings ?? null,
  };
}

export async function fetchNews(symbol: string): Promise<NewsItem[] | null> {
  if (!process.env.FINNHUB_API_KEY) return null;
  const now = new Date();
  const past = new Date(now.getTime() - 30 * 864e5);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const news = await fh<NewsItem[]>("company-news", {
    symbol: symbol.toUpperCase(),
    from: fmt(past),
    to: fmt(now),
  });
  if (!Array.isArray(news)) return null;
  return news.slice(0, 6);
}

// News within ±14 days of a historical date — used by the Time Machine
// view, where "last 30 days" (fetchNews above) wouldn't be relevant.
export async function fetchNewsAsOf(symbol: string, asOfDate: string): Promise<NewsItem[] | null> {
  if (!process.env.FINNHUB_API_KEY) return null;
  const d = new Date(asOfDate + "T00:00:00");
  const from = new Date(d.getTime() - 14 * 864e5);
  const to = new Date(d.getTime() + 1 * 864e5);
  const fmt = (dd: Date) => dd.toISOString().slice(0, 10);
  const news = await fh<NewsItem[]>("company-news", {
    symbol: symbol.toUpperCase(),
    from: fmt(from),
    to: fmt(to),
  });
  if (!Array.isArray(news)) return null;
  return news.slice(0, 6);
}
