// Everything the Valuation tab shows, gathered from what the company page has
// already loaded plus three things only this tab needs: split factors (one
// Twelve Data request, and only for companies whose share counts jumped), the
// 10-year Treasury yield, and the peers. Server-only.

import type { FilerKind } from "@/lib/sec/concepts";
import type { CompanyPage } from "@/lib/research/company";
import { loadSplitSteps } from "@/lib/research/splitData";
import {
  finnhubShareCount,
  historyMatchesToday,
  rangeStats,
  todayOnFilings,
  valuationHistory,
  type QuarterPoint,
  type RangeStats,
  type SharesToday,
  type TodayFigures,
} from "@/lib/research/valuation";
import { getTenYearTreasury, type TreasuryYield } from "@/lib/research/treasury";
import { loadPeers, type PeerRow } from "@/lib/research/peers";

// busy: Twelve Data's allowance is used up for the minute. unavailable: no
// price history. no-shares: the filings give no share count for past quarters.
// mismatch: they give one, but it doesn't line up with today's (see
// historyMatchesToday).
export type HistoryStatus = "ok" | "busy" | "unavailable" | "no-shares" | "mismatch";

export type MetricKey = "pe" | "evSales" | "fcfYield" | "pb";

export type ValuationData = {
  filerKind: FilerKind;
  today: TodayFigures | null;
  shares: SharesToday | null;
  history: QuarterPoint[];
  historyStatus: HistoryStatus;
  ranges: Record<MetricKey, RangeStats | null>;
  treasury: TreasuryYield | null;
  peers: PeerRow[] | null;
};

// The figures a page shows for each kind of company. A bank's free cash flow
// and enterprise value describe nothing (see Financials), so it gets price to
// book in their place.
export function metricsFor(kind: FilerKind): MetricKey[] {
  return kind === "financial" ? ["pe", "pb"] : ["pe", "evSales", "fcfYield"];
}


export async function loadValuation(
  company: CompanyPage,
  options: { background: boolean } = { background: true },
): Promise<ValuationData | null> {
  const fin = company.financials;
  if (!fin || fin.rows.length === 0) return null;
  const asOf = new Date().toISOString().slice(0, 10);
  const price = company.quote?.price ?? null;
  const finnhubShares = finnhubShareCount(company.profile, price);

  const [split, treasury, peers] = await Promise.all([
    loadSplitSteps(company, finnhubShares, asOf),
    getTenYearTreasury(),
    loadPeers(company.symbol, fin.cik, options),
  ]);

  // The same market value as the Overview's (todayOnFilings).
  const now = todayOnFilings({ rows: fin.rows, profile: company.profile, price, asOf });
  const shares = now?.shares ?? null;
  const today = now?.figures ?? null;

  let history =
    company.daily && split.steps ? valuationHistory({ rows: fin.rows, daily: company.daily, steps: split.steps, asOf }) : [];
  let historyStatus: HistoryStatus = !company.daily ? "unavailable" : split.status;
  if (historyStatus === "ok" && history.length === 0) historyStatus = "no-shares";
  if (historyStatus === "ok" && company.daily && shares && !historyMatchesToday(history, company.daily, shares.shares)) {
    console.warn(`[valuation] ${company.symbol}: history's share count doesn't match today's; not shown`);
    history = [];
    historyStatus = "mismatch";
  }

  const range = (key: MetricKey) =>
    rangeStats(
      history.map((p) => p[key]).filter((v): v is number => v != null),
      today?.[key] ?? null,
    );

  return {
    filerKind: fin.filerKind,
    today,
    shares,
    history,
    historyStatus,
    ranges: { pe: range("pe"), evSales: range("evSales"), fcfYield: range("fcfYield"), pb: range("pb") },
    treasury,
    peers,
  };
}
