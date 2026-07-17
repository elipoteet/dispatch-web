"use client";

import { useMemo, useRef, useState } from "react";
import type { PriceRow } from "@/lib/providers";
import { sma } from "@/lib/analysis/indicators";

const W = 1000,
  H = 380,
  PAD_L = 10,
  PAD_R = 70,
  PAD_T = 20,
  PAD_B = 40;

export function ChartSVG({ rows, rangeDays }: { rows: PriceRow[]; rangeDays: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number } | null>(null);

  const chart = useMemo(() => {
    const slice = rows.slice(-rangeDays);
    if (slice.length < 2) return null;

    const start50Idx = Math.max(0, rows.length - rangeDays - 49);
    const start200Idx = Math.max(0, rows.length - rangeDays - 199);
    const ctx50 = rows.slice(start50Idx).map((r) => r.close);
    const ctx200 = rows.slice(start200Idx).map((r) => r.close);
    const ma50Full = sma(ctx50, 50);
    const ma200Full = sma(ctx200, 200);
    const ma50 = ma50Full.slice(ma50Full.length - slice.length);
    const ma200 = ma200Full.slice(ma200Full.length - slice.length);

    // Scale to the full high/low range, not just closes — wicks need room too.
    const highs = slice.map((r) => r.high);
    const lows = slice.map((r) => r.low);
    const all = [
      ...highs,
      ...lows,
      ...ma50.filter((v): v is number => v != null),
      ...ma200.filter((v): v is number => v != null),
    ];
    const min = Math.min(...all);
    const max = Math.max(...all);
    const rng = max - min || 1;
    const x = (i: number) => PAD_L + (i / (slice.length - 1)) * (W - PAD_L - PAD_R);
    const y = (p: number) => PAD_T + (1 - (p - min) / rng) * (H - PAD_T - PAD_B);

    const plotWidth = W - PAD_L - PAD_R;
    const slotWidth = slice.length > 1 ? plotWidth / (slice.length - 1) : plotWidth;
    const candleWidth = Math.max(1, Math.min(slotWidth * 0.62, 9));

    const candles = slice.map((r, i) => {
      const isUp = r.close >= r.open;
      const bodyTop = y(Math.max(r.open, r.close));
      const bodyBottom = y(Math.min(r.open, r.close));
      return {
        cx: x(i),
        wickTop: y(r.high),
        wickBottom: y(r.low),
        bodyTop,
        bodyHeight: Math.max(1, bodyBottom - bodyTop),
        isUp,
      };
    });

    let m200path = "";
    let started200 = false;
    for (let i = 0; i < ma200.length; i++) {
      if (ma200[i] == null) continue;
      m200path += (started200 ? " L " : "M ") + x(i) + " " + y(ma200[i] as number);
      started200 = true;
    }

    let m50path = "";
    let started50 = false;
    for (let i = 0; i < ma50.length; i++) {
      if (ma50[i] == null) continue;
      m50path += (started50 ? " L " : "M ") + x(i) + " " + y(ma50[i] as number);
      started50 = true;
    }

    const gridLines = Array.from({ length: 5 }, (_, i) => {
      const gy = PAD_T + (i / 4) * (H - PAD_T - PAD_B);
      const price = max - (i / 4) * rng;
      return { gy, label: "$" + price.toFixed(2) };
    });

    return {
      slice,
      x,
      candles,
      candleWidth,
      m50path,
      m200path,
      gridLines,
      firstDate: slice[0].date,
      lastDate: slice[slice.length - 1].date,
    };
  }, [rows, rangeDays]);

  if (!chart) return null;
  const { slice, candles, candleWidth, gridLines, m50path, m200path, firstDate, lastDate } = chart;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || !chart) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    if (svgX < PAD_L || svgX > W - PAD_R) {
      setHover(null);
      return;
    }
    const i = Math.round(((svgX - PAD_L) / (W - PAD_L - PAD_R)) * (slice.length - 1));
    if (i < 0 || i >= slice.length) return;
    setHover({ i, x: chart.x(i) });
  }

  const hoverRow = hover ? slice[hover.i] : null;

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        id="chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby="chartTitle"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        <title id="chartTitle">
          Candlestick chart over the last {slice.length} trading days, including 50-day and 200-day
          moving averages.
        </title>

        {gridLines.map(({ gy, label }, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={gy} y2={gy} stroke="var(--rule)" strokeWidth="0.5" />
            <text x={W - PAD_R + 8} y={gy + 4} fontFamily="IBM Plex Mono, monospace" fontSize="10" fill="var(--muted)">
              {label}
            </text>
          </g>
        ))}

        {m200path && (
          <path d={m200path} fill="none" stroke="var(--navy)" strokeWidth="1" strokeDasharray="5,3" opacity="0.55" />
        )}
        {m50path && <path d={m50path} fill="none" stroke="var(--gold)" strokeWidth="1.3" />}

        {candles.map((c, i) => {
          const color = c.isUp ? "var(--green)" : "var(--accent)";
          return (
            <g key={i} opacity={hover && hover.i !== i ? 0.55 : 1}>
              <line x1={c.cx} x2={c.cx} y1={c.wickTop} y2={c.wickBottom} stroke={color} strokeWidth="1" />
              <rect
                x={c.cx - candleWidth / 2}
                y={c.bodyTop}
                width={candleWidth}
                height={c.bodyHeight}
                fill={color}
              />
            </g>
          );
        })}

        <text x={PAD_L} y={H - 14} fontFamily="IBM Plex Mono, monospace" fontSize="10" fill="var(--muted)">
          {firstDate}
        </text>
        <text
          x={W - PAD_R}
          y={H - 14}
          textAnchor="end"
          fontFamily="IBM Plex Mono, monospace"
          fontSize="10"
          fill="var(--muted)"
        >
          {lastDate}
        </text>

        {hover && (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={PAD_T}
            y2={H - PAD_B}
            stroke="var(--navy)"
            strokeWidth="1"
            strokeDasharray="2,3"
            opacity="0.5"
            pointerEvents="none"
          />
        )}
      </svg>
      {hover && hoverRow && (
        <div
          className="chart-tooltip"
          style={{
            opacity: 1,
            left: Math.min(870, Math.max(0, (hover.x / W) * 100)) + "%",
            top: "8%",
          }}
        >
          <span className="t-date">{hoverRow.date}</span>
          <span className="t-price">
            O {hoverRow.open.toFixed(2)} · H {hoverRow.high.toFixed(2)}
          </span>
          <span className="t-price">
            L {hoverRow.low.toFixed(2)} · C {hoverRow.close.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
