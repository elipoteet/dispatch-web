import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadReport } from "@/lib/analysis/loadReport";
import { detectAlerts, maState, MARKET_TICKER, rsiState, type TickerState } from "@/lib/analysis/alertState";
import { writeDigest } from "@/lib/analysis/digest";
import { fetchGeneralNews, fetchNews } from "@/lib/providers";
import { nyDateKey } from "@/lib/competition/marketHours";

export const runtime = "nodejs";
export const maxDuration = 60;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type Db = ReturnType<typeof createServiceRoleClient>;

// True if an ai_digest row for this ticker already exists for today (NY
// calendar day) — this job can in principle be re-invoked manually
// (CRON_SECRET lets you trigger it directly), so a re-run must not write
// a second note for the same day. Mirrors the same "compare nyMonthKey/
// nyDateKey of the existing row against now" pattern already used in
// app/api/competition/profile/route.ts's once-per-month handle check.
async function digestAlreadyWrittenToday(db: Db, ticker: string): Promise<boolean> {
  const { data } = await db
    .from("alert_event")
    .select("created_at")
    .eq("ticker", ticker)
    .eq("type", "ai_digest")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Boolean(data && nyDateKey(new Date(data.created_at)) === nyDateKey());
}

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
  let digestCount = 0;

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

      // AI daily digest — a separate, independently-failing step (see
      // dispatch-ai-digest-plan.md). Never lets a digest failure undo the
      // ticker_snapshot upsert above, which must always succeed regardless.
      try {
        const news = await fetchNews(ticker);
        const freshHeadlines = (news ?? [])
          .filter((n) => Date.now() - n.datetime * 1000 < ONE_DAY_MS)
          .map((n) => n.headline);

        // Silence is correct here, not a "no notable change" filler note.
        if (alerts.length === 0 && freshHeadlines.length === 0) {
          // no-op
        } else if (await digestAlreadyWrittenToday(db, ticker)) {
          // Already wrote today's note for this ticker — a re-invocation
          // (CRON_SECRET lets this route be triggered manually) must not
          // double up.
        } else {
          const note = await writeDigest({ kind: "ticker", ticker, alerts, headlines: freshHeadlines });
          if (note) {
            const { error: digestError } = await db
              .from("alert_event")
              .insert({ ticker, type: "ai_digest", old_value: null, new_value: note });
            if (digestError) {
              console.error(`[cron/alerts] failed to insert ai_digest for ${ticker}:`, digestError.message);
            } else {
              digestCount++;
            }
          }
        }
      } catch (err) {
        console.error(`[cron/alerts] failed to write digest for ${ticker}:`, err instanceof Error ? err.message : err);
      }
    } catch (err) {
      // One bad/delisted ticker must not kill the whole run — log and move
      // on, same best-effort principle as handleCompareToToday's fetch.
      console.error(`[cron/alerts] failed to check ${ticker}:`, err instanceof Error ? err.message : err);
    }

    if (i < tickers.length - 1) await sleep(THROTTLE_MS);
  }

  // Step 5 — the one shared market-wide digest, once per run (not per
  // ticker). Same independent-failure isolation as the per-ticker digest.
  try {
    const generalNews = await fetchGeneralNews();
    if (generalNews && generalNews.length > 0) {
      if (!(await digestAlreadyWrittenToday(db, MARKET_TICKER))) {
        const note = await writeDigest({ kind: "market", headlines: generalNews.map((n) => n.headline) });
        if (note) {
          const { error: marketDigestError } = await db
            .from("alert_event")
            .insert({ ticker: MARKET_TICKER, type: "ai_digest", old_value: null, new_value: note });
          if (marketDigestError) {
            console.error("[cron/alerts] failed to insert market ai_digest:", marketDigestError.message);
          } else {
            digestCount++;
          }
        }
      }
    }
  } catch (err) {
    console.error("[cron/alerts] failed to write market digest:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ checked: tickers.length, events: eventCount, digests: digestCount });
}
