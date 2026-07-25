import type { ReportData, ReportSnapshot } from "@/lib/analysis/report";
import { buildComparison, type Comparison } from "@/lib/analysis/compare";
import type { FundamentalsChangeResult } from "@/lib/analysis/fundamentalsChange";
import { fmt, fmtBig, sign } from "@/lib/analysis/indicators";

function CmpRow({ label, value, big }: { label: string; value: React.ReactNode; big?: boolean }) {
  return (
    <div className="cmp-row">
      <span className="cmp-label">{label}</span>
      <span className={`cmp-val${big ? " big" : ""}`}>{value}</span>
    </div>
  );
}

function CompareSide({ snap }: { snap: ReportSnapshot }) {
  return (
    <>
      <CmpRow label="Rating" value={<span className={`compare-verdict ${snap.ratingClass}`}>{snap.rating}</span>} />
      <CmpRow label="Composite" value={`${snap.composite}/10`} big />
      <CmpRow label="Price" value={`$${fmt(snap.last)}`} big />
      <CmpRow label="52W High" value={`$${fmt(snap.w52high)}`} />
      <CmpRow label="52W Low" value={`$${fmt(snap.w52low)}`} />
      <CmpRow
        label="From 52W High"
        value={<span className={snap.pctFromHigh >= -5 ? "" : "neg"}>{fmt(snap.pctFromHigh, 1)}%</span>}
      />
      <CmpRow label="50-Day MA" value={snap.ma50 != null ? `$${fmt(snap.ma50)}` : "—"} />
      <CmpRow label="200-Day MA" value={snap.ma200 != null ? `$${fmt(snap.ma200)}` : "—"} />
      <CmpRow label="RSI (14)" value={snap.rsiVal != null ? fmt(snap.rsiVal, 1) : "—"} />
      <CmpRow
        label="30-Day Return"
        value={
          snap.d30 != null ? (
            <span className={snap.d30 >= 0 ? "pos" : "neg"}>{sign(snap.d30)}{fmt(snap.d30, 1)}%</span>
          ) : (
            "—"
          )
        }
      />
      <CmpRow
        label="90-Day Return"
        value={
          snap.d90 != null ? (
            <span className={snap.d90 >= 0 ? "pos" : "neg"}>{sign(snap.d90)}{fmt(snap.d90, 1)}%</span>
          ) : (
            "—"
          )
        }
      />
      <CmpRow
        label="1-Year Return"
        value={
          snap.d365 != null ? (
            <span className={snap.d365 >= 0 ? "pos" : "neg"}>{sign(snap.d365)}{fmt(snap.d365, 1)}%</span>
          ) : (
            "—"
          )
        }
      />
      <CmpRow label="Ann. Volatility" value={snap.vol != null ? `${fmt(snap.vol, 1)}%` : "—"} />
      <CmpRow label="Max Drawdown" value={`${fmt(snap.dd, 1)}%`} />
    </>
  );
}

