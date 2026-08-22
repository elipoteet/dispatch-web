import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTickerSnapshot } from "@/lib/analysis/tickerSnapshot";
import { TICKER_PATTERN } from "@/lib/analysis/loadReport";

type Params = { params: Promise<{ symbol: string }> };

// Thin GET the composer calls after its 800ms debounce — the browser can't
// hold FINNHUB_API_KEY itself. Requires a signed-in session (composing a
// post already requires one) mainly to keep this from being an open,
// unauthenticated way to spend Finnhub quota; it doesn't require a
// completed profile since onboarding itself never calls this.
export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { symbol: raw } = await params;
  const symbol = raw.toUpperCase();
  if (!TICKER_PATTERN.test(symbol)) {
    return NextResponse.json({ snapshot: null });
  }

  const snapshot = await getTickerSnapshot(symbol);
  return NextResponse.json({ snapshot });
}
