// Monthly Leaderboard — pure ranking/standing math for the daily scoring
// cron (app/api/competition/snapshot/route.ts). Kept here rather than
// inline in the route so it's unit-testable without touching the database,
// same split as rules.ts and marketHours.ts.

export type PricedPosition = { ticker: string; shares: number };

// Returns null (rather than a partial number) when any held ticker's price
// is missing — a standing computed from an incomplete price set would
// silently understate equity, which is worse than skipping the day
// entirely. The route's caller decides what "skip" means in practice: no
// standing row gets written for that user today.
export function computeEquityFromPrices(
  cash: number,
  positions: PricedPosition[],
  prices: Record<string, number>,
): number | null {
  let equity = cash;
  for (const p of positions) {
    const price = prices[p.ticker];
    if (price == null) return null;
    equity += p.shares * price;
  }
  return equity;
}

export function computeInvestedRatio(cash: number, equity: number): number {
  if (equity <= 0) return 0;
  return (equity - cash) / equity;
}

export function computeReturnPct(equity: number, startingBalance: number): number {
  return ((equity - startingBalance) / startingBalance) * 100;
}

export type StandingCandidate = {
  userId: string;
  eligible: boolean;
  returnPct: number;
  firstTradeAt: string | null;
};

// Rank is assigned only among eligible entrants, best return first; ties
// break by earlier first trade (see app/api/competition/trade/route.ts's
// first_trade_at comment — "earlier first trade wins"). Ineligible
// entrants get rank = null: they still get a standing row (so they can see
// their own return privately) but never a place on the public board (see
// 0003_leaderboard.sql's public_leaderboard view, which filters on
// eligible = true).
export function rankStandings(candidates: StandingCandidate[]): Map<string, number | null> {
  const ranks = new Map<string, number | null>();
  const eligible = candidates
    .filter((c) => c.eligible)
    .sort((a, b) => {
      if (b.returnPct !== a.returnPct) return b.returnPct - a.returnPct;
      const aTime = a.firstTradeAt ? Date.parse(a.firstTradeAt) : Infinity;
      const bTime = b.firstTradeAt ? Date.parse(b.firstTradeAt) : Infinity;
      return aTime - bTime;
    });
  eligible.forEach((c, i) => ranks.set(c.userId, i + 1));
  candidates.filter((c) => !c.eligible).forEach((c) => ranks.set(c.userId, null));
  return ranks;
}
