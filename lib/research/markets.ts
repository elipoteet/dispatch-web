// The markets strip in the masthead: SPY, QQQ, DIA, IWM and GLD, then the
// 10-year Treasury yield, as one still line on every page. Server-only.
//
// Quotes from Finnhub only, never Twelve Data, whose eight requests a minute
// are kept for price history. Each fund's quote is cached once for everyone
// (unstable_cache), keyed by market time: a new key every five minutes while
// the market is open, and one key from a close to the next open. So a page
// load costs a cache read, and the whole site at most five Finnhub calls per
// five minutes of trading and five per night. The yield comes from the
// Treasury cache the Valuation tab already keeps; no request of its own.
//
// Rendered on the server with the page (app/layout.tsx), so it never flickers
// in and the browser asks for nothing. A quote that fails is left out; if
// every fund fails, there is no strip at all, and the masthead shows the date.

import { unstable_cache } from "next/cache";
import { fetchQuoteSnapshot } from "@/lib/providers";
import { getTenYearTreasury, type TreasuryYield } from "@/lib/research/treasury";
import { MARKET_CLOSE, MARKET_OPEN, MARKET_SETTLED, newYorkClock } from "@/lib/analysis/chartRanges";
import { formatSignedPct } from "@/lib/research/format";

export const STRIP_FUNDS = ["SPY", "QQQ", "DIA", "IWM", "GLD"] as const;

export type MarketItem = {
  symbol: string;
  value: string;
  change: string;
  direction: "up" | "down" | "flat";
  // A fund links to its research page; the yield has none.
  href: string | null;
  title?: string;
};

export type MarketsStrip = { items: MarketItem[]; atClose: boolean };

type StripQuote = { symbol: string; price: number; changePct: number };

const DAY_MS = 86_400_000;
const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// The most recent weekday whose session has settled: today after 4:15 on a
// weekday, otherwise the weekday before.
function lastSessionDate(now: Date): string {
  const { date, minutes, weekend } = newYorkClock(now);
  let day = new Date(`${date}T12:00:00Z`);
  if (!weekend && minutes >= MARKET_SETTLED) return date;
  do {
    day = new Date(day.getTime() - DAY_MS);
  } while (day.getUTCDay() === 0 || day.getUTCDay() === 6);
  return day.toISOString().slice(0, 10);
}

// The cache key's time part. While the market is open (9:30 to 4:15, as the
// 1D chart counts it), every five minutes. Otherwise one bucket per closed
// spell: Friday's close to Monday's open is a single bucket. Holidays aren't
// known; on one, the open-hours bucket still turns every five minutes.
export function marketsCacheBucket(now: Date): string {
  const { date, minutes, weekend } = newYorkClock(now);
  if (!weekend && minutes >= MARKET_OPEN && minutes < MARKET_SETTLED) return `${date}-open-${Math.floor(minutes / 5)}`;
  return `closed-after-${lastSessionDate(now)}`;
}

// Outside 9:30 to 4:00 on a weekday the prices are the last close.
export function isAtClose(now: Date): boolean {
  const { minutes, weekend } = newYorkClock(now);
  return weekend || minutes < MARKET_OPEN || minutes >= MARKET_CLOSE;
}

function direction(rounded: number): MarketItem["direction"] {
  return rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
}

// The line's items from whatever came back. A fund whose quote failed is
// left out; with no fund at all there's no strip, even if the yield is there.
export function stripItems(quotes: (StripQuote | null)[], treasury: TreasuryYield | null): MarketItem[] {
  const items: MarketItem[] = [];
  for (const q of quotes) {
    if (!q) continue;
    items.push({
      symbol: q.symbol,
      value: q.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      change: formatSignedPct(q.changePct, 2),
      direction: direction(Number(q.changePct.toFixed(2))),
      href: `/research/${q.symbol.toLowerCase()}`,
    });
  }
  if (items.length === 0) return [];
  if (treasury) {
    const moved = treasury.previous ? Number((treasury.percent - treasury.previous.percent).toFixed(2)) : null;
    items.push({
      symbol: "10Y",
      value: `${treasury.percent.toFixed(2)}%`,
      change: moved == null ? "" : `${moved > 0 ? "+" : moved < 0 ? "-" : ""}${Math.abs(moved).toFixed(2)}`,
      direction: moved == null ? "flat" : direction(moved),
      href: null,
      title: `10-year Treasury yield, ${SHORT_DATE.format(new Date(treasury.date))}${moved == null ? "" : "; change in percentage points"}`,
    });
  }
  return items;
}

// One fund's quote for one bucket, shared by every visitor. A failure throws,
// so it isn't kept and the next page load asks again for that fund only.
const cachedStripQuote = unstable_cache(
  async (symbol: string, bucket: string): Promise<StripQuote> => {
    console.log(`[markets] ${symbol}: asking Finnhub (${bucket})`);
    const q = await fetchQuoteSnapshot(symbol);
    if (!q) throw new Error(`no quote for ${symbol}`);
    return { symbol, price: q.price, changePct: q.changePct };
  },
  ["marketsStrip", "v1"],
  // A ceiling only; the bucket in the key is what turns the quote over.
  { revalidate: 60 * 60 * 24 * 4 },
);

// A slow quote doesn't hold the page: after this long it's left out.
const QUOTE_WAIT_MS = 2500;

async function stripQuote(symbol: string, bucket: string): Promise<StripQuote | null> {
  try {
    return await Promise.race([
      cachedStripQuote(symbol, bucket),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), QUOTE_WAIT_MS)),
    ]);
  } catch {
    return null;
  }
}

export async function getMarketsStrip(now: Date = new Date()): Promise<MarketsStrip | null> {
  if (!process.env.FINNHUB_API_KEY) return null;
  const bucket = marketsCacheBucket(now);
  const [quotes, treasury] = await Promise.all([Promise.all(STRIP_FUNDS.map((s) => stripQuote(s, bucket))), getTenYearTreasury()]);
  const items = stripItems(quotes, treasury);
  return items.length ? { items, atClose: isAtClose(now) } : null;
}
