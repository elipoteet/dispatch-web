import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache";
import { fetchFundamentals, fetchNews, fetchPrices } from "@/lib/providers";

const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: raw } = await params;
  const ticker = raw?.trim().toUpperCase();

  if (!ticker || !/^[A-Z.\-]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker symbol." }, { status: 400 });
  }

  try {
    const payload = await withCache(`analyze:${ticker}`, CACHE_TTL_MS, async () => {
      const [rows, fundamentals, news] = await Promise.all([
        fetchPrices(ticker),
        fetchFundamentals(ticker).catch(() => null),
        fetchNews(ticker).catch(() => null),
      ]);
      return { ticker, rows, fundamentals, news };
    });
    return NextResponse.json(payload);
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
