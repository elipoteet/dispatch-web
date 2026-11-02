// The Earnings tab's arithmetic (phase nine, stage 5). Pure: stored SEC rows,
// what was read from the company's earnings releases, and Finnhub's estimates
// in; quarters, outlooks and sentences out.
//
// Everything is a fact with its source: what the company said it expected,
// what it reported, what analysts on average estimated. Nothing is called a
// beat, a miss, good or bad.

import type { FinancialRow } from "@/lib/sec/normalize";
import { pickGuidance, type RevenueGuidance } from "@/lib/sec/guidance";
import { RowIndex, quarterList, type Quarter } from "@/lib/research/valuation";
import { factorAt, type SplitStep } from "@/lib/research/splits";
import { isCalendarYear } from "@/lib/research/format";

const DAY_MS = 86_400_000;

// "Q3 FY27" for NVIDIA, whose fiscal 2027 is mostly calendar 2026; "Q3 2026"
// for a company whose fiscal year is the calendar year.
export function quarterLabel(fiscalYear: number, quarter: number, fiscalYearEnd: string | null | undefined): string {
  return isCalendarYear(fiscalYearEnd) ? `Q${quarter} ${fiscalYear}` : `Q${quarter} FY${String(fiscalYear).slice(-2)}`;
}

export function nextQuarter(q: Pick<Quarter, "fiscalYear" | "fiscalPeriod">): { fiscalYear: number; quarter: 1 | 2 | 3 | 4 } {
  const n = Number(q.fiscalPeriod[1]);
  return n === 4 ? { fiscalYear: q.fiscalYear + 1, quarter: 1 } : { fiscalYear: q.fiscalYear, quarter: (n + 1) as 2 | 3 | 4 };
}

// Which quarter an earnings release reports: the latest quarter that ended
// before it was filed, if it ended within four months of it. A release is
// filed a few weeks after its quarter (NVIDIA: 26 July, then 26 August).
//
// The press release comes before the 10-Q, often by weeks: JPMorgan reported
// its third quarter of 2026 on 13 October, while the newest quarter in its
// filings was still the second. So past the newest quarter the filings know,
// quarters are counted forward, 91 days apart, to the one the release covers.
export function reportedQuarter(filed: string, quarters: Quarter[]): Quarter | null {
  const before = quarters.filter((q) => q.periodEnd < filed);
  const last = before[before.length - 1];
  if (!last) return null;
  let q: Quarter = last;
  let end = Date.parse(last.periodEnd);
  const at = Date.parse(filed);
  if (last === quarters[quarters.length - 1]) {
    // At most two quarters past the filings: the 10-Q lags by one. Further
    // than that, the stored filings are stale and nothing is assumed.
    for (let ahead = 0; ahead < 2 && end + 91 * DAY_MS <= at; ahead++) {
      const n = nextQuarter(q);
      end += 91 * DAY_MS;
      q = { fiscalYear: n.fiscalYear, fiscalPeriod: `Q${n.quarter}`, periodEnd: new Date(end).toISOString().slice(0, 10) };
    }
  }
  return (at - end) / DAY_MS <= 120 ? q : null;
}

export type Guided = RevenueGuidance & {
  // The quarter the outlook is for.
  fiscalYear: number;
  quarter: 1 | 2 | 3 | 4;
  releaseFiled: string;
  releaseUrl: string | null;
};

export type ReadRelease = {
  filed: string;
  url: string | null;
  candidates: RevenueGuidance[];
};

// Each release's outlook for the quarter after the one it reports.
export function outlooks(releases: ReadRelease[], rows: FinancialRow[]): Guided[] {
  const quarters = quarterList(rows);
  const idx = new RowIndex(rows);
  const out: Guided[] = [];
  const newest = quarters[quarters.length - 1];
  const newestRevenue = newest ? (idx.get("revenue", newest.fiscalYear, newest.fiscalPeriod)?.value ?? null) : null;
  for (const r of releases) {
    const reported = reportedQuarter(r.filed, quarters);
    if (!reported) continue;
    const next = nextQuarter(reported);
    // The quarter just reported, for the size check; the newest one filed
    // when the release is ahead of the filings.
    const lastRevenue = idx.get("revenue", reported.fiscalYear, reported.fiscalPeriod)?.value ?? newestRevenue;
    const g = pickGuidance(r.candidates, { quarter: next.quarter, lastRevenue });
    if (g) out.push({ ...g, fiscalYear: next.fiscalYear, quarter: next.quarter, releaseFiled: r.filed, releaseUrl: r.url });
  }
  return out;
}

