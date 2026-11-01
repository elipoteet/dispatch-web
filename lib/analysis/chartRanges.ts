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

// —— The eight ranges (phase nine, stage 3) ——
// Where each one's points come from. Daily and weekly ship with the page (one
// Twelve Data request per company per day, cached); intraday and monthly are
// fetched by the browser only when their range is clicked.
export type RangeId = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y" | "10Y" | "MAX";

export type RangeSpec = {
  id: RangeId;
  source: "intraday" | "daily" | "weekly" | "monthly";
  // How many of that source's most recent points the range shows (sessions
  // for intraday). Absent: all of them.
  take?: number;
  // How far back the range reaches, in calendar days, for the "since" label
  // and for deciding whether earnings markers cover it.
  spanDays?: number;
  earnings: boolean;
};

export const RANGES: RangeSpec[] = [
  { id: "1D", source: "intraday", take: 1, earnings: false },
  { id: "1W", source: "intraday", take: 5, earnings: false },
  { id: "1M", source: "daily", take: 21, spanDays: 31, earnings: false },
  { id: "3M", source: "daily", take: 63, spanDays: 92, earnings: true },
  { id: "1Y", source: "daily", take: 252, spanDays: 366, earnings: true },
  { id: "5Y", source: "weekly", take: 261, spanDays: 5 * 366, earnings: true },
  // Ten years of quarterly markers is 40 dots on one line, and for most
  // companies the SEC's recent-filings index doesn't reach back that far.
  { id: "10Y", source: "weekly", take: 522, spanDays: 10 * 366, earnings: false },
  { id: "MAX", source: "monthly", earnings: false },
];

// Daily closes reduced to one point a week: the last session of each week.
// Five years of daily points is ~1,260; weekly is ~260, which draws the same
// shape at a fifth of the size the page has to carry.
export function toWeekly(points: ChartPoint[]): ChartPoint[] {
  const out: ChartPoint[] = [];
  let lastKey = "";
  for (const p of points) {
    const key = weekKey(p.date);
    if (key === lastKey) out[out.length - 1] = p;
    else out.push(p);
    lastKey = key;
  }
  return out;
}

// The Monday of the week containing a "YYYY-MM-DD" date, as a key.
function weekKey(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

// Intraday 5-minute bars thinned to one per `minutes`: the last bar of each
// block. Used for 1W, where five sessions of 5-minute bars (390 points) would
// be needlessly dense.
export function thinIntraday(points: ChartPoint[], minutes: number): ChartPoint[] {
  const out: ChartPoint[] = [];
  let lastKey = "";
  for (const p of points) {
    const [day, time = "00:00"] = p.date.split(" ");
    const [h, m] = time.split(":").map(Number);
    const key = `${day}-${Math.floor((h * 60 + m) / minutes)}`;
    if (key === lastKey) out[out.length - 1] = p;
    else out.push(p);
    lastKey = key;
  }
  return out;
}

// —— When intraday prices are worth fetching again ——
// A cache bucket for the intraday request, from the time in New York. While
// the market is open (weekdays 9:30 to 4:15, allowing for late final bars) it
// changes every five minutes, matching the 5-minute bars, so a chart someone
// is watching refreshes at most once a bar. Outside those hours it changes only
// twice a day (before the open, after the close), so a closed market costs one
// request per company per half-day at most, and only while someone looks.
// Market holidays aren't known here: on one, the open-hours bucket still turns
// every five minutes, which costs a little quota and nothing else.
export function intradayCacheBucket(now: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const open = 9 * 60 + 30;
  const settled = 16 * 60 + 15;
  if (!weekend && minutes >= open && minutes < settled) return `${date}-open-${Math.floor(minutes / 5)}`;
  return `${date}-${minutes < open ? "pre" : "post"}`;
}

// —— Earnings markers ——
// The points to mark on a range: for each earnings date inside it, the first
// point on or after that date (the session it was reported, or for weekly
// points the week). Nothing at all when the known dates don't reach back to
// the range's start, because a line with markers on only its recent half reads
// as "no earnings before then".
export function earningsMarkers(
  points: ChartPoint[],
  earnings: { dates: string[]; completeFrom: string | null },
): ChartPoint[] {
  if (points.length < 2 || !earnings.completeFrom || earnings.dates.length === 0) return [];
  const first = points[0].date.slice(0, 10);
  const last = points[points.length - 1].date.slice(0, 10);
  if (earnings.completeFrom > first) return [];
  const marks: ChartPoint[] = [];
  for (const date of earnings.dates) {
    if (date < first || date > last) continue;
    const point = points.find((p) => p.date.slice(0, 10) >= date);
    if (point && marks[marks.length - 1] !== point) marks.push(point);
  }
  return marks;
}
