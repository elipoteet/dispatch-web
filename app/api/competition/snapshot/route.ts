import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { fetchFinnhubQuote } from "@/lib/providers";
import { isTradingDay, nyDateKey, nyMonthKey } from "@/lib/competition/marketHours";
import { checkEligibility } from "@/lib/competition/rules";
import {
  computeEquityFromPrices,
  computeInvestedRatio,
  computeReturnPct,
  rankStandings,
  type StandingCandidate,
} from "@/lib/competition/scoring";

export const runtime = "nodejs";
export const maxDuration = 60;

// Finnhub's free tier is empirically 60 requests/minute (confirmed via a
// real throttled test against the live quote endpoint, July 2026 — see the
// comment above fetchFinnhubQuote in lib/providers.ts). 1.1s keeps this
// comfortably under that even with other traffic sharing the same key,
// same margin-below-the-real-limit reasoning as the alerts cron's Twelve
// Data throttle. At that pace a single 60s Vercel Hobby invocation can
// price roughly 50 distinct tickers — fine at this feature's current
// scale; if the competition ever holds more distinct tickers than that in
// one month, this cron will need to shard across multiple invocations.
const THROTTLE_MS = 1_100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type AccountRow = {
  user_id: string;
  cash: string | number;
  starting_balance: string | number;
  first_trade_at: string | null;
};

