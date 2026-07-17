import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache";
import { fetchFundamentals, fetchNews, fetchNewsAsOf, fetchPrices } from "@/lib/providers";

const CACHE_TTL_MS = 5 * 60 * 1000;

const ASOF_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: raw } = await params;
  const ticker = raw?.trim().toUpperCase();

  if (!ticker || !/^[A-Z.\-]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker symbol." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const asOfParam = searchParams.get("asOf");
  const asOf = asOfParam && ASOF_PATTERN.test(asOfParam) ? asOfParam : null;

  try {
    // Price history + fundamentals don't depend on asOf — Time Machine
    // slices/adjusts the same full history client-side — so this stays a
    // single cache entry regardless of which date the user is viewing.
    const { rows, fundamentals } = await withCache(`analyze:${ticker}`, CACHE_TTL_MS, async () => {
      const [rows, fundamentals] = await Promise.all([
        fetchPrices(ticker),
        fetchFundamentals(ticker).catch(() => null),
      ]);
      return { rows, fundamentals };
    });

    // News is genuinely date-scoped, so it gets its own cache entry per
    // (ticker, asOf) rather than forcing a re-fetch of price/fundamentals too.
    const news = asOf
      ? await withCache(`analyze:news:${ticker}:${asOf}`, CACHE_TTL_MS, () =>
          fetchNewsAsOf(ticker, asOf).catch(() => null),
        )
      : await withCache(`analyze:news:${ticker}:live`, CACHE_TTL_MS, () => fetchNews(ticker).catch(() => null));

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
