"use client";

import { useState } from "react";
import type { ChartPoint } from "@/lib/analysis/chartRanges";
import { takeRecentSessions } from "@/lib/analysis/chartRanges";
import { formatPrice, formatSignedPct } from "@/lib/research/format";

// The Overview's price chart: a plain SVG line, no charting library.
//
// 1M and 1Y are slices of the daily series the page already loaded (one
// Twelve Data request per company per day, cached), so switching between them
// costs nothing. 1D and 1W come from one intraday request, made the first time
// either is clicked and then reused — never during the page render — because
// intraday is the one range that spends Twelve Data's 8-a-minute allowance.
// Stage 3 adds 3M, 5Y, 10Y and MAX.

type Range = "1D" | "1W" | "1M" | "1Y";

const RANGES: Range[] = ["1D", "1W", "1M", "1Y"];
const INTRADAY = new Set<Range>(["1D", "1W"]);
const ONE_MONTH_SESSIONS = 21;

const W = 800;
const H = 220;
const PAD_Y = 8;

function path(points: ChartPoint[], min: number, max: number): string {
  const span = max - min || 1;
  return points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = PAD_Y + (1 - (p.close - min) / span) * (H - 2 * PAD_Y);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function dateLabel(date: string, intraday: boolean): string {
  // Daily rows are "YYYY-MM-DD"; intraday rows carry a time as well.
  const d = new Date(date.replace(" ", "T") + (date.length <= 10 ? "T12:00:00" : ""));
  if (Number.isNaN(d.getTime())) return date;
  return intraday
    ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function PriceChart({ symbol, daily }: { symbol: string; daily: ChartPoint[] }) {
  const [range, setRange] = useState<Range>("1Y");
  const [intraday, setIntraday] = useState<ChartPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Sticky on purpose: a provider that is rate-limited stays that way for a
  // minute or so, and asking again on every click spends what's left.
  const [intradayFailed, setIntradayFailed] = useState(false);

  async function select(next: Range) {
    setRange(next);
    if (!INTRADAY.has(next) || intraday || intradayFailed || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ticker-intraday/${encodeURIComponent(symbol)}`);
      const json = res.ok ? await res.json() : null;
      const points: ChartPoint[] | null = json?.points ?? null;
      if (points && points.length >= 2) setIntraday(points);
      else setIntradayFailed(true);
    } catch {
      setIntradayFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const isIntraday = INTRADAY.has(range);
  let points: ChartPoint[] = [];
  if (isIntraday) {
    if (intraday) points = range === "1D" ? takeRecentSessions(intraday, 1) : intraday;
  } else {
    points = range === "1M" ? daily.slice(-ONE_MONTH_SESSIONS) : daily;
  }
  const ok = points.length >= 2;
  const closes = points.map((p) => p.close);
  const min = ok ? Math.min(...closes) : 0;
  const max = ok ? Math.max(...closes) : 0;
  const change = ok ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100 : 0;

  return (
    <div className="rf-chart">
      <div className="rf-chart-top">
        <div className="rf-lbl">
          Price{ok ? ` · ${formatSignedPct(change, 1)} over ${range}` : ""}
          {isIntraday && ok ? " · 15-minute bars" : ""}
        </div>
        <div className="rf-ranges" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button key={r} type="button" className={`rf-range-btn${range === r ? " is-active" : ""}`} aria-pressed={range === r} onClick={() => select(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>
      {ok ? (
        <div className="rf-chart-frame">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="rf-chart-svg" role="img" aria-label={`${symbol} price over ${range}, from ${formatPrice(closes[0])} to ${formatPrice(closes[closes.length - 1])}`}>
            <path d={path(points, min, max)} className={change >= 0 ? "rf-line-up" : "rf-line-down"} fill="none" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="rf-chart-y">
            <span>High {formatPrice(max)}</span>
            <span>Low {formatPrice(min)}</span>
          </div>
          <div className="rf-chart-x">
            <span>{dateLabel(points[0].date, isIntraday)}</span>
            <span>{dateLabel(points[points.length - 1].date, isIntraday)}</span>
          </div>
        </div>
      ) : (
        // Never an error the visitor has to act on: the other ranges still
        // work, so say which part is missing and leave the selector up.
        <div className="rf-chart-pending">
          {loading ? "Loading…" : intradayFailed ? "The intraday chart is updating. Try again in a minute." : "No price data for this range."}
        </div>
      )}
    </div>
  );
}
