// Quarterly bars for the Earnings tab, drawn on the server: a solid bar for
// what was reported, and a hatched band for what the company had said it
// expected. The quarter not yet reported gets a hatched bar of its own.
// Same look as the Financials chart (rf-bars), and nothing to click.

export type BarColumn = {
  key: string;
  label: string;
  // What was reported. Null for the quarter not yet reported.
  value: number | null;
  // Shown after the value: a figure we calculated rather than read.
  calculated?: boolean;
  // The company's own outlook for the quarter, low to high.
  outlook?: { low: number; high: number; mid: number } | null;
};

export function QuarterBars({
  columns,
  format,
  label,
}: {
  columns: BarColumn[];
  format: (v: number) => string;
  label: string;
}) {
  const figures = columns.flatMap((c) => [c.value, c.outlook?.low, c.outlook?.high].filter((v): v is number => v != null));
  const max = Math.max(0, ...figures);
  const min = Math.min(0, ...figures);
  // The tallest bar fills 85% of the plot, leaving room for its label.
  const span = (max - min || 1) / 0.85;
  const at = (v: number) => ((v - min) / span) * 100;
  const zero = at(0);
  // The newest reported quarter is gold, as on the Financials chart; the
  // quarter not yet reported, if shown, comes after it.
  const latest = columns.reduce((last, c, i) => (c.value != null ? i : last), -1);

  return (
    <div className="rf-bars-scroll">
      <div className="rf-bars" role="img" aria-label={label}>
        {columns.map((c, i) => {
          const v = c.value;
          const o = c.outlook ?? null;
          const isLast = i === latest;
          const top = Math.max(v != null && v > 0 ? v : 0, o?.high ?? 0);
          const text =
            v != null ? `${format(v)}${c.calculated ? "‡" : ""}` : o ? `${o.low === o.high ? "" : "~"}${format(o.mid)}` : "—";
          return (
            <div className="rf-bar-col" key={c.key}>
              <div className="rf-bar-plot">
                <span className="rf-bar-val" style={{ bottom: `calc(${v != null && v < 0 ? zero : at(top)}% + 4px)` }}>
                  {text}
                </span>
                {v == null && o && (
                  <div className="rf-bar is-outlook" style={{ bottom: `${zero}%`, height: `${(o.mid / span) * 100}%` }} />
                )}
                {v != null && (
                  <div
                    className={`rf-bar${isLast ? " is-latest" : ""}${v < 0 ? " is-negative" : ""}`}
                    style={v >= 0 ? { bottom: `${zero}%`, height: `${(v / span) * 100}%` } : { bottom: `${at(v)}%`, height: `${(-v / span) * 100}%` }}
                  />
                )}
                {o && (
                  <div
                    className="rf-bar-outlook"
                    style={{ bottom: `${at(o.low)}%`, height: `max(3px, ${((o.high - o.low) / span) * 100}%)` }}
                    title={`Outlook: ${o.low === o.high ? format(o.low) : `${format(o.low)} to ${format(o.high)}`}`}
                  />
                )}
              </div>
              <span className="rf-bar-year">{c.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