export type EarningsQuarter = {
  fiscalYear: number;
  quarter: 1 | 2 | 3 | 4;
  label: string;
  periodEnd: string;
  revenue: number | null;
  eps: number | null;
  // Q4 EPS is the year's less the first three quarters'.
  epsCalculated: boolean;
  // The outlook the company gave for this quarter a quarter earlier.
  outlook: Guided | null;
};

// The last n reported quarters, oldest first.
//
// EPS is put on today's share basis before anything is shown or subtracted.
// Each filing states EPS in the shares of its own date: NVIDIA's first quarter
// of fiscal 2024 is $0.82 in a 10-Q filed before its 2024 ten-for-one split,
// and its fiscal 2024 total is $1.19 in a 10-K filed after. Subtracting the
// two as they stand gave a fourth quarter of -$0.25; on one basis it is $0.49.
// `steps` are the company's splits (splits.ts): an empty list means none in
// the window; null means they couldn't be checked, and then no EPS is shown.
export function earningsQuarters(
  rows: FinancialRow[],
  guided: Guided[],
  fiscalYearEnd: string | null,
  steps: SplitStep[] | null,
  n = 12,
): EarningsQuarter[] {
  const idx = new RowIndex(rows);
  const today = (row: FinancialRow | undefined) =>
    row && steps ? row.value / factorAt(steps, row.filedAt || row.periodEnd) : null;

  return quarterList(rows)
    .slice(-n)
    .map((q) => {
      const quarter = Number(q.fiscalPeriod[1]) as 1 | 2 | 3 | 4;
      let eps = today(idx.get("eps_diluted", q.fiscalYear, q.fiscalPeriod));
      let epsCalculated = false;
      if (eps == null && quarter === 4) {
        // A 10-K reports the year, not the fourth quarter.
        const year = today(idx.get("eps_diluted", q.fiscalYear, "FY"));
        const parts = (["Q1", "Q2", "Q3"] as const).map((p) => today(idx.get("eps_diluted", q.fiscalYear, p)));
        if (year != null && parts.every((p) => p != null)) {
          eps = year - parts.reduce((s, p) => s! + p!, 0)!;
          epsCalculated = true;
        }
      }
      return {
        fiscalYear: q.fiscalYear,
        quarter,
        label: quarterLabel(q.fiscalYear, quarter, fiscalYearEnd),
        periodEnd: q.periodEnd,
        revenue: idx.get("revenue", q.fiscalYear, q.fiscalPeriod)?.value ?? null,
        eps,
        epsCalculated,
        outlook: guided.find((g) => g.fiscalYear === q.fiscalYear && g.quarter === quarter) ?? null,
      };
    });
}

// The outlook in the newest release: for the quarter it will report next.
export function upcomingOutlook(guided: Guided[], newestRelease: { filed: string } | null): Guided | null {
  if (!newestRelease) return null;
  return guided.find((g) => g.releaseFiled === newestRelease.filed) ?? null;
}

// Whether a quarter comes straight after the last one charted, so its outlook
// can stand as the chart's next bar without leaving a gap.
export function followsLast(q: { fiscalYear: number; quarter: number }, quarters: EarningsQuarter[]): boolean {
  const last = quarters[quarters.length - 1];
  if (!last) return false;
  const n = nextQuarter({ fiscalYear: last.fiscalYear, fiscalPeriod: `Q${last.quarter}` });
  return n.fiscalYear === q.fiscalYear && n.quarter === q.quarter;
}

// "$1.08", "-$0.17".
export function formatEps(v: number): string {
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
}

// Reported against the average estimate, in plain words: "came in $0.08 above
// the average estimate". Compared in cents, as both are shown.
export function estimateSentence(actual: number, estimate: number): string {
  const cents = Math.round(actual * 100) - Math.round(estimate * 100);
  if (cents === 0) return "matched the average estimate";
  return `came in ${formatEps(Math.abs(cents) / 100)} ${cents > 0 ? "above" : "below"} the average estimate`;
}

// "$105.8B to $110.2B", or one figure when the company gave one.
export function outlookRange(g: Pick<RevenueGuidance, "low" | "high">): string {
  const f = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(v >= 10e9 ? 1 : 2)}B` : `$${(v / 1e6).toFixed(0)}M`);
  return g.low === g.high ? f(g.low) : `${f(g.low)} to ${f(g.high)}`;
}