// Vercel Cron sends a GET request with `Authorization: Bearer $CRON_SECRET`
// when CRON_SECRET is set — verified here so the endpoint can't be
// triggered by a random visitor hitting the URL. Same gate as
// app/api/cron/alerts/route.ts.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceRoleClient();
  const now = new Date();
  const today = nyDateKey(now);
  const currentMonth = nyMonthKey(now);

  // Step 1 — finalize any month that's no longer current. Naturally
  // idempotent: once a month's status flips to 'closed' it no longer
  // matches this query, so re-running the cron mid-month (or twice on the
  // same day) never re-finalizes it. The winner is whoever holds rank = 1
  // on that month's most recent standing snapshot — the last trading day
  // this cron actually scored before the month rolled over.
  const finalizedMonths: string[] = [];
  const { data: staleMonths } = await db
    .from("competition_month_status")
    .select("month")
    .neq("status", "closed")
    .lt("month", currentMonth);
  for (const { month } of staleMonths ?? []) {
    const { data: winnerRow } = await db
      .from("competition_daily_standing")
      .select("user_id")
      .eq("month", month)
      .eq("rank", 1)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    await db
      .from("competition_month_status")
      .update({
        status: "closed",
        finalized_winner_user_id: winnerRow?.user_id ?? null,
        finalized_at: new Date().toISOString(),
      })
      .eq("month", month);
    finalizedMonths.push(month);
  }

  // Step 2 — make sure the current month has a status row. onConflict +
  // ignoreDuplicates means this is a no-op every day after the first.
  await db
    .from("competition_month_status")
    .upsert({ month: currentMonth, status: "open" }, { onConflict: "month", ignoreDuplicates: true });

  if (!isTradingDay(now)) {
    return NextResponse.json({
      today,
      month: currentMonth,
      tradingDay: false,
      finalizedMonths,
      message: "Not a trading day — no standings computed.",
    });
  }

  // Step 3 — price every distinct ticker held anywhere this month, once,
  // shared across every entrant holding it. Tickers already cached for
  // today are skipped, so a manual re-run after a partial failure doesn't
  // re-spend Finnhub calls on tickers that already succeeded.
  const { data: positionRows, error: positionError } = await db
    .from("competition_position")
    .select("ticker")
    .eq("month", currentMonth);
  if (positionError) {
    console.error("[cron/competition-snapshot] failed to load positions:", positionError.message);
    return NextResponse.json({ error: "Failed to load competition positions." }, { status: 500 });
  }
  const tickers = [...new Set((positionRows ?? []).map((r) => r.ticker as string))];

  const { data: cachedRows } = await db
    .from("competition_price_cache")
    .select("ticker, price")
    .eq("snapshot_date", today);
  const prices: Record<string, number> = {};
  for (const row of cachedRows ?? []) {
    if (row.price != null) prices[row.ticker as string] = Number(row.price);
  }
  const toFetch = tickers.filter((t) => !(t in prices));

  let pricedCount = 0;
  let failedTickers = 0;
  for (let i = 0; i < toFetch.length; i++) {
    const ticker = toFetch[i];
    try {
      const price = await fetchFinnhubQuote(ticker);
      if (price != null) {
        prices[ticker] = price;
        pricedCount++;
        const { error: cacheError } = await db
          .from("competition_price_cache")
          .upsert({ ticker, snapshot_date: today, price }, { onConflict: "ticker,snapshot_date" });
        if (cacheError) {
          console.error(`[cron/competition-snapshot] failed to cache price for ${ticker}:`, cacheError.message);
        }
      } else {
        failedTickers++;
        console.error(`[cron/competition-snapshot] no price returned for ${ticker}`);
      }
    } catch (err) {
      failedTickers++;
      console.error(
        `[cron/competition-snapshot] failed to price ${ticker}:`,
        err instanceof Error ? err.message : err,
      );
    }
    if (i < toFetch.length - 1) await sleep(THROTTLE_MS);
  }

  // Step 4 — compute today's standing for every account active this
  // month. Loaded in bulk (rather than per-user) since every user's row
  // set is small and this keeps the cron to a handful of queries total.
  const [{ data: accountRows }, { data: allPositions }, { data: allTrades }, { data: priorStandings }] =
    await Promise.all([
      db
        .from("competition_account")
        .select("user_id, cash, starting_balance, first_trade_at")
        .eq("month", currentMonth),
      db.from("competition_position").select("user_id, ticker, shares").eq("month", currentMonth),
      db.from("competition_trade").select("user_id, ticker").eq("month", currentMonth),
      db
        .from("competition_daily_standing")
        .select("user_id, invested_ratio")
        .eq("month", currentMonth)
        .lt("snapshot_date", today),
    ]);

  const positionsByUser = new Map<string, { ticker: string; shares: number }[]>();
  for (const p of allPositions ?? []) {
    const list = positionsByUser.get(p.user_id as string) ?? [];
    list.push({ ticker: p.ticker as string, shares: Number(p.shares) });
    positionsByUser.set(p.user_id as string, list);
  }

  const tradesByUser = new Map<string, string[]>();
  for (const t of allTrades ?? []) {
    const list = tradesByUser.get(t.user_id as string) ?? [];
    list.push(t.ticker as string);
    tradesByUser.set(t.user_id as string, list);
  }

  const priorParticipationByUser = new Map<string, { investedRatio: number }[]>();
  for (const s of priorStandings ?? []) {
    const list = priorParticipationByUser.get(s.user_id as string) ?? [];
    list.push({ investedRatio: Number(s.invested_ratio) });
    priorParticipationByUser.set(s.user_id as string, list);
  }

  type StandingUpsert = {
    month: string;
    user_id: string;
    snapshot_date: string;
    equity: number;
    return_pct: number;
    invested_ratio: number;
    trade_count: number;
    eligible: boolean;
    rank: number | null;
    computed_at: string;
  };

  const standingsToUpsert: StandingUpsert[] = [];
  const candidates: StandingCandidate[] = [];
  let usersSkipped = 0;

  for (const account of (accountRows ?? []) as AccountRow[]) {
    const userId = account.user_id;
    const cash = Number(account.cash);
    const startingBalance = Number(account.starting_balance);
    const positions = positionsByUser.get(userId) ?? [];

    const equity = computeEquityFromPrices(cash, positions, prices);
    if (equity == null) {
      usersSkipped++;
      console.error(`[cron/competition-snapshot] skipping ${userId}: missing today's price for a held ticker`);
      continue;
    }

    const investedRatio = computeInvestedRatio(cash, equity);
    const returnPct = computeReturnPct(equity, startingBalance);
    const tickerHistory = tradesByUser.get(userId) ?? [];
    const tradeCount = tickerHistory.length;
    const distinctTickerCount = new Set(tickerHistory).size;
    const dailyParticipation = [...(priorParticipationByUser.get(userId) ?? []), { investedRatio }];

    const { eligible } = checkEligibility({ tradeCount, distinctTickerCount, dailyParticipation });

    standingsToUpsert.push({
      month: currentMonth,
      user_id: userId,
      snapshot_date: today,
      equity,
      return_pct: returnPct,
      invested_ratio: investedRatio,
      trade_count: tradeCount,
      eligible,
      rank: null,
      computed_at: new Date().toISOString(),
    });
    candidates.push({ userId, eligible, returnPct, firstTradeAt: account.first_trade_at });
  }

  // Step 5 — rank only after every entrant's standing for today is known,
  // since rank is relative across the whole field. Merged into the same
  // rows before the (single) upsert rather than a second update pass.
  const ranks = rankStandings(candidates);
  for (const row of standingsToUpsert) {
    row.rank = ranks.get(row.user_id) ?? null;
  }

  if (standingsToUpsert.length) {
    const { error: standingError } = await db
      .from("competition_daily_standing")
      .upsert(standingsToUpsert, { onConflict: "month,user_id,snapshot_date" });
    if (standingError) {
      console.error("[cron/competition-snapshot] failed to upsert standings:", standingError.message);
      return NextResponse.json({ error: "Failed to write standings." }, { status: 500 });
    }
  }

  return NextResponse.json({
    today,
    month: currentMonth,
    tradingDay: true,
    finalizedMonths,
    tickersPriced: pricedCount,
    tickersCached: tickers.length - toFetch.length,
    tickersFailed: failedTickers,
    usersScored: standingsToUpsert.length,
    usersSkipped,
  });
}
