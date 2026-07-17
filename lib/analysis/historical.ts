// Time Machine helpers — ported from the original's pickHistoricalReco() and
// the row-slicing/fundamentals-adjustment inline in analyze(). Pure data
// transforms; the actual historical news fetch lives server-side
// (lib/providers.fetchNewsAsOf), everything else just slices what the
// analyze endpoint already returned.

import type { Fundamentals, PriceRow, RecommendationPeriod } from "@/lib/providers";

export function sliceRowsAsOf(rows: PriceRow[], asOfDate: string): PriceRow[] {
  return rows.filter((r) => r.date <= asOfDate);
}

// Picks the recommendation snapshot closest to but not after asOfDate.
export function pickHistoricalReco(
  recoArray: RecommendationPeriod[] | null,
  asOfDate: string,
): RecommendationPeriod[] | null {
  if (!Array.isArray(recoArray) || !recoArray.length) return recoArray;
  const cutoff = new Date(asOfDate + "T00:00:00").getTime();
  const filtered = recoArray.filter((r) => new Date(r.period + "T00:00:00").getTime() <= cutoff);
  return filtered.length ? filtered : [recoArray[recoArray.length - 1]];
}

// Fundamentals as they'd have looked as of a past date: metrics/quote are
// point-in-time data we don't have, so they're hidden rather than shown
// stale; recommendations are rolled back to the closest prior snapshot.
export function buildHistoricalFundamentals(
  fund: Fundamentals | null,
  asOfDate: string,
): Fundamentals | null {
  if (!fund) return null;
  return {
    profile: fund.profile,
    metrics: null,
    quote: null,
    reco: pickHistoricalReco(fund.reco, asOfDate),
    earnings: fund.earnings,
  };
}
