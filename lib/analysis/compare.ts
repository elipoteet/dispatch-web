// Time Machine "Then vs. Now" analysis — pure math over the two ReportData
// objects the compare view already has. No fetches, no formatting-for-DOM;
// CompareView renders whatever this returns.

import type { ReportData, ScorecardRow } from "./report";
import { fmt, maxDrawdown, sign } from "./indicators";

export type ScoreDelta = {
  name: string;
  thenScore: number | null;
  nowScore: number | null;
  delta: number | null;
  isComposite?: boolean;
  note?: string;
};

export type IntervalPerformance = {
  startDate: string;
  endDate: string;
  startPrice: number;
  endPrice: number;
  totalReturnPct: number;
  high: number;
  low: number;
  maxDrawdownPct: number;
};

export type Comparison = {
  scoreDeltas: ScoreDelta[];
  topMover: string | null;
  interval: IntervalPerformance;
  verdict: string;
  verdictTone: "pos" | "neg" | "neutral";
};

function findScore(scorecard: ScorecardRow[], name: string): number | null {
  return scorecard.find((r) => r.name === name)?.score ?? null;
}

function buildVerdict(
  ticker: string,
  rating: string,
  ratingClass: "buy" | "hold" | "sell",
  returnPct: number,
): { verdict: string; verdictTone: "pos" | "neg" | "neutral" } {
  const moved = `${sign(returnPct)}${fmt(returnPct, 1)}%`;
  const lead = `The Dispatch rated ${ticker} ${rating} on that date`;

  if (ratingClass === "buy") {
    if (returnPct > 5) return { verdict: `${lead}; it has returned ${moved} since — a call that has held up.`, verdictTone: "pos" };
    if (returnPct < -10) return { verdict: `${lead}; it has instead returned ${moved} since — a call that hasn't held up.`, verdictTone: "neg" };
    return { verdict: `${lead}; the stock has moved ${moved} since — a mixed result, neither confirming nor breaking the thesis.`, verdictTone: "neutral" };
  }

  if (ratingClass === "sell") {
    if (returnPct < -5) return { verdict: `${lead}; it has since fallen ${moved} — a caution that proved correct.`, verdictTone: "pos" };
    if (returnPct > 10) return { verdict: `${lead}; it has instead gained ${moved} since — a call that missed the rebound.`, verdictTone: "neg" };
    return { verdict: `${lead}; the stock has moved ${moved} since — a mixed result.`, verdictTone: "neutral" };
  }

  // hold
  if (Math.abs(returnPct) <= 10) {
    return { verdict: `${lead}; the stock has moved ${moved} since — consistent with a flat, wait-and-see call.`, verdictTone: "neutral" };
  }
  return { verdict: `${lead}; the stock has instead moved ${moved} since — a bigger move than a Hold call anticipated.`, verdictTone: "neutral" };
}

export function buildComparison(thenReport: ReportData, nowReport: ReportData, thenDate: string): Comparison {
  const dims = ["Fundamentals", "Technicals", "Sentiment / News"];
  const rowDeltas: ScoreDelta[] = dims.map((name) => {
    const thenScore = findScore(thenReport.scorecard, name);
    const nowScore = findScore(nowReport.scorecard, name);
    return {
      name,
      thenScore,
      nowScore,
      delta: thenScore != null && nowScore != null ? nowScore - thenScore : null,
    };
  });

  // Use the same composite each side already displays in its own column
  // (ReportData.composite) rather than recomputing one, so the strip never
  // shows a number that contradicts what's above it. The "then" composite
  // only ever averaged the dimensions available at that date (Fundamentals
  // is hidden for historical dates — see buildHistoricalFundamentals), while
  // "now" averages all three — flag that with a note instead of masking it.
  const missingThenDims = rowDeltas.filter((r) => r.thenScore == null).map((r) => r.name);
  const compositeDelta: ScoreDelta = {
    name: "Composite",
    thenScore: thenReport.composite,
    nowScore: nowReport.composite,
    delta: nowReport.composite - thenReport.composite,
    isComposite: true,
    note: missingThenDims.length
      ? `then composite excludes ${missingThenDims.join(", ")} — unavailable as of that date`
      : undefined,
  };

  const nonComposite = rowDeltas.slice().sort((a, b) => {
    const av = a.delta == null ? -1 : Math.abs(a.delta);
    const bv = b.delta == null ? -1 : Math.abs(b.delta);
    return bv - av;
  });

  const topMoverRow = nonComposite.find((r) => r.delta != null && r.delta !== 0);
  const topMover = topMoverRow ? topMoverRow.name : null;

  const scoreDeltas = [...nonComposite, compositeDelta];

  const sliced = nowReport.rows.filter((r) => r.date >= thenDate);
  const points = sliced.length ? sliced : nowReport.rows.slice(-1);
  const closes = points.map((r) => r.close);
  const startPrice = closes[0];
  const endPrice = closes[closes.length - 1];
  const interval: IntervalPerformance = {
    startDate: points[0].date,
    endDate: points[points.length - 1].date,
    startPrice,
    endPrice,
    totalReturnPct: ((endPrice - startPrice) / startPrice) * 100,
    high: Math.max(...closes),
    low: Math.min(...closes),
    maxDrawdownPct: maxDrawdown(closes),
  };

  const { verdict, verdictTone } = buildVerdict(
    thenReport.ticker,
    thenReport.rating,
    thenReport.ratingClass,
    interval.totalReturnPct,
  );

  return { scoreDeltas, topMover, interval, verdict, verdictTone };
}
