// Monthly Leaderboard — shared competition-account computation, mirroring
// lib/portfolio.ts's shape for the existing (separate, untouched)
// paper-trading system. Kept as its own module rather than folded into
// lib/portfolio.ts because the underlying tables and month-scoping are
// genuinely different, even though the math is the same idea.

import { getDb } from "@/lib/db";
import { getLatestPrice } from "@/lib/portfolio";

type Db = Awaited<ReturnType<typeof getDb>>;

export type CompetitionPosition = { ticker: string; shares: number; avgCost: number };
export type CompetitionPositionView = CompetitionPosition & {
  currentPrice: number;
  isStale: boolean;
  marketValue: number;
  costBasis: number;
  unrealizedPL: number;
  unrealizedPLPct: number;
};

export type CompetitionAccount = {
  cash: number;
  startingBalance: number;
  firstTradeAt: string | null;
  createdAt: string;
};

export type CompetitionSummary = {
  cash: number;
  positionsValue: number;
  equity: number;
  returnPct: number;
};

export type CompetitionTrade = {
  id: string;
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  executedAt: string;
};

export type CompetitionState = {
  account: CompetitionAccount | null;
  positions: CompetitionPositionView[];
  trades: CompetitionTrade[];
  summary: CompetitionSummary | null;
};

// Same fallback-to-avgCost-and-mark-stale behavior as
// lib/portfolio.ts's buildPositionViews, for the same reason: a quote
// failure shouldn't break the whole page, just that one row's freshness.
export async function buildCompetitionPositionViews(
  positions: CompetitionPosition[],
): Promise<CompetitionPositionView[]> {
  return Promise.all(
    positions.map(async (p) => {
      let currentPrice = p.avgCost;
      let isStale = true;
      try {
        currentPrice = await getLatestPrice(p.ticker);
        isStale = false;
      } catch {
        // Keep avgCost fallback + isStale = true.
      }
      const marketValue = p.shares * currentPrice;
      const costBasis = p.shares * p.avgCost;
      return {
        ...p,
        currentPrice,
        isStale,
        marketValue,
        costBasis,
        unrealizedPL: marketValue - costBasis,
        unrealizedPLPct: ((currentPrice - p.avgCost) / p.avgCost) * 100,
      };
    }),
  );
}

// Return is against the fixed $10,000 starting balance, not whatever a
// user's regular paper account happens to start at — that's the whole
// point of a separate competition account (see rules.ts STARTING_BALANCE).
export function computeCompetitionSummary(
  account: CompetitionAccount,
  positions: CompetitionPositionView[],
): CompetitionSummary {
  const positionsValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const equity = account.cash + positionsValue;
  return {
    cash: account.cash,
    positionsValue,
    equity,
    returnPct: ((equity - account.startingBalance) / account.startingBalance) * 100,
  };
}

export async function loadCompetitionState(supabase: Db, userId: string, month: string): Promise<CompetitionState> {
  const { data: accountRow } = await supabase
    .from("competition_account")
    .select("cash, starting_balance, first_trade_at, created_at")
    .eq("user_id", userId)
    .eq("month", month)
    .maybeSingle();

  if (!accountRow) {
    return { account: null, positions: [], trades: [], summary: null };
  }

  const account: CompetitionAccount = {
    cash: Number(accountRow.cash),
    startingBalance: Number(accountRow.starting_balance),
    firstTradeAt: accountRow.first_trade_at,
    createdAt: accountRow.created_at,
  };

  const [{ data: positionRows }, { data: tradeRows }] = await Promise.all([
    supabase
      .from("competition_position")
      .select("ticker, shares, avg_cost")
      .eq("user_id", userId)
      .eq("month", month),
    supabase
      .from("competition_trade")
      .select("id, ticker, side, shares, price, executed_at")
      .eq("user_id", userId)
      .eq("month", month)
      .order("executed_at", { ascending: false })
      .limit(200),
  ]);

  const rawPositions: CompetitionPosition[] = (positionRows ?? []).map((p) => ({
    ticker: p.ticker,
    shares: Number(p.shares),
    avgCost: Number(p.avg_cost),
  }));
  const positions = await buildCompetitionPositionViews(rawPositions);
  const summary = computeCompetitionSummary(account, positions);

  const trades: CompetitionTrade[] = (tradeRows ?? []).map((t) => ({
    id: t.id,
    ticker: t.ticker,
    side: t.side as "buy" | "sell",
    shares: Number(t.shares),
    price: Number(t.price),
    executedAt: t.executed_at,
  }));

  return { account, positions, trades, summary };
}
