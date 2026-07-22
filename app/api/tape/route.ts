import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache";
import { fetchPrices } from "@/lib/providers";

const CACHE_TTL_MS = 10 * 60 * 1000;
// Twelve Data's free tier allows 8 requests/minute — this fires all of these
// at once on every cold homepage load, so it must stay comfortably under 8
// or it exceeds the limit by itself, before any visitor has searched
// anything (confirmed live: a 9-symbol burst got a 429 on the 9th request).
// Leaving headroom here also matters because a rate-limited fetchPrices()
// call surfaces as a real page failure for a ticker search sharing the
// same per-minute quota, not just a missing tape row.
const SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "SPY"];

export type TapeItem = { symbol: string; last: number; pct: number };

export async function GET() {
  const items = await withCache<TapeItem[]>("tape", CACHE_TTL_MS, async () => {
    const results = await Promise.allSettled(
      SYMBOLS.map((s) => fetchPrices(s).then((rows) => ({ s, rows }))),
    );
    const out: TapeItem[] = [];
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const { s, rows } = r.value;
      if (!rows || rows.length < 2) continue;
      const last = rows[rows.length - 1].close;
      const prev = rows[rows.length - 2].close;
      const pct = ((last - prev) / prev) * 100;
      out.push({ symbol: s, last, pct });
    }
    return out;
  });

  return NextResponse.json({ items });
}
