"use client";

import { useId, useState } from "react";
import {
  earningsMarkers,
  RANGES,
  takeRecentSessions,
  thinIntraday,
  type ChartPoint,
  type RangeId,
} from "@/lib/analysis/chartRanges";
import { formatPrice, formatSignedPct } from "@/lib/research/format";

// The Overview's price chart: a plain SVG line, no charting library, redrawn
// in place when a range is clicked (phase nine, stage 3).
//
// Where the points come from (see lib/analysis/tickerChart.ts for the cost):
//   1M, 3M, 1Y  the last year of daily closes, shipped with the page
//   5Y, 10Y     weekly closes, shipped with the page
//   1D, 1W      5-minute bars, fetched once when either is first clicked
//   MAX         monthly closes, fetched once when it is first clicked
// So only three of the eight ranges ever ask the server for anything, and each
// asks at most once per visit.

type Fetched = {
  status: "idle" | "loading" | "ready" | "busy" | "empty";
  points: ChartPoint[] | null;
  // When it last came back busy: another click within a minute won't ask
  // again, since Twelve Data's allowance is per minute.
  busyAt: number;
};

const IDLE: Fetched = { status: "idle", points: null, busyAt: 0 };

const W = 800;
const H = 220;
const PAD_Y = 10;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDate(date: string): Date {
  // Daily rows are "YYYY-MM-DD"; intraday rows carry a New York time as well,
  // which is shown as written rather than converted to the visitor's zone.
  return new Date(`${date.slice(0, 10)}T12:00:00Z`);
}

function dayLabel(date: string): string {
  const d = parseDate(date);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function monthLabel(date: string): string {
  const d = parseDate(date);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// "15:55:00" -> "4:00 PM": a 5-minute bar is stamped with its start, so the
// data runs through the end of it.
function throughTime(date: string, barMinutes: number): string {
  const [h, m] = (date.split(" ")[1] ?? "00:00").split(":").map(Number);
  const total = h * 60 + m + barMinutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
}

function xyOf(i: number, count: number, close: number, min: number, max: number) {
  const span = max - min || 1;
  return {
    x: (i / (count - 1)) * W,
    y: PAD_Y + (1 - (close - min) / span) * (H - 2 * PAD_Y),
  };
}

const HOUR_WORDS = { bmo: "before the open", amc: "after the close", dmh: "during market hours" } as const;

// A long range's move as a multiple once it's tenfold or more: "121×" reads,
// "+12014.3%" doesn't. Smaller moves stay as a percentage.
function moveLabel(pct: number): string {
  const ratio = 1 + pct / 100;
  if (ratio >= 10) return `${Math.round(ratio).toLocaleString("en-US")}×`;
  return formatSignedPct(pct, 1);
}

// Up to five dates along the bottom, worded for the range: times of day for
// 1D, days for 1W to 3M, months for 1Y, years beyond. A phone shows the ends.
function xTicks(points: ChartPoint[], range: RangeId): string[] {
  const n = points.length;
  const at = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1)));
  const unique = at.filter((v, i) => at.indexOf(v) === i);
  return unique.map((i, k) => {
    const date = points[i].date;
    const d = parseDate(date);
    const last = k === unique.length - 1;
    if (range === "1D") return throughTime(date, last ? 5 : 0);
    if (range === "1W" || range === "1M" || range === "3M") return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
    if (range === "1Y") return k === 0 || last ? monthLabel(date) : MONTHS[d.getUTCMonth()];
    return String(d.getUTCFullYear());
  });
}

// Fetches an on-demand range (1D/1W or MAX) once. Outside the component: it
// only ever runs from a click, and keeping the clock reads out here makes
// that plain to React's purity checks.
async function loadSeries(url: string, current: Fetched, set: (f: Fetched) => void) {
  if (current.status === "loading" || current.status === "ready" || current.status === "empty") return;
  if (current.status === "busy" && Date.now() - current.busyAt < 60_000) return;
  set({ ...current, status: "loading" });
  try {
    const res = await fetch(url);
    const json = res.ok ? await res.json() : null;
    const points: ChartPoint[] | null = json?.points ?? null;
    if (points && points.length >= 2) set({ status: "ready", points, busyAt: 0 });
    else if (json?.busy) set({ status: "busy", points: null, busyAt: Date.now() });
    else set({ status: "empty", points: null, busyAt: 0 });
  } catch {
    // A network blip reads like a busy provider: try again in a minute.
    set({ status: "busy", points: null, busyAt: Date.now() });
  }
}