function ScoreDeltaStrip({ cmp }: { cmp: Comparison }) {
  return (
    <div className="compare-deltas">
      <div className="compare-deltas-title">Score Change</div>
      {cmp.scoreDeltas.map((d) => (
        <div className="cmp-row" key={d.name}>
          <span className="cmp-label">
            {d.name}
            {d.name === cmp.topMover && <span className="cmp-top-mover">Biggest mover</span>}
            {d.note && <span className="cmp-subnote">{d.note}</span>}
          </span>
          <span className={`cmp-val${d.isComposite ? " big" : ""}`}>
            {d.thenScore == null ? (
              <span className="cmp-note">— not available as-of then</span>
            ) : d.delta === 0 ? (
              <>
                {fmt(d.thenScore, 0)} <span className="cmp-note">unchanged</span>
              </>
            ) : (
              <>
                {fmt(d.thenScore, 0)} → {fmt(d.nowScore, 0)}{" "}
                <span className={d.delta! > 0 ? "pos" : "neg"}>
                  {d.delta! > 0 ? "▲" : "▼"} {sign(d.delta!)}
                  {fmt(Math.abs(d.delta!), 0)}
                </span>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function IntervalPanel({ cmp }: { cmp: Comparison }) {
  const { interval } = cmp;
  return (
    <div className="compare-interval">
      <p className={`compare-interval-verdict ${cmp.verdictTone}`}>{cmp.verdict}</p>
      <div className="compare-interval-stats">
        <div className="cmp-row">
          <span className="cmp-label">Interval Return</span>
          <span className={`cmp-val big ${interval.totalReturnPct >= 0 ? "pos" : "neg"}`}>
            {sign(interval.totalReturnPct)}
            {fmt(interval.totalReturnPct, 1)}%
          </span>
        </div>
        <div className="cmp-row">
          <span className="cmp-label">Interval High</span>
          <span className="cmp-val">${fmt(interval.high)}</span>
        </div>
        <div className="cmp-row">
          <span className="cmp-label">Interval Low</span>
          <span className="cmp-val">${fmt(interval.low)}</span>
        </div>
        <div className="cmp-row">
          <span className="cmp-label">Interval Max Drawdown</span>
          <span className="cmp-val neg">{fmt(interval.maxDrawdownPct, 1)}%</span>
        </div>
      </div>
    </div>
  );
}

function formatQuarter(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function FundamentalsChangePanel({ change }: { change: FundamentalsChangeResult }) {
  return (
    <div className="compare-deltas">
      <div className="compare-deltas-title">How The Business Changed</div>
      {change.figures.map((f) => (
        <div className="cmp-row" key={f.label}>
          <span className="cmp-label">{f.label}</span>
          <span className="cmp-val">
            ${fmtBig(f.thenValue)} <span className="cmp-inline-note">(qtr ending {formatQuarter(f.thenDate)})</span>
            {" → "}
            ${fmtBig(f.nowValue)} <span className="cmp-inline-note">(qtr ending {formatQuarter(f.nowDate)})</span>
            {f.percentChange != null && (
              <span className={f.percentChange >= 0 ? "pos" : "neg"}>
                {" "}
                {f.percentChange > 0 ? "▲" : f.percentChange < 0 ? "▼" : ""} {sign(f.percentChange)}
                {fmt(f.percentChange, 1)}%
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CompareView({
  thenReport,
  nowReport,
  fundamentalsChange,
  sym,
  thenDate,
  onClose,
}: {
  thenReport: ReportData;
  nowReport: ReportData;
  fundamentalsChange: FundamentalsChangeResult | null;
  sym: string;
  thenDate: string;
  onClose: () => void;
}) {
  const then = thenReport.snapshot;
  const now = nowReport.snapshot;
  const cmp = buildComparison(thenReport, nowReport, thenDate);

  const thenDateLabel = new Date(thenDate + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const nowDateLabel = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="compare-view active" id="compareView">
      <div className="compare-header">
        <div>
          <div className="title">{sym}: Then vs. Now</div>
          <div className="sub">Historical memo compared to live data</div>
        </div>
        <button className="compare-close" type="button" aria-label="Close comparison view" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="compare-grid">
        <div className="compare-col">
          <div className="compare-col-header then">
            <div className="col-label">Then</div>
            <div className="col-date">{thenDateLabel}</div>
          </div>
          <div className="compare-col-body">
            <CompareSide snap={then} />
          </div>
        </div>
        <div className="compare-col">
          <div className="compare-col-header now">
            <div className="col-label">Now</div>
            <div className="col-date">{nowDateLabel}</div>
          </div>
          <div className="compare-col-body">
            <CompareSide snap={now} />
          </div>
        </div>
      </div>
      <ScoreDeltaStrip cmp={cmp} />
      <IntervalPanel cmp={cmp} />
      {fundamentalsChange && fundamentalsChange.figures.length > 0 && (
        <FundamentalsChangePanel change={fundamentalsChange} />
      )}
    </div>
  );
}
