import { fetchFundamentals, fetchFinnhubDayChange } from "@/lib/providers";

// The composer's attached data card — symbol, name, price, day change, P/E,
// revenue growth, gross margin, 52-week range. Deliberately NOT built on
// loadReport/loadTickerData (lib/analysis/loadReport.ts): those pull
// fetchPrices, which hits Twelve Data's tight 8-req/min quota, plus news
// this card doesn't need. This composes only fetchFundamentals and
// fetchFinnhubDayChange — both 100% Finnhub, safe to call on every debounced
// keystroke without competing with real ticker search. See docs/phase-two.md
// and docs/phase-one-recap.md.
export type TickerSnapshot = {
  symbol: string;
  name: string | null;
  price: number;
  dayChangePct: number;
  peRatio: number | null;
  revenueGrowthPct: number | null;
  grossMarginPct: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
};

// Quiet-fail on anything unresolvable — an unknown symbol or a provider
// hiccup should never block the composer, just mean no card appears (see
// docs/phase-two.md: "If a lookup fails or the symbol is unknown, fail
// quietly. The text stays, no card appears, the post still works.").
export async function getTickerSnapshot(symbolRaw: string): Promise<TickerSnapshot | null> {
  const symbol = symbolRaw.toUpperCase();

  const [dayChange, fundamentals] = await Promise.all([
    fetchFinnhubDayChange(symbol).catch(() => null),
    fetchFundamentals(symbol).catch(() => null),
  ]);

  if (!dayChange) return null;

  const metrics = fundamentals?.metrics ?? null;

  return {
    symbol,
    name: fundamentals?.profile?.name ?? null,
    price: dayChange.last,
    dayChangePct: dayChange.pct,
    peRatio: metrics?.peBasicExclExtraTTM ?? null,
    revenueGrowthPct: metrics?.revenueGrowthTTMYoy ?? null,
    // Confirmed against a live Finnhub response — grossMarginTTM, not
    // typed on FundamentalsMetrics (only reachable via its index
    // signature), same TTM convention as peBasicExclExtraTTM.
    grossMarginPct: metrics?.grossMarginTTM ?? null,
    weekHigh52: metrics?.["52WeekHigh"] ?? null,
    weekLow52: metrics?.["52WeekLow"] ?? null,
  };
}
