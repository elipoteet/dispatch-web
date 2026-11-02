"use client";

import { useEffect, useRef, useState } from "react";
import type { FinancialsView as View, MetricSeries, PeriodView } from "@/lib/research/financialsView";
import { countWord } from "@/lib/research/format";

const MARK_SYMBOL = { restated: "†", filing: "‡" } as const;

// Rows set small under the line they describe (phase ten, Financials board):
// revenue growth under revenue, each margin under its profit line.
const SUB_OF: Record<string, string> = {
  "revenue-growth": "revenue",
  "operating-margin": "operating_income",
  "net-margin": "net_income",
};

// "+65%", "-3%": the year-on-year change under each bar, rounded as the
// table's growth row is. Blank where there's nothing to compare against.
function growthLabel(now: number | null, before: number | null): { text: string; cls: string } {
  if (now == null || before == null || before <= 0) return { text: "", cls: "" };
  const r = Math.round(((now - before) / before) * 100);
  return { text: `${r > 0 ? "+" : r < 0 ? "-" : ""}${Math.abs(r)}%`, cls: r > 0 ? "pos" : r < 0 ? "neg" : "" };
}

function Bars({ metric, view, showGrowth }: { metric: MetricSeries; view: PeriodView; showGrowth: boolean }) {
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
        const growth = showGrowth && i > 0 ? growthLabel(v, values[i - 1]) : null;
        return (
          <div className="rf-bar-col" key={view.columns[i].key}>
            <div className="rf-bar-plot">
              <span className="rf-bar-val" style={{ bottom: v != null && v >= 0 ? `calc(${100 - zero + height}% + 6px)` : `calc(${100 - zero}% + 6px)` }}>
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
            {showGrowth && <span className={`rf-bar-growth ${growth?.cls ?? ""}`}>{growth?.text || " "}</span>}
          </div>
        );
      })}
    </div>
  );
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
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
  const sections = headers.filter((h): h is string => h != null);
  const isSub = (i: number) => SUB_OF[current.rows[i].id] != null && SUB_OF[current.rows[i].id] === current.rows[i - 1]?.id;
  const nowCol = current.columns.length - 1;
  const annual = period === "annual";
  const periods = current.columns.length;
  // Growth under the bars: year on year, for amounts. Quarter on quarter
  // would mostly measure the seasons.
  const showGrowth = annual && metric?.kind === "money";

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
        <div className="rf-seg" role="group" aria-label="Annual or quarterly">
          {(["annual", "quarterly"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={`rf-seg-btn${period === p ? " is-active" : ""}`}
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
        <section className="rf-panel" aria-labelledby="rf-fin-chart">
          <div className="rf-panel-head">
            <div>
              <div className="rf-lbl" id="rf-fin-chart">
                {metric.label} by {annual ? "fiscal year" : "quarter"}
                {metric.kind === "money" ? `, ${current.unitLabel}` : ""}
              </div>
              <div className="rf-panel-cap">{metric.summary || " "}</div>
            </div>
            <span className="rf-lbl">{annual ? "Fiscal years" : "Quarters"} · gold is the latest</span>
          </div>
          <div className="rf-bars-scroll" ref={barsRef}>
            <Bars metric={metric} view={current} showGrowth={showGrowth} />
          </div>
        </section>
      )}

      <section className="rf-sec" aria-labelledby="rf-fin-table">
        <div className="rf-sechead">
          <div>
            <div className="rf-lbl rf-kicker">{`${countWord(periods, true)} ${annual ? (periods === 1 ? "year" : "years") : periods === 1 ? "quarter" : "quarters"}, as filed`}</div>
            <h2 className="rf-h2" id="rf-fin-table">
              {listWords(sections.map((h, i) => (i === 0 ? h : h.toLowerCase())))}
            </h2>
          </div>
          <span className="rf-lbl">{current.unitLabel} · gold is the latest</span>
        </div>
        <div className="rf-table-scroll" ref={tableRef} tabIndex={0} role="region" aria-label={`${annual ? "Annual" : "Quarterly"} financials table, scrolls sideways`}>
          <table className="rf-table rf-fin-table">
            <thead>
              <tr>
                <th scope="col">{current.unitLabel}</th>
                {current.columns.map((c, i) => (
                  <th scope="col" key={c.key} className={i === nowCol ? "is-now" : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {current.rows.map((r, rowIndex) => {
                const header = headers[rowIndex];
                const sub = isSub(rowIndex);
                const hasSub = rowIndex + 1 < current.rows.length && isSub(rowIndex + 1);
                const cls = [r.emphasis ? "is-emphasis" : "", sub ? "is-sub" : "", hasSub ? "has-sub" : ""].filter(Boolean).join(" ");
                return [
                  header ? (
                    <tr className="rf-table-section" key={`${r.id}-section`}>
                      <th scope="rowgroup" colSpan={current.columns.length + 1}>
                        <span>{header}</span>
                      </th>
                    </tr>
                  ) : null,
                  <tr key={r.id} className={cls || undefined}>
                    <th scope="row">{r.label}</th>
                    {r.cells.map((c, i) => (
                      <td key={current.columns[i].key} className={[c.negative ? "neg" : "", i === nowCol ? "is-now" : ""].filter(Boolean).join(" ") || undefined}>
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
      </section>
    </div>
  );
}
