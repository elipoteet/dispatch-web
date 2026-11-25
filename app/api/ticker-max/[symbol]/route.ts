import { NextResponse } from "next/server";
import { TICKER_PATTERN } from "@/lib/ticker";
import { isCrawler } from "@/lib/research/crawler";
import { getTickerMonthly, isKnownSymbol } from "@/lib/analysis/tickerChart";

// Backs the MAX range on /research/[ticker]: monthly closes for the whole
// listed history. Fetched only when MAX is clicked, and cached for a day, so
// it costs at most one Twelve Data request per company per day. Answers like
// /api/ticker-intraday: { points, busy }, always a 200.
export async function GET(request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = raw?.trim().toUpperCase();
  if (!symbol || !TICKER_PATTERN.test(symbol)) {
    return NextResponse.json({ error: "Invalid ticker symbol." }, { status: 400 });
  }
  if (!(await isKnownSymbol(symbol))) {
    return NextResponse.json({ error: "Unknown ticker symbol." }, { status: 404 });
  }
  // A crawler never spends a price request (fix/price-credits). The chart
  // only asks from a click, but the address is in the page's script.
  if (isCrawler(request.headers.get("user-agent"))) return NextResponse.json({ points: null, busy: false, out: true });
  return NextResponse.json(await getTickerMonthly(symbol));
}
