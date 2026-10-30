// Time Machine "Then vs. Now" analysis — pure math over the two ReportData
// objects the compare view already has. No fetches, no formatting-for-DOM;
// CompareView renders whatever this returns.
//
// Facts about the interval only. This used to diff the two memos' scores and
// grade the old rating against what the stock did next ("a call that has held
// up"); that is a track record, and both were removed on 30 October 2026 along
// with the ratings themselves (docs/direction-2026-10-30.md).

import type { ReportData } from "./report";
import { maxDrawdown } from "./indicators";

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
  interval: IntervalPerformance;
};

export function buildComparison(nowReport: ReportData, thenDate: string): Comparison {
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

  return { interval };
}
