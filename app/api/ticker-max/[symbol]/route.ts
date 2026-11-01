import { NextResponse } from "next/server";
import { TICKER_PATTERN } from "@/lib/ticker";
import { getTickerMonthly } from "@/lib/analysis/tickerChart";

// Backs the MAX range on /research/[ticker]: monthly closes for the whole
// listed history. Fetched only when MAX is clicked, and cached for a day, so
// it costs at most one Twelve Data request per company per day. Answers like
// /api/ticker-intraday: { points, busy }, always a 200.
export async function GET(_request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = raw?.trim().toUpperCase();
  if (!symbol || !TICKER_PATTERN.test(symbol)) {
    return NextResponse.json({ error: "Invalid ticker symbol." }, { status: 400 });
  }
  return NextResponse.json(await getTickerMonthly(symbol));
}
