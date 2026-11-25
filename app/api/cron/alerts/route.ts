import { NextResponse } from "next/server";
import { refuseCron } from "@/lib/cron";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getDailyHistory } from "@/lib/analysis/tickerChart";
import { latestSession } from "@/lib/analysis/sessions";
import { detectAlerts, type TickerState } from "@/lib/analysis/alertState";
import { decide, stateFromCloses, type Decision } from "@/lib/alerts/decide";
import { asPriceCaller } from "@/lib/prices/budget";
import { refreshInsiders } from "@/lib/sec/insiders";
import { refreshFilingChanges } from "@/lib/sec/filingChanges";

export const runtime = "nodejs";
export const maxDuration = 60;

// The nightly alerts job, one step per request (fix/price-credits, 25
// November 2026). It used to be one Vercel cron request at 21:30 UTC doing
// every watched ticker, eight seconds apart, then the SEC refreshes, all
// inside 60 seconds. With twelve tickers that's 96 seconds, so the last
// tickers were never reached (four hadn't been checked since August), and by
// 21:30 the day's Twelve Data credits were long gone.
//
// Now a GitHub Actions schedule (.github/workflows/alerts.yml, 00:23 UTC,
// just after Twelve Data's credits reset and with the US session settled)
// runs scripts/alerts/run.mjs, which asks this route for:
//
//   ?step=list                 the watched tickers
//   ?step=ticker&ticker=AAPL   one ticker: a few seconds, so no time limit
//                              matters however many tickers there are
//   ?step=sec                  the SEC refreshes, with the minute to themselves
//
// Add &dry=1 to compute and report without writing anything.
//
// Prices come from the research pages' own cache (getDailyHistory), so a
// ticker someone opened after the close costs nothing, and the requests that
// are made count against the alerts job's share of the day's credits, not
// the visitors' (lib/prices/budget.ts).

const SEC_DEADLINE_MS = 50_000;
const COMPARISON_RESERVE_MS = 12_000;

type TickerSnapshotRow = {
  ticker: string;
  rsi_state: string | null;
  ma_state: string | null;
  checked_at: string | null;
};

// ticker_snapshot.rating is NOT NULL (0002_alerts.sql), but ratings were
// removed on 30 October 2026. Rather than alter a live table, every row gets
// this fixed value, and nothing reads the column any more.
const RATING_RETIRED = "retired";

type Db = ReturnType<typeof createServiceRoleClient>;

async function listTickers(db: Db): Promise<string[] | null> {
  const { data, error } = await db.from("watchlist").select("ticker");
  if (error) {
    console.error("[cron/alerts] failed to load watchlists:", error.message);
    return null;
  }
  return [...new Set((data ?? []).map((r) => String(r.ticker)))].sort();
}

export type TickerReport = {
  ticker: string;
  dry: boolean;
  through: string | null;
  current: TickerState | null;
  previous: { state: TickerState; checkedAt: string } | null;
  decision: Decision | { outcome: "no prices" };
  // In a dry run: what the old job would have sent, comparing with the
  // stored state however old it is.
  oldRuleWouldSend?: { type: string; oldValue: string; newValue: string }[];
  written: { events: number; stamped: boolean };
};

