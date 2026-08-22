// Alerts, v1 — free for every signed-in user. Pure decision logic for the nightly cron job
// (app/api/cron/alerts/route.ts). No I/O here, same split as
// compare.ts/fundamentalsChange.ts: the cron route does the fetching/DB
// work and calls into these functions to decide what changed.

export type RsiState = "overbought" | "neutral" | "oversold";

// Same >70/<30 thresholds already used (as inline prose logic) in
// lib/analysis/report.ts's technicals section — just returned as a state
// instead of prose.
export function rsiState(rsiVal: number | null): RsiState | null {
  if (rsiVal == null) return null;
  if (rsiVal > 70) return "overbought";
  if (rsiVal < 30) return "oversold";
  return "neutral";
}

export type MaState = "golden" | "death" | "none";

export function maState(ma50: number | null, ma200: number | null): MaState | null {
  if (ma50 == null || ma200 == null) return null;
  if (ma50 > ma200) return "golden";
  if (ma50 < ma200) return "death";
  return "none";
}

export type TickerState = {
  rating: string;
  rsiState: RsiState | null;
  maState: MaState | null;
};

export type AlertType = "score_change" | "rsi" | "ma_cross";
export type DetectedAlert = { type: AlertType; oldValue: string; newValue: string };

// Reserved ticker value for the AI daily digest's one shared "what
// happened in the market today" row (see dispatch-ai-digest-plan.md,
// app/api/cron/alerts/route.ts, supabase/migrations/0005_ai_digest.sql) —
// can never collide with a real stock symbol, since every real ticker in
// this app is uppercase-only. Shared here (rather than defined separately
// in the cron route and again in AlertBell.tsx) so both sides can never
// drift out of sync with each other or with the matching RLS policy.
export const MARKET_TICKER = "__market__";

// Diffs today's computed state against yesterday's stored state. `previous
// === null` means this ticker has never been checked before — that's a
// baseline being established, not a change, so it must never produce an
// alert (otherwise every ticker would "alert" the first time anyone
// watches it).
export function detectAlerts(previous: TickerState | null, current: TickerState): DetectedAlert[] {
  if (!previous) return [];

  const alerts: DetectedAlert[] = [];

  if (previous.rating !== current.rating) {
    alerts.push({ type: "score_change", oldValue: previous.rating, newValue: current.rating });
  }

  // Only fires when RSI *enters* overbought/oversold from something else —
  // "crosses into," per the plan, not "is currently in" or "leaves."
  if (
    current.rsiState &&
    current.rsiState !== "neutral" &&
    current.rsiState !== previous.rsiState
  ) {
    alerts.push({ type: "rsi", oldValue: previous.rsiState ?? "unknown", newValue: current.rsiState });
  }

  // Only fires on an actual crossover (state becomes golden or death and
  // differs from before) — "none" (ma50 === ma200, or missing data) never
  // itself fires.
  if (
    current.maState &&
    current.maState !== "none" &&
    current.maState !== previous.maState
  ) {
    alerts.push({ type: "ma_cross", oldValue: previous.maState ?? "unknown", newValue: current.maState });
  }

  return alerts;
}
