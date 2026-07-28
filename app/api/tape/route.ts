import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache";
import { fetchFinnhubDayChange } from "@/lib/providers";

const CACHE_TTL_MS = 10 * 60 * 1000;
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
