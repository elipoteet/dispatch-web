import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadReport } from "@/lib/analysis/loadReport";
import { detectAlerts, maState, rsiState, type TickerState } from "@/lib/analysis/alertState";

export const runtime = "nodejs";
export const maxDuration = 60;

// Twelve Data's free tier is 8 requests/minute (AGENTS.md gotcha #3) — one
// ticker costs one fresh call to it (fetchPrices, via loadReport), so
// spacing iterations at 8s keeps us at 7.5/min, leaving a little headroom
// for concurrent visitor traffic sharing the same quota.
const THROTTLE_MS = 8_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TickerSnapshotRow = {
  ticker: string;
  rating: string;
  rsi_state: string | null;
  ma_state: string | null;
};

// Vercel Cron sends a GET request with `Authorization: Bearer $CRON_SECRET`
// when CRON_SECRET is set — verified here so the endpoint can't be
// triggered by a random visitor hitting the URL.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceRoleClient();

  // Step 1 — distinct tickers across every watchlist. Alerts are free for
  // everyone, so there's no subscriber filter here.
  const { data: watchRows, error: watchError } = await db.from("watchlist").select("ticker");
  if (watchError) {
    console.error("[cron/alerts] failed to load watchlists:", watchError.message);
    return NextResponse.json({ error: "Failed to load watchlists." }, { status: 500 });
  }
  const tickers = [...new Set((watchRows ?? []).map((r) => r.ticker as string))];
  if (!tickers.length) {
    return NextResponse.json({ checked: 0, events: 0 });
  }

  let eventCount = 0;

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    try {
      // Step 2 — compute today's state.
      const { report } = await loadReport(ticker, null);
      const current: TickerState = {
        rating: report.rating,
        rsiState: rsiState(report.snapshot.rsiVal),
        maState: maState(report.snapshot.ma50, report.snapshot.ma200),
      };

      // Step 3 — compare against yesterday.
      const { data: prevRow } = await db
        .from("ticker_snapshot")
        .select("ticker, rating, rsi_state, ma_state")
        .eq("ticker", ticker)
        .maybeSingle<TickerSnapshotRow>();
      const previous: TickerState | null = prevRow
        ? {
            rating: prevRow.rating,
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
          rating: current.rating,
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

  return NextResponse.json({ checked: tickers.length, events: eventCount });
}
