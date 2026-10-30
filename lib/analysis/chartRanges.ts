// The ticker chart's shared shape and range maths, in its own dependency-free
// module for the same reason TICKER_PATTERN has one (see lib/ticker.ts): both
// the server (lib/analysis/tickerChart.ts) and the browser (the ticker
// page's chart component) need these, and tickerChart.ts imports
// next/cache and the provider layer — which holds the API keys and must never
// be reachable from a client component.

export type ChartPoint = { date: string; close: number };

// Daily rows carry a "YYYY-MM-DD" date; intraday rows carry a full
// "YYYY-MM-DD HH:MM:SS" timestamp. Grouping on the date half is what makes
// "1 day" mean the latest *session* rather than the last 24 hours — so the 1D
// chart still shows Friday's full session on a Saturday, instead of an empty
// window.
export function takeRecentSessions(points: ChartPoint[], sessions: number): ChartPoint[] {
  const days = [...new Set(points.map((p) => p.date.slice(0, 10)))];
  const keep = new Set(days.slice(-sessions));
  return points.filter((p) => keep.has(p.date.slice(0, 10)));
}
