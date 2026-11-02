import type { QuarterPoint, RangeStats } from "@/lib/research/valuation";
import type { MetricKey } from "@/lib/research/valuationPage";

// "Against its own history" (phase nine, stage 4): each multiple at every
// quarter end for ten years, with today placed in that range. Drawn on the
// server; there's nothing to click.

export const METRIC_LABELS: Record<MetricKey, { title: string; long: string }> = {
  pe: { title: "P/E", long: "Market value ÷ net income over the trailing four quarters" },
  evSales: { title: "EV/sales", long: "Market value plus debt minus cash, ÷ revenue over the trailing four quarters" },
  fcfYield: { title: "Free cash flow yield", long: "Free cash flow over the trailing four quarters ÷ market value" },
  pb: { title: "Price to book", long: "Market value ÷ shareholders’ equity on the balance sheet" },
};

export function formatMetric(key: MetricKey, v: number): string {
  return key === "fcfYield" ? `${(v * 100).toFixed(1)}%` : `${v.toFixed(1)}×`;
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function placement(stats: RangeStats, since: string): string {
  const from = MONTH.format(new Date(since));
  const below = stats.belowToday;
  if (below == null) return "";
  if (below >= 1) return `Higher than at every quarter-end since ${from}.`;
  if (below <= 0) return `Lower than at every quarter-end since ${from}.`;
  if (below >= 0.5) return `Higher than at ${Math.round(below * 100)}% of quarter-ends since ${from}.`;
  return `Lower than at ${Math.round((1 - below) * 100)}% of quarter-ends since ${from}.`;
}

function Sparkline({ values, median, today }: { values: number[]; median: number; today: number | null }) {
  const W = 600;
  const H = 120;
  const all = today != null ? [...values, today] : values;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const y = (v: number) => 6 + (1 - (v - lo) / span) * (H - 12);
  const x = (i: number) => (values.length <= 1 ? 0 : (i / (values.length - 1)) * (W - 10));
  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="rf-vh-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1={0} x2={W} y1={y(median)} y2={y(median)} className="rf-vh-median" vectorEffect="non-scaling-stroke" />
      <polyline points={line} className="rf-vh-line" vectorEffect="non-scaling-stroke" />
      {today != null && <circle cx={W - 5} cy={y(today)} r={4} className="rf-vh-today" />}
    </svg>
  );
}

function RangeBar({ stats, today, metric }: { stats: RangeStats; today: number | null; metric: MetricKey }) {
  const span = stats.max - stats.min || 1;
  const at = (v: number) => `${Math.min(100, Math.max(0, ((v - stats.min) / span) * 100))}%`;
  return (
    <div className="rf-range">
      <div className="rf-range-track">
        <span className="rf-vh-median-tick" style={{ left: at(stats.median) }} title="Median" />
        {today != null && <span className="rf-range-marker" style={{ left: at(today) }} title="Today" />}
      </div>
      <div className="rf-range-ends">
        <span className="rf-lbl">Low {formatMetric(metric, stats.min)}</span>
        <span className="rf-lbl">Median {formatMetric(metric, stats.median)}</span>
        <span className="rf-lbl">High {formatMetric(metric, stats.max)}</span>
      </div>
    </div>
  );
}

export function ValuationHistory({
  metrics,
  points,
  ranges,
  today,
  since,
  missingToday,
}: {
  metrics: MetricKey[];
  points: QuarterPoint[];
  ranges: Record<MetricKey, RangeStats | null>;
  today: Record<MetricKey, number | null>;
  since: string;
  // Why there's no figure today, per metric, when there isn't one.
  missingToday: Record<MetricKey, string>;
}) {
  return (
    <div className="rf-vh-grid">
      {metrics.map((key) => {
        const stats = ranges[key];
        const values = points.map((p) => p[key]).filter((v): v is number => v != null);
        const now = today[key];
        const dropped = key === "pe" ? points.filter((p) => p.pe == null).length : 0;
        return (
          <section className="rf-vh" key={key}>
            <div className="rf-vh-head">
              <span className="rf-lbl">{METRIC_LABELS[key].title}</span>
              <span className="rf-vh-now">{now != null ? formatMetric(key, now) : "—"}</span>
              <span className="rf-lbl">Today</span>
            </div>
            {now == null && <p className="rf-vh-text">{missingToday[key]}</p>}
            {stats ? (
              <>
                <Sparkline values={values} median={stats.median} today={now} />
                <RangeBar stats={stats} today={now} metric={key} />
                <p className="rf-vh-text">
                  {now != null && `${placement(stats, since)} `}
                  {`Median ${formatMetric(key, stats.median)} across ${stats.count} quarter-ends.`}
                  {dropped > 0 && ` ${dropped} quarter-end${dropped === 1 ? "" : "s"} with a loss over the trailing year have no P/E and are left out.`}
                </p>
              </>
            ) : (
              <p className="rf-vh-text">
                {values.length === 0
                  ? "No quarter-end in the past ten years has this figure."
                  : `Only ${values.length} quarter-end${values.length === 1 ? " has" : "s have"} this figure, too few to compare against.`}
              </p>
            )}
            <p className="rf-vh-def">{METRIC_LABELS[key].long}.</p>
          </section>
        );
      })}
    </div>
  );
}
