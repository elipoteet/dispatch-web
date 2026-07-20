import { NextResponse } from "next/server";
import { loadTickerData, TICKER_PATTERN } from "@/lib/analysis/loadReport";

const ASOF_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: raw } = await params;
  const ticker = raw?.trim().toUpperCase();

  if (!ticker || !TICKER_PATTERN.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker symbol." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const asOfParam = searchParams.get("asOf");
  const asOf = asOfParam && ASOF_PATTERN.test(asOfParam) ? asOfParam : null;

  try {
    const { rows, fundamentals, news } = await loadTickerData(ticker, asOf);
    return NextResponse.json({ ticker, rows, fundamentals, news });
  } catch (err) {
    // Surface config errors (e.g. missing API key) directly; keep the
    // message generic for anything else so we're not leaking raw provider
    // errors (rate limits, HTTP codes) to the client.
    const message =
      err instanceof Error && err.message.includes("not configured")
        ? err.message
        : `Could not fetch data for ${ticker}. Check that it's a valid U.S.-listed symbol.`;
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
