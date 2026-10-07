"use client";

import { useState } from "react";
import type { ChartPoint } from "@/lib/analysis/chartRanges";
import { takeRecentSessions } from "@/lib/analysis/chartRanges";
import { formatPrice } from "@/components/social/TickerCard";

// The ticker page's price chart and its range selector. A plain SVG line, not
// a charting library — same approach the page used when 1Y was its only range.
//
// 1M and 1Y are slices of the daily series the page already fetched, so those
// two switch instantly and cost nothing. 1D and 1W come from one intraday
// request this component makes the first time either is clicked, and then
// reuses — see getTickerIntraday for why that is not done during the render.

type Range = "1D" | "1W" | "1M" | "1Y";

const RANGES: Range[] = ["1D", "1W", "1M", "1Y"];
const INTRADAY_RANGES = new Set<Range>(["1D", "1W"]);

// ~21 trading days is a month; the daily series is already trimmed to ~252
// (one year) by getTickerChart, so 1Y is the whole of it.
const ONE_MONTH_TRADING_DAYS = 21;

const CHART_W = 600;
const CHART_H = 150;

function chartPath(points: ChartPoint[], width: number, height: number): string {
  if (points.length < 2) return "";
  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  return points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p.close - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function TickerChart({
  symbol,
  daily,
  weekLow52,
  weekHigh52,
}: {
  symbol: string;
  daily: ChartPoint[];
  weekLow52: number | null;
  weekHigh52: number | null;
}) {
  const [range, setRange] = useState<Range>("1Y");
  const [intraday, setIntraday] = useState<ChartPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Sticky on purpose: a provider that is rate-limited or down stays that way
  // for the next few minutes, so re-requesting on every click would spend the
  // quota it just ran out of.
  const [intradayFailed, setIntradayFailed] = useState(false);

  async function selectRange(next: Range) {
    setRange(next);
    if (!INTRADAY_RANGES.has(next) || intraday || intradayFailed || loading) return;
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

  const isIntraday = INTRADAY_RANGES.has(range);
  let points: ChartPoint[] = [];
  if (isIntraday) {
    if (intraday) points = range === "1D" ? takeRecentSessions(intraday, 1) : intraday;
  } else {
    points = range === "1M" ? daily.slice(-ONE_MONTH_TRADING_DAYS) : daily;
  }

  const hasPoints = points.length >= 2;
  const up = hasPoints ? points[points.length - 1].close >= points[0].close : true;

  return (
    <div className="tk-chart-box">
      <div className="tk-range-row" role="tablist" aria-label="Chart range">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={range === r}
            className={`tk-range-btn${range === r ? " is-active" : ""}`}
            onClick={() => selectRange(r)}
          >
            {r}
          </button>
        ))}
      </div>

      {hasPoints ? (
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className="tk-chart-svg">
          <path
            d={chartPath(points, CHART_W, CHART_H)}
            fill="none"
            className={up ? "up" : "down"}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        // Never an error state the visitor has to act on: the other ranges
        // still work, so say which part is missing and leave the selector up.
        <div className="tk-chart-pending">
          {loading ? "Loading…" : intradayFailed ? "Intraday chart temporarily unavailable." : "No data for this range."}
        </div>
      )}

      {/* The active range used to be labelled here, back when 1Y was the only
          one — the selector above says it now. */}
      <div className="tk-chart-range">
        <span>52wk low {weekLow52 != null ? formatPrice(weekLow52) : "—"}</span>
        <span>52wk high {weekHigh52 != null ? formatPrice(weekHigh52) : "—"}</span>
      </div>
    </div>
  );
}
