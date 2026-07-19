import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache";
import { fetchQuoteBatch } from "@/lib/providers";

// 20 minutes, not 5 — this is a ticker tape, not a live feed, and a longer
// TTL means fewer refreshes eating into the free-tier rate limit below.
const CACHE_TTL_MS = 20 * 60 * 1000;

// Twelve Data's free tier allows 8 symbols/minute — confirmed by testing;
// a batch of ~40 gets a flat 429. That budget is shared with whatever
// /api/analyze is doing for research lookups at the same moment, so this
// list deliberately stays well under 8, not right up against it.
//
// Recognizable anchors, always shown first.
const FIXED_SYMBOLS = ["SPY", "QQQ"];

// Small curated pool scanned for today's biggest movers. Not a whole-market
// scan — that needs a paid data tier — an honest "top gainers among stocks
// we're watching," not "top gainers on the entire market."
const GAINER_POOL = ["NVDA", "TSLA", "GOOGL", "AMZN"];

const GAINERS_SHOWN = 3;

export type TapeItem = { symbol: string; last: number; pct: number };

export async function GET() {
  try {
    const items = await withCache<TapeItem[]>("tape", CACHE_TTL_MS, async () => {
      const allSymbols = Array.from(new Set([...FIXED_SYMBOLS, ...GAINER_POOL]));
      const quotes = await fetchQuoteBatch(allSymbols);
      const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));

      const fixed = FIXED_SYMBOLS.map((s) => bySymbol.get(s)).filter(
        (q): q is TapeItem => !!q,
      );

      const gainers = GAINER_POOL
        .map((s) => bySymbol.get(s))
        .filter((q): q is TapeItem => !!q)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, GAINERS_SHOWN);

      return [...fixed, ...gainers];
    });
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
