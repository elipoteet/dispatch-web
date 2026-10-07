import { NextResponse } from "next/server";
import { TICKER_PATTERN } from "@/lib/ticker";
import { getTickerIntraday } from "@/lib/analysis/tickerChart";

// Backs the 1D and 1W ranges on /research/[ticker]. Server-only because the
// Twelve Data key must never reach the browser, and on demand because intraday
// is the one range that spends that provider's 8-req/min quota — see
// getTickerIntraday. One response covers both ranges, so the chart calls this
// at most once per visit.
//
// Best-effort, like the chart it feeds: a rate-limited or down provider
// resolves to { points: null } with a 200 rather than an error status, so the
// chart can fall back to the ranges it already has instead of surfacing a
// failure the visitor cannot act on.
export async function GET(_request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = raw?.trim().toUpperCase();
  if (!symbol || !TICKER_PATTERN.test(symbol)) {
    return NextResponse.json({ error: "Invalid ticker symbol." }, { status: 400 });
  }
  return NextResponse.json({ points: await getTickerIntraday(symbol) });
}
