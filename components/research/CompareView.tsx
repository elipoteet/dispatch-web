import type { ReportData, ReportSnapshot } from "@/lib/analysis/report";
import { fmt, sign } from "@/lib/analysis/indicators";

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

export function CompareView({
  thenReport,
  nowReport,
  sym,
  thenDate,
  onClose,
}: {
  thenReport: ReportData;
  nowReport: ReportData;
  sym: string;
  thenDate: string;
  onClose: () => void;
}) {
  const then = thenReport.snapshot;
  const now = nowReport.snapshot;
  const priceDelta = ((now.last - then.last) / then.last) * 100;
  const ratingChange =
    then.rating !== now.rating
      ? `The Dispatch rating moved from ${then.rating} to ${now.rating}.`
      : `The Dispatch rating remained ${then.rating}.`;
  const compositeDelta = now.composite - then.composite;
  const compositeText =
    compositeDelta === 0
      ? `The composite score was unchanged at ${now.composite}/10.`
      : `The composite score moved from ${then.composite}/10 to ${now.composite}/10 (${compositeDelta > 0 ? "+" : ""}${compositeDelta}).`;

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
      <div className="compare-footer">
        Over this period, <strong>{sym}</strong> has moved{" "}
        <strong className={priceDelta >= 0 ? "pos" : "neg"}>
          {sign(priceDelta)}
          {fmt(priceDelta, 1)}%
        </strong>
        . {ratingChange} {compositeText}
      </div>
    </div>
  );
}
