import { NextResponse } from "next/server";
import { TICKER_PATTERN } from "@/lib/ticker";
import { getTickerIntraday, isKnownSymbol } from "@/lib/analysis/tickerChart";

// Backs the 1D and 1W ranges on /research/[ticker]. Server-only because the
// Twelve Data key must never reach the browser, and on demand because intraday
// spends that provider's 8-a-minute allowance — see lib/analysis/tickerChart.ts.
// One response covers both ranges, so the chart calls this at most once per
// visit.
//
// Best-effort, like the chart it feeds: a rate-limited or down provider
// resolves to { points: null } with a 200 rather than an error status, and
// `busy: true` when the cause is the allowance, so the chart can say "try
// again in a minute" instead of surfacing a failure the visitor can't act on.
export async function GET(_request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = raw?.trim().toUpperCase();
  if (!symbol || !TICKER_PATTERN.test(symbol)) {
    return NextResponse.json({ error: "Invalid ticker symbol." }, { status: 400 });
  }
  // Not a request spent on a symbol nobody lists (see isKnownSymbol).
  if (!(await isKnownSymbol(symbol))) {
    return NextResponse.json({ error: "Unknown ticker symbol." }, { status: 404 });
  }
  return NextResponse.json(await getTickerIntraday(symbol));
}
