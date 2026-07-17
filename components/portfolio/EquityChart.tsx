"use client";

import { useMemo } from "react";
import type { CurvePoint } from "./PortfolioProvider";

const W = 1000,
  H = 300,
  PAD_L = 10,
  PAD_R = 70,
  PAD_T = 20,
  PAD_B = 30;

export function EquityChart({ curve, startingCash }: { curve: CurvePoint[]; startingCash: number | null }) {
  const chart = useMemo(() => {
    if (!startingCash || curve.length < 2) return null;

    const firstSpyIdx = curve.findIndex((p) => p.spyPrice != null);
    const firstSpyPrice = firstSpyIdx >= 0 ? curve[firstSpyIdx].spyPrice : null;
    const portfolioVals = curve.map((p) => p.value);
    const spyVals = curve.map((p) =>
      firstSpyPrice == null || p.spyPrice == null ? null : startingCash * (p.spyPrice / firstSpyPrice),
    );

    const allVals = [...portfolioVals, ...spyVals.filter((v): v is number => v != null)];
    const minV = Math.min(...allVals);
    const maxV = Math.max(...allVals);
    const padding = (maxV - minV) * 0.1 || maxV * 0.02;
    const yMin = minV - padding;
    const yMax = maxV + padding;
    const yRange = yMax - yMin || 1;

    const x = (i: number) => PAD_L + (i / (curve.length - 1)) * (W - PAD_L - PAD_R);
    const y = (v: number) => PAD_T + (1 - (v - yMin) / yRange) * (H - PAD_T - PAD_B);

    const gridLines = Array.from({ length: 5 }, (_, i) => {
      const gy = PAD_T + (i / 4) * (H - PAD_T - PAD_B);
      const val = yMax - (i / 4) * yRange;
      return { gy, label: "$" + Math.round(val).toLocaleString("en-US") };
    });

    let pPath = `M ${x(0)} ${y(portfolioVals[0])}`;
    for (let i = 1; i < portfolioVals.length; i++) pPath += ` L ${x(i)} ${y(portfolioVals[i])}`;

    let spyPath = "";
    let started = false;
    for (let i = 0; i < spyVals.length; i++) {
      const v = spyVals[i];
      if (v == null) continue;
      spyPath += (started ? " L " : "M ") + x(i) + " " + y(v);
      started = true;
    }

    const baselineY = startingCash >= yMin && startingCash <= yMax ? y(startingCash) : null;

    return {
      gridLines,
      pPath,
      spyPath,
      baselineY,
      firstDate: curve[0].date,
      lastDate: curve[curve.length - 1].date,
    };
  }, [curve, startingCash]);

  if (!chart) {
    return (
      <svg id="equityChart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Portfolio equity curve compared to SPY benchmark">
        <text x="50%" y="50%" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="13" fill="var(--muted)">
          Equity curve will appear here as you analyze tickers and hold positions over time.
        </text>
      </svg>
    );
  }

  const { gridLines, pPath, spyPath, baselineY, firstDate, lastDate } = chart;

  return (
    <svg id="equityChart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Portfolio equity curve compared to SPY benchmark">
      {gridLines.map(({ gy, label }, i) => (
        <g key={i}>
          <line x1={PAD_L} x2={W - PAD_R} y1={gy} y2={gy} stroke="var(--rule)" strokeWidth="0.5" />
          <text x={W - PAD_R + 8} y={gy + 4} fontFamily="IBM Plex Mono, monospace" fontSize="10" fill="var(--muted)">
            {label}
          </text>
        </g>
      ))}

      {baselineY != null && (
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={baselineY}
          y2={baselineY}
          stroke="var(--muted)"
          strokeWidth="0.5"
          strokeDasharray="3,3"
          opacity="0.5"
        />
      )}

      <path d={pPath} fill="none" stroke="var(--navy)" strokeWidth="2" strokeLinejoin="round" />
      {spyPath && <path d={spyPath} fill="none" stroke="var(--gold)" strokeWidth="1.4" strokeDasharray="5,4" />}

      <text x={PAD_L} y={H - 8} fontFamily="IBM Plex Mono, monospace" fontSize="10" fill="var(--muted)">
        {firstDate}
      </text>
      <text x={W - PAD_R} y={H - 8} textAnchor="end" fontFamily="IBM Plex Mono, monospace" fontSize="10" fill="var(--muted)">
        {lastDate}
      </text>
    </svg>
  );
}