async function checkTicker(db: Db, ticker: string, dry: boolean): Promise<TickerReport> {
  const now = new Date();
  const history = await asPriceCaller("alerts", () => getDailyHistory(ticker, now));
  const { data: row } = await db
    .from("ticker_snapshot")
    .select("ticker, rsi_state, ma_state, checked_at")
    .eq("ticker", ticker)
    .maybeSingle<TickerSnapshotRow>();
  const previous =
    row && row.checked_at
      ? { state: { rsiState: row.rsi_state, maState: row.ma_state } as TickerState, checkedAt: row.checked_at }
      : null;

  const report: TickerReport = { ticker, dry, through: null, current: null, previous, decision: { outcome: "no prices" }, written: { events: 0, stamped: false } };
  if (!history) return report;

  const current = stateFromCloses(history.bars.map((b) => b.close));
  // The last stored prices (history.current false) always end before the
  // latest session, so decide() calls them stale.
  const decision = decide({ through: history.through, now, previous, current });
  Object.assign(report, { through: history.through, current, decision });
  if (dry) {
    report.oldRuleWouldSend = previous ? detectAlerts(previous.state, current) : [];
    return report;
  }
  if (decision.outcome === "stale") return report;

  if (decision.outcome === "compared" && decision.alerts.length > 0) {
    const { error } = await db
      .from("alert_event")
      .insert(decision.alerts.map((a) => ({ ticker, type: a.type, old_value: a.oldValue, new_value: a.newValue })));
    if (error) console.error(`[cron/alerts] failed to insert alert_event for ${ticker}:`, error.message);
    else report.written.events = decision.alerts.length;
  }
  const { error: upsertError } = await db.from("ticker_snapshot").upsert(
    { ticker, rating: RATING_RETIRED, rsi_state: current.rsiState, ma_state: current.maState, checked_at: now.toISOString() },
    { onConflict: "ticker" },
  );
  if (upsertError) console.error(`[cron/alerts] failed to upsert ticker_snapshot for ${ticker}:`, upsertError.message);
  else report.written.stamped = true;
  return report;
}

// New insider filings for every company whose Insiders tab has been opened,
// then a new 10-K's risk factors compared for every company whose Filings tab
// has been, in what's left of the minute.
async function refreshSec() {
  const deadline = Date.now() + SEC_DEADLINE_MS;
  const insiders = await refreshInsiders(deadline - COMPARISON_RESERVE_MS).catch((err: unknown) => {
    console.error("[cron/alerts] insider refresh failed:", err instanceof Error ? err.message : err);
    return { companies: 0, filings: 0 };
  });
  const riskReports = await refreshFilingChanges(deadline, COMPARISON_RESERVE_MS).catch((err: unknown) => {
    console.error("[cron/alerts] filing-changes refresh failed:", err instanceof Error ? err.message : err);
    return 0;
  });
  console.log(
    `[cron/alerts] insiders: ${insiders.filings} new filings across ${insiders.companies} companies; risk factors compared for ${riskReports} new annual reports`,
  );
  return { insiders, riskReports };
}

// The caller sends `Authorization: Bearer $CRON_SECRET`, checked in
// refuseCron (lib/cron.ts), which also refuses on any preview deployment.
export async function GET(request: Request) {
  const refused = refuseCron(request);
  if (refused) return refused;
  const params = new URL(request.url).searchParams;
  const step = params.get("step");
  const dry = params.get("dry") === "1";
  const db = createServiceRoleClient();

  if (step === "list") {
    const tickers = await listTickers(db);
    if (!tickers) return NextResponse.json({ error: "Failed to load watchlists." }, { status: 500 });
    return NextResponse.json({ latestSession: latestSession(new Date()), tickers });
  }
  if (step === "ticker") {
    const ticker = (params.get("ticker") ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9.\-]{1,10}$/.test(ticker)) return NextResponse.json({ error: "Missing or invalid ticker." }, { status: 400 });
    try {
      return NextResponse.json(await checkTicker(db, ticker, dry));
    } catch (err) {
      console.error(`[cron/alerts] failed to check ${ticker}:`, err instanceof Error ? err.message : err);
      return NextResponse.json({ ticker, error: "Check failed." }, { status: 500 });
    }
  }
  if (step === "sec") {
    if (dry) return NextResponse.json({ skipped: "The SEC refreshes write to the database, so a dry run leaves them out." });
    return NextResponse.json(await refreshSec());
  }
  return NextResponse.json({ error: "Use ?step=list, ?step=ticker&ticker=SYMBOL or ?step=sec." }, { status: 400 });
}
