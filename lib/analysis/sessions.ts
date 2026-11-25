// US trading sessions, for deciding when a company's daily prices are due a
// refresh and whether the prices in hand are the latest. Pure.
//
// A session counts as finished at 5 pm New York time on a trading day: the
// market closes at 4, and an hour later the day's closing prices are settled
// at the data provider. Until then the latest finished session is the one
// before. So on a Saturday, a Sunday or a Monday morning the latest finished
// session is Friday's, and a company's prices fetched on Friday evening are
// still the latest ones (fix/price-credits, 25 November 2026).

import { newYorkClock } from "@/lib/analysis/chartRanges";

const SETTLED_MINUTES = 17 * 60;

// NYSE full-day closures. A year missing from this list only costs a little:
// its holidays are treated as sessions, so on a holiday each company's prices
// are fetched once more (and come back unchanged), and the alerts job sees no
// new session that night and checks nothing. Extend it each December from
// nyse.com/markets/hours-calendars.
const HOLIDAYS = new Set([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isTradingDay(date: string): boolean {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6 && !HOLIDAYS.has(date);
}

// The trading day before `date` ("YYYY-MM-DD").
export function previousSession(date: string): string {
  let d = addDays(date, -1);
  while (!isTradingDay(d)) d = addDays(d, -1);
  return d;
}

// The latest session whose closing prices are settled at `now`.
export function latestSession(now: Date): string {
  const { date, minutes } = newYorkClock(now);
  if (isTradingDay(date) && minutes >= SETTLED_MINUTES) return date;
  return previousSession(date);
}

// How many sessions finished after `from` up to and including `to`: 0 when
// `from` is `to` (or later), 1 when `to` is the next session, and so on.
export function sessionsBetween(from: string, to: string): number {
  let n = 0;
  for (let d = to; d > from; d = previousSession(d)) n++;
  return n;
}
