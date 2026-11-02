import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadReport } from "@/lib/analysis/loadReport";
import { detectAlerts, maState, rsiState, type TickerState } from "@/lib/analysis/alertState";
import { refreshInsiders } from "@/lib/sec/insiders";
import { refreshFilingChanges } from "@/lib/sec/filingChanges";

export const runtime = "nodejs";
export const maxDuration = 60;

// Twelve Data's free tier is 8 requests/minute (AGENTS.md gotcha #3) — one
// ticker costs one fresh call to it (fetchPrices, via loadReport), so
// spacing iterations at 8s keeps us at 7.5/min, leaving a little headroom
// for concurrent visitor traffic sharing the same quota.
const THROTTLE_MS = 8_000;

// Twenty of the sixty seconds: about 130 Form 4s at the SEC's pace.
const INSIDER_BUDGET_MS = 20_000;
// Fifteen more for comparing a new 10-K's risk factors: one or two reports.
const FILING_CHANGES_BUDGET_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TickerSnapshotRow = {
  ticker: string;
  rsi_state: string | null;
  ma_state: string | null;
};

// ticker_snapshot.rating is NOT NULL (0002_alerts.sql), but ratings were
// removed on 30 October 2026. Rather than alter a live table, every row gets
// this fixed value, and nothing reads the column any more.
const RATING_RETIRED = "retired";

// Vercel Cron sends a GET request with `Authorization: Bearer $CRON_SECRET`
// when CRON_SECRET is set — verified here so the endpoint can't be
// triggered by a random visitor hitting the URL.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceRoleClient();

  // Step 0 — new insider filings (phase nine, stage 6) for every company whose
  // Insiders tab has been opened, folded into this cron rather than adding
  // another (the brief's rule). Its own time budget, so the alert checks
  // below still get theirs within the minute this function has.
  const insiders = await refreshInsiders(INSIDER_BUDGET_MS).catch((err: unknown) => {
    console.error("[cron/alerts] insider refresh failed:", err instanceof Error ? err.message : err);
    return { companies: 0, filings: 0 };
  });
  console.log(`[cron/alerts] insiders: ${insiders.filings} new filings across ${insiders.companies} companies`);

  // Step 0b — a new 10-K's risk factors compared with the year before's
  // (phase nine, stage 7), for companies whose Filings tab has been opened.
  // Rare (once a year a company) but heavy, so it gets its own small budget.
  const riskReports = await refreshFilingChanges(FILING_CHANGES_BUDGET_MS).catch((err: unknown) => {
    console.error("[cron/alerts] filing-changes refresh failed:", err instanceof Error ? err.message : err);
    return 0;
  });
  if (riskReports) console.log(`[cron/alerts] compared ${riskReports} new annual reports' risk factors`);

  // Step 1 — distinct tickers across every watchlist. Alerts are free for
  // everyone, so there's no subscriber filter here.
  const { data: watchRows, error: watchError } = await db.from("watchlist").select("ticker");
  if (watchError) {
    console.error("[cron/alerts] failed to load watchlists:", watchError.message);
    return NextResponse.json({ error: "Failed to load watchlists." }, { status: 500 });
  }
  const tickers = [...new Set((watchRows ?? []).map((r) => r.ticker as string))];
  if (!tickers.length) {
    return NextResponse.json({ checked: 0, events: 0, insiders });
  }

  let eventCount = 0;

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    try {
      // Step 2 — compute today's state.
      const { report } = await loadReport(ticker, null);
      const current: TickerState = {
        rsiState: rsiState(report.snapshot.rsiVal),
        maState: maState(report.snapshot.ma50, report.snapshot.ma200),
      };

      // Step 3 — compare against yesterday.
      const { data: prevRow } = await db
        .from("ticker_snapshot")
        .select("ticker, rsi_state, ma_state")
        .eq("ticker", ticker)
        .maybeSingle<TickerSnapshotRow>();
      const previous: TickerState | null = prevRow
        ? {
            rsiState: prevRow.rsi_state as TickerState["rsiState"],
            maState: prevRow.ma_state as TickerState["maState"],
          }
        : null;

      // Step 4 — log events. No separate "fan out" step: the alert_event
      // RLS policy already scopes visibility to anyone watching this
      // ticker at read time, via their own watchlist — see
      // supabase/migrations/0002_alerts.sql.
      const alerts = detectAlerts(previous, current);
      if (alerts.length) {
        const { error: insertError } = await db.from("alert_event").insert(
          alerts.map((a) => ({ ticker, type: a.type, old_value: a.oldValue, new_value: a.newValue })),
        );
        if (insertError) {
          console.error(`[cron/alerts] failed to insert alert_event for ${ticker}:`, insertError.message);
        } else {
          eventCount += alerts.length;
        }
      }

      const { error: upsertError } = await db.from("ticker_snapshot").upsert(
        {
          ticker,
          rating: RATING_RETIRED,
          rsi_state: current.rsiState,
          ma_state: current.maState,
          checked_at: new Date().toISOString(),
        },
        { onConflict: "ticker" },
      );
      if (upsertError) {
        console.error(`[cron/alerts] failed to upsert ticker_snapshot for ${ticker}:`, upsertError.message);
      }
    } catch (err) {
      // One bad/delisted ticker must not kill the whole run — log and move
      // on, same best-effort principle as handleCompareToToday's fetch.
      console.error(`[cron/alerts] failed to check ${ticker}:`, err instanceof Error ? err.message : err);
    }

    if (i < tickers.length - 1) await sleep(THROTTLE_MS);
  }

  return NextResponse.json({ checked: tickers.length, events: eventCount, insiders });
}
