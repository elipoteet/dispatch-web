import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache";
import { fetchPrices } from "@/lib/providers";

const CACHE_TTL_MS = 5 * 60 * 1000;
const SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "AMZN", "META", "SPY", "QQQ"];

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