export function PriceChart({
  symbol,
  daily,
  weekly,
  earnings,
  nextEarnings,
  previousClose,
}: {
  symbol: string;
  daily: ChartPoint[];
  weekly: ChartPoint[];
  earnings: { dates: string[]; completeFrom: string | null };
  nextEarnings: { date: string; hour: "bmo" | "amc" | "dmh" | null } | null;
  // The official previous close, the session it precedes ("YYYY-MM-DD"), and
  // that session's latest official price: the numbers the page header shows.
  previousClose: { value: number; session: string; last: number } | null;
}) {
  const titleId = useId();
  const [range, setRange] = useState<RangeId>("1Y");
  const [intraday, setIntraday] = useState<Fetched>(IDLE);
  const [monthly, setMonthly] = useState<Fetched>(IDLE);

  function select(next: RangeId) {
    setRange(next);
    const spec = RANGES.find((r) => r.id === next)!;
    if (spec.source === "intraday") loadSeries(`/api/ticker-intraday/${encodeURIComponent(symbol)}`, intraday, setIntraday);
    if (spec.source === "monthly") loadSeries(`/api/ticker-max/${encodeURIComponent(symbol)}`, monthly, setMonthly);
  }

  const spec = RANGES.find((r) => r.id === range)!;
  const fetched = spec.source === "intraday" ? intraday : spec.source === "monthly" ? monthly : null;

  let points: ChartPoint[] = [];
  if (spec.source === "daily") points = daily.slice(-(spec.take ?? daily.length));
  else if (spec.source === "weekly") points = weekly.slice(-(spec.take ?? weekly.length));
  else if (spec.source === "monthly") points = monthly.points ?? [];
  else if (intraday.points) {
    points = range === "1D" ? takeRecentSessions(intraday.points, 1) : thinIntraday(intraday.points, 30);
  }
  const ok = points.length >= 2;

  // 1D's dotted line: the official previous close when it belongs to the
  // session shown, otherwise the last bar of the session before it.
  let prevClose: number | null = null;
  // The day's move uses the header's official prices when they belong to the
  // session drawn, so the two never disagree: the last 5-minute bar's close
  // isn't the closing-auction price (NVIDIA, 30 October: -4.14% by bars,
  // -4.22% officially).
  let officialLast: number | null = null;
  if (range === "1D" && ok && intraday.points) {
    const session = points[0].date.slice(0, 10);
    if (previousClose && previousClose.session === session) {
      prevClose = previousClose.value;
      officialLast = previousClose.last;
    } else {
      const before = intraday.points.filter((p) => p.date.slice(0, 10) < session);
      prevClose = before.length ? before[before.length - 1].close : null;
    }
  }

  const closes = points.map((p) => p.close);
  const dataHigh = ok ? Math.max(...closes) : 0;
  const dataLow = ok ? Math.min(...closes) : 0;
  const min = ok ? Math.min(...closes, ...(prevClose != null ? [prevClose] : [])) : 0;
  const max = ok ? Math.max(...closes, ...(prevClose != null ? [prevClose] : [])) : 0;
  const first = ok ? (range === "1D" && prevClose != null ? prevClose : closes[0]) : 0;
  const end = ok ? (officialLast ?? closes[closes.length - 1]) : 0;
  const change = ok ? ((end - first) / first) * 100 : 0;

  const path = ok
    ? points
        .map((p, i) => {
          const { x, y } = xyOf(i, points.length, p.close, min, max);
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ")
    : "";

  const marks = ok && spec.earnings ? earningsMarkers(points, earnings) : [];
  const indexOf = new Map(points.map((p, i) => [p, i]));

  // The words above the chart: the move over the range, said honestly when
  // the history is shorter than the range ("since Mar 2019"). The kind of
  // prices drawn goes in the legend.
  let caption = "";
  let source = "";
  if (ok) {
    const firstDate = points[0].date;
    const lastDate = points[points.length - 1].date;
    if (range === "1D") {
      caption = `${formatSignedPct(change, 2)} on the day`;
      source = `5-minute prices through ${throughTime(lastDate, 5)} ET, ${dayLabel(lastDate)}`;
    } else if (range === "1W") {
      caption = `${formatSignedPct(change, 1)} over five sessions`;
      source = "30-minute prices";
    } else if (range === "MAX") {
      caption = `${moveLabel(change)} since ${monthLabel(firstDate)}`;
      source = "Monthly closes";
    } else {
      const reach = (parseDate(lastDate).getTime() - parseDate(firstDate).getTime()) / 86_400_000;
      const short = spec.spanDays != null && reach < spec.spanDays * 0.9;
      caption = short ? `${moveLabel(change)} since ${monthLabel(firstDate)}` : `${moveLabel(change)} over ${range}`;
      source = spec.source === "weekly" ? "Weekly closes" : "Daily closes";
    }
  }
  const direction = change > 0 ? "pos" : change < 0 ? "neg" : "";

  const pending =
    fetched?.status === "loading" || (fetched?.status === "idle" && !ok)
      ? "Loading…"
      : fetched?.status === "busy"
        ? "Updating, try again in a minute."
        : "No price data for this range.";

  const nextLine = nextEarnings
    ? `Next earnings ${dayLabel(nextEarnings.date)}${nextEarnings.hour ? `, ${HOUR_WORDS[nextEarnings.hour]}` : ""}`
    : null;

  // Gridlines at the line's own high, middle and low. Not the scale's ends:
  // on 1D the scale stretches to fit the previous close.
  const at = (v: number) => `${(xyOf(0, 2, v, min, max).y / H) * 100}%`;
  const grid = ok ? [dataHigh, (dataHigh + dataLow) / 2, dataLow] : [];
  const last = ok ? xyOf(points.length - 1, points.length, closes[closes.length - 1], min, max) : null;

  return (
    <section className="rf-panel rf-chart" aria-labelledby={titleId}>
      <div className="rf-chart-top">
        <div>
          <div className="rf-lbl" id={titleId}>
            Price
          </div>
          <div className={`rf-chart-cap ${direction}`}>{caption || "\u00a0"}</div>
        </div>
        <div className="rf-seg rf-ranges" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`rf-seg-btn${range === r.id ? " is-active" : ""}`}
              aria-pressed={range === r.id}
              onClick={() => select(r.id)}
            >
              {r.id}
            </button>
          ))}
        </div>
      </div>
      {ok ? (
        <div className="rf-chart-frame">
          <div className="rf-chart-plot">
            {grid.map((v, i) => (
              <div key={i} className="rf-chart-grid" style={{ top: at(v) }} aria-hidden="true">
                <span className="rf-chart-ylab">{formatPrice(v)}</span>
              </div>
            ))}
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="rf-chart-svg"
              role="img"
              aria-label={`${symbol} price, ${range}: from ${formatPrice(closes[0])} to ${formatPrice(closes[closes.length - 1])}, ${caption}`}
            >
              <path d={`${path} L${W} ${H} L0 ${H} Z`} className="rf-chart-area" />
              <path d={path} className="rf-chart-line" fill="none" strokeWidth={1.8} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            {/* Drawn in HTML over the SVG rather than inside it: the SVG
                stretches to the frame's width, which would squash a circle
                into an oval and stretch a dashed line's dashes. */}
            {prevClose != null && <div className="rf-chart-prev" style={{ top: at(prevClose) }} aria-hidden="true" />}
            {marks.map((p) => {
              const { x, y } = xyOf(indexOf.get(p) ?? 0, points.length, p.close, min, max);
              return (
                <span
                  key={p.date}
                  className="rf-chart-dot"
                  style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}
                  title={`Earnings released ${dayLabel(p.date)}`}
                  aria-hidden="true"
                />
              );
            })}
            {last && <span className="rf-chart-now" style={{ left: "100%", top: `${(last.y / H) * 100}%` }} title="Latest" aria-hidden="true" />}
          </div>
          <div className="rf-chart-x" aria-hidden="true">
            {xTicks(points, range).map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        </div>
      ) : (
        // Never an error the visitor has to act on: the other ranges still
        // work, so say which part is missing and leave the selector up.
        <div className="rf-chart-pending">{pending}</div>
      )}
      <div className="rf-chart-legend">
        {marks.length > 0 && (
          <span>
            <span className="rf-legend-dot" aria-hidden="true" /> Earnings releases ({marks.length} in this range, from its SEC filings)
          </span>
        )}
        {prevClose != null && (
          <span>
            <span className="rf-legend-dash" aria-hidden="true" /> Previous close {formatPrice(prevClose)}
          </span>
        )}
        {nextLine && <span>{nextLine}</span>}
        {source && <span className="rf-chart-source">{source}</span>}
      </div>
    </section>
  );
}
