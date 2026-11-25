// What the alerts job does with one watched ticker (fix/price-credits, 25
// November 2026). Pure: app/api/cron/alerts/route.ts does the reading and
// writing.
//
// Alerts compare a ticker's state now (RSI zone, 50/200-day moving averages)
// with its state at the last check. Two rules keep them honest:
//
//   Fresh prices only. The prices must run through the latest finished
//   session (lib/analysis/sessions.ts). Anything older, such as the last
//   stored copy shown when Twelve Data is out, is skipped: no alert, and the
//   ticker isn't marked checked, so the next run tries again.
//
//   No backlog. An alert says what changed since the session before. If the
//   last check is more than two sessions back (an outage, as in November
//   2026, when some tickers hadn't been checked since August), the change
//   could have happened weeks ago; the ticker is quietly re-baselined instead,
//   and alerts resume from the next session. Two, not one, so a single missed
//   night still alerts.

import { rsi, sma } from "@/lib/analysis/indicators";
import { detectAlerts, maState, rsiState, type DetectedAlert, type TickerState } from "@/lib/analysis/alertState";
import { latestSession, sessionsBetween } from "@/lib/analysis/sessions";

export const MAX_SESSIONS_BEHIND = 2;

// The same window and formulas as the research report's technicals
// (lib/analysis/report.ts), which the job used before: five years of closes.
const WINDOW = 1300;

export function stateFromCloses(closesOldestFirst: number[]): TickerState {
  const prices = closesOldestFirst.slice(-WINDOW);
  const ma50 = sma(prices, 50).at(-1) ?? null;
  const ma200 = sma(prices, 200).at(-1) ?? null;
  return { rsiState: rsiState(rsi(prices, 14)), maState: maState(ma50, ma200) };
}

export type Previous = { state: TickerState; checkedAt: string } | null;

export type Decision =
  // Prices don't reach the latest session: do nothing at all.
  | { outcome: "stale"; through: string; latest: string }
  // Never checked: record the state, alert nothing.
  | { outcome: "baseline" }
  // Already checked for this session (weekend and holiday nights): refresh
  // the check time, alert nothing.
  | { outcome: "already checked"; lastSession: string }
  // Last check too far back: record the state, alert nothing.
  | { outcome: "re-baselined"; lastSession: string; sessionsBehind: number }
  // Compared with the session before: these alerts are new.
  | { outcome: "compared"; lastSession: string; alerts: DetectedAlert[] };

// The session a stored check saw. Checks are written only with fresh prices,
// so it's the latest session at the time of the check.
export function sessionOfCheck(checkedAt: string): string {
  return latestSession(new Date(checkedAt));
}

export function decide(input: { through: string; now: Date; previous: Previous; current: TickerState }): Decision {
  const latest = latestSession(input.now);
  if (input.through < latest) return { outcome: "stale", through: input.through, latest };
  if (!input.previous) return { outcome: "baseline" };
  const lastSession = sessionOfCheck(input.previous.checkedAt);
  const behind = sessionsBetween(lastSession, latest);
  if (behind === 0) return { outcome: "already checked", lastSession };
  if (behind > MAX_SESSIONS_BEHIND) return { outcome: "re-baselined", lastSession, sessionsBehind: behind };
  return { outcome: "compared", lastSession, alerts: detectAlerts(input.previous.state, input.current) };
}
