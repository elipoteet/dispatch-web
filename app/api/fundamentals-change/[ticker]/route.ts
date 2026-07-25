import { NextResponse } from "next/server";
import { TICKER_PATTERN } from "@/lib/analysis/loadReport";
import { fetchFinancialsReported } from "@/lib/providers";
import { buildFundamentalsChange } from "@/lib/analysis/fundamentalsChange";

const ASOF_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Backs the Time Machine's "How the business changed" panel — server-only
// because the Finnhub key must never reach the browser. Best-effort: any
// failure or lack of data resolves to { change: null } rather than an error
// status, since CompareView already treats a null result as "hide this
// section" (see buildFundamentalsChange's own null-when-nothing-found rule).
export async function GET(request: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const ticker = raw?.trim().toUpperCase();
  if (!ticker || !TICKER_PATTERN.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker symbol." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const asOf = searchParams.get("asOf");
  if (!asOf || !ASOF_PATTERN.test(asOf)) {
    return NextResponse.json({ error: "A valid asOf date is required." }, { status: 400 });
  }

  const filings = await fetchFinancialsReported(ticker);
  if (!filings) {
    return NextResponse.json({ change: null });
  }
  return NextResponse.json({ change: buildFundamentalsChange(filings, asOf) });
}
