"use client";

import { useEffect, useRef, useState } from "react";
import type { FinancialsView as View, MetricSeries, PeriodView } from "@/lib/research/financialsView";

const MARK_SYMBOL = { restated: "†", filing: "‡" } as const;

function Bars({ metric, view }: { metric: MetricSeries; view: PeriodView }) {
  const isPercent = metric.kind === "percent";
  const values = metric.values;
  const max = Math.max(0, ...values.map((v) => v ?? 0));
  const min = Math.min(0, ...values.map((v) => v ?? 0));
  // The tallest bar fills 85% of the plot, leaving room for its label above.
  const span = (max - min || 1) / 0.85;
  const divisor = view.unitLabel === "$ billions" ? 1e9 : 1e6;
  const label = (v: number) => {
    if (isPercent) return `${v.toFixed(1)}%`;
    const x = v / divisor;
    return Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1);
  };
  const last = values.length - 1;

  return (
    <div className="rf-bars" role="img" aria-label={`${metric.label} by period: ${metric.summary}`}>
      {values.map((v, i) => {
        const height = v == null ? 0 : (Math.abs(v) / span) * 100;
        // The zero line's distance from the top, in percent: everything below
        // it is the negative part of the range.
        const zero = (1 + min / span) * 100;
        return (
          <div className="rf-bar-col" key={view.columns[i].key}>
            <div className="rf-bar-plot">
              <span className="rf-bar-val" style={{ bottom: v != null && v >= 0 ? `calc(${100 - zero + height}% + 4px)` : `calc(${100 - zero}% + 4px)` }}>
                {v == null ? "—" : label(v)}
              </span>
              {v != null && (
                <div
                  className={`rf-bar${i === last ? " is-latest" : ""}${v < 0 ? " is-negative" : ""}`}
                  style={v >= 0 ? { bottom: `${100 - zero}%`, height: `${height}%` } : { top: `${zero}%`, height: `${height}%` }}
                />
              )}
            </div>
            <span className="rf-bar-year">{view.columns[i].label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function FinancialsView({
  view,
  sourceLine,
  suppressionReason,
}: {
  view: View;
  sourceLine: string;
  suppressionReason: string | null;
}) {
  const [period, setPeriod] = useState<"annual" | "quarterly">("annual");
  const barsRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // On a narrow screen the chart and table scroll sideways, oldest year
  // first. Start them at the right-hand end, so the latest figures are what
  // a phone shows before any scrolling.
  useEffect(() => {
    for (const el of [barsRef.current, tableRef.current]) {
      if (el) el.scrollLeft = el.scrollWidth;
    }
  }, [period]);
  const current = (period === "annual" ? view.annual : view.quarterly) ?? view.annual ?? view.quarterly;
  const [metricId, setMetricId] = useState<string>(current?.metrics[0]?.id ?? "revenue");
  if (!current) return null;
  const metric = current.metrics.find((m) => m.id === metricId) ?? current.metrics[0];
  const marks = new Set(current.rows.flatMap((r) => r.cells.flatMap((c) => c.marks ?? [])));
  const hasFreeCashFlow = current.rows.some((r) => r.id === "free_cash_flow");
  // A section heading goes above the first row of each section.
  const headers = current.rows.map((r, i) => (r.section && r.section !== current.rows[i - 1]?.section ? r.section : null));

  return (
    <div className="rf-fin">
      <div className="rf-fin-controls">
        <div className="rf-chips" role="group" aria-label="Figure to chart">
          {current.metrics.map((m) => (
            <button key={m.id} type="button" className={`rf-chip${m.id === metric?.id ? " is-active" : ""}`} aria-pressed={m.id === metric?.id} onClick={() => setMetricId(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="rf-toggle" role="group" aria-label="Annual or quarterly">
          {(["annual", "quarterly"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={`rf-toggle-btn${period === p ? " is-active" : ""}`}
              aria-pressed={period === p}
              disabled={!view[p]}
              onClick={() => setPeriod(p)}
            >
              {p === "annual" ? "Annual" : "Quarterly"}
            </button>
          ))}
        </div>
      </div>

      {suppressionReason && <p className="rf-note">{suppressionReason}</p>}

      {metric && (
        <div className="rf-panel">
          <div className="rf-panel-head">
            <span className="rf-panel-title">
              {metric.label}
              {metric.kind === "money" ? `, ${current.unitLabel}` : ""}
            </span>
            <span className="rf-lbl">{metric.summary}</span>
          </div>
          <div className="rf-bars-scroll" ref={barsRef}>
            <Bars metric={metric} view={current} />
          </div>
        </div>
      )}

      <div className="rf-table-scroll" ref={tableRef} tabIndex={0} role="region" aria-label={`${period === "annual" ? "Annual" : "Quarterly"} financials table`}>
        <table className="rf-table">
          <thead>
            <tr>
              <th scope="col">{current.unitLabel}</th>
              {current.columns.map((c) => (
                <th scope="col" key={c.key}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {current.rows.map((r, rowIndex) => {
              const header = headers[rowIndex];
              return [
                header ? (
                  <tr className="rf-table-section" key={`${r.id}-section`}>
                    <th scope="rowgroup" colSpan={current.columns.length + 1}>
                      <span>{header}</span>
                    </th>
                  </tr>
                ) : null,
                <tr key={r.id} className={`${r.emphasis ? "is-emphasis" : ""} ${r.kind === "growth" || r.kind === "percent" ? "is-ratio" : ""}`}>
                  <th scope="row">{r.label}</th>
                  {r.cells.map((c, i) => (
                    <td key={current.columns[i].key} className={c.negative ? "neg" : undefined}>
                      {c.display}
                      {c.marks?.map((m) => (
                        <sup key={m} className="rf-mark" title={m === "restated" ? "Restated in a later filing" : "From the company's own cash-flow statement"}>
                          {MARK_SYMBOL[m]}
                        </sup>
                      ))}
                    </td>
                  ))}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>

      <div className="rf-sourceline">
        <p>{sourceLine}</p>
        {hasFreeCashFlow && <p>Free cash flow is calculated by The Dispatch: operating cash flow minus capital expenditure.</p>}
        {period === "quarterly" && (
          <p>
            Companies don&rsquo;t report a fourth quarter on its own, so Q4 is the full year minus the first three quarters.
            Cash-flow quarters are worked out from the year-to-date totals in each 10-Q.
          </p>
        )}
        {marks.has("restated") && <p>† Restated: a later filing changed this figure. The newer number is shown.</p>}
        {marks.has("filing") && (
          <p>‡ Capital expenditure read from the company&rsquo;s own cash-flow statement, because the SEC&rsquo;s summary data doesn&rsquo;t carry it for that year.</p>
        )}
      </div>
    </div>
  );
}
