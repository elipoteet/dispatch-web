import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache";
import { fetchFinnhubDayChange } from "@/lib/providers";

// Lengthened from the original 10-minute TTL now that the composer's
// per-keystroke $TICKER detection (lib/analysis/tickerSnapshot.ts) also
// draws on Finnhub — the shared budget is tighter than when this tape last
// existed, so this cache errs longer rather than shorter. Still capped at
// 5 symbols, still one shared server-side fetch for every visitor.
const CACHE_TTL_MS = 20 * 60 * 1000;
const SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "SPY"];

export type TapeItem = { symbol: string; last: number; pct: number };

export async function GET() {
  const items = await withCache<TapeItem[]>("tape", CACHE_TTL_MS, async () => {
    const results = await Promise.allSettled(
      SYMBOLS.map((s) => fetchFinnhubDayChange(s).then((change) => ({ s, change }))),
    );
    const out: TapeItem[] = [];
    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value.change) continue;
      out.push({ symbol: r.value.s, last: r.value.change.last, pct: r.value.change.pct });
    }
    return out;
  });

  return NextResponse.json({ items });
}
