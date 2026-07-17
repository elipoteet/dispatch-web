// Shared computation for the paper-trading routes — mark-to-market pricing,
// account summary math, and equity-curve snapshotting. Ported from the
// original's computePortfolioValue()/renderPortfolio(), minus the DOM
// writes and localStorage.

import { getDb } from "./db";
import { withCache } from "./cache";
import { fetchQuotePrice } from "./providers";

type Db = Awaited<ReturnType<typeof getDb>>;

const QUOTE_TTL_MS = 60 * 1000;

// Latest tradable price for a ticker — short-TTL cache since this backs
// both trade execution and mark-to-market display.
export async function getLatestPrice(ticker: string): Promise<number> {
  return withCache(`quote:${ticker}`, QUOTE_TTL_MS, () => fetchQuotePrice(ticker));
}

export type Position = { ticker: string; shares: number; avgCost: number };
export type PositionView = Position & {
  currentPrice: number;
  isStale: boolean;
  marketValue: number;
  costBasis: number;
  unrealizedPL: number;
  unrealizedPLPct: number;
};

export type Account = { cash: number; startingCash: number; createdAt: string };
export type Summary = {
  cash: number;
  positionsValue: number;
  totalValue: number;
  costBasis: number;
  unrealizedPL: number;
  startingCash: number;
  totalReturnPct: number;
};

// Fetches a live quote per held position; falls back to avg cost (marked
// stale) if the quote fails, same graceful-degrade the original had for
// tickers with no cached price yet.
export async function buildPositionViews(positions: Position[]): Promise<PositionView[]> {
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
      const unrealizedPL = marketValue - costBasis;
      return {
        ...p,
        currentPrice,
        isStale,
        marketValue,
        costBasis,
        unrealizedPL,
        unrealizedPLPct: ((currentPrice - p.avgCost) / p.avgCost) * 100,
      };
    }),
  );
}

export function computeSummary(account: Account, positions: PositionView[]): Summary {
  const positionsValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const costBasis = positions.reduce((sum, p) => sum + p.costBasis, 0);
  const totalValue = account.cash + positionsValue;
  return {
    cash: account.cash,
    positionsValue,
    totalValue,
    costBasis,
    unrealizedPL: positionsValue - costBasis,
    startingCash: account.startingCash,
    totalReturnPct: ((totalValue - account.startingCash) / account.startingCash) * 100,
  };
}

async function getTodaySnapshotId(supabase: Db, userId: string): Promise<string | null> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("equity_snapshot")
    .select("id")
    .eq("user_id", userId)
    .gte("snapshot_at", startOfDay.toISOString())
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// Writes today's equity snapshot if one doesn't already exist (UTC day
// granularity) — "one snapshot per day, latest wins" like the original,
// just anchored server-side instead of to the visitor's local clock. Used
// on portfolio page load, where we don't want to force a fresh SPY quote
// if today's value is already recorded.
export async function snapshotEquityIfNeeded(supabase: Db, userId: string, totalValue: number): Promise<void> {
  const id = await getTodaySnapshotId(supabase, userId);
  if (id) return;

  let spyPrice: number | null = null;
  try {
    spyPrice = await getLatestPrice("SPY");
  } catch {
    // Benchmark is best-effort; the portfolio value line still gets recorded.
  }

  await supabase.from("equity_snapshot").insert({ user_id: userId, value: totalValue, spy_price: spyPrice });
}

// Always brings today's snapshot in line with the post-trade value — called
// right after a buy/sell so the equity curve reflects the trade immediately
// instead of waiting for the next page load.
export async function upsertTodayEquitySnapshot(supabase: Db, userId: string, totalValue: number): Promise<void> {
  const id = await getTodaySnapshotId(supabase, userId);
  if (id) {
    await supabase.from("equity_snapshot").update({ value: totalValue }).eq("id", id);
    return;
  }
  let spyPrice: number | null = null;
  try {
    spyPrice = await getLatestPrice("SPY");
  } catch {
    // Benchmark is best-effort.
  }
  await supabase.from("equity_snapshot").insert({ user_id: userId, value: totalValue, spy_price: spyPrice });
}

export type Transaction = {
  id: string;
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  executedAt: string;
};

export type PortfolioState = {
  account: Account | null;
  positions: PositionView[];
  transactions: Transaction[];
  summary: Summary | null;
};

// Loads everything the Holdings/Activity/Settings tabs need in one shot,
// and opportunistically writes today's equity snapshot while we're here.
export async function loadPortfolioState(supabase: Db, userId: string): Promise<PortfolioState> {
  const { data: accountRow } = await supabase
    .from("paper_account")
    .select("cash, starting_cash, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!accountRow) {
    return { account: null, positions: [], transactions: [], summary: null };
  }

  const account: Account = {
    cash: Number(accountRow.cash),
    startingCash: Number(accountRow.starting_cash),
    createdAt: accountRow.created_at,
  };

  const [{ data: positionRows }, { data: txnRows }] = await Promise.all([
    supabase.from("paper_position").select("ticker, shares, avg_cost").eq("user_id", userId),
    supabase
      .from("paper_transaction")
      .select("id, ticker, side, shares, price, executed_at")
      .eq("user_id", userId)
      .order("executed_at", { ascending: false })
      .limit(200),
  ]);

  const rawPositions: Position[] = (positionRows ?? []).map((p) => ({
    ticker: p.ticker,
    shares: Number(p.shares),
    avgCost: Number(p.avg_cost),
  }));
  const positions = await buildPositionViews(rawPositions);
  const summary = computeSummary(account, positions);

  await snapshotEquityIfNeeded(supabase, userId, summary.totalValue);

  const transactions: Transaction[] = (txnRows ?? []).map((t) => ({
    id: t.id,
    ticker: t.ticker,
    side: t.side as "buy" | "sell",
    shares: Number(t.shares),
    price: Number(t.price),
    executedAt: t.executed_at,
  }));

  return { account, positions, transactions, summary };
}
