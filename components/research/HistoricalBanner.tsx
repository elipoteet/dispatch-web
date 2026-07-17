import { fmt, sign } from "@/lib/analysis/indicators";

export function HistoricalBanner({
  sym,
  asOfDate,
  thenPrice,
  nowPrice,
  onCompare,
  loading,
}: {
  sym: string;
  asOfDate: string;
  thenPrice: number;
  nowPrice: number;
  onCompare: () => void;
  loading: boolean;
}) {
  const delta = ((nowPrice - thenPrice) / thenPrice) * 100;
  const deltaClass = delta >= 0 ? "hb-delta-pos" : "hb-delta-neg";
  const dateLabel = new Date(asOfDate + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="historical-banner" role="status">
      <div className="hb-left">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>
          Historical memo as of <strong>{dateLabel}</strong>
        </span>
        <span className="hb-divider">·</span>
        <span>
          {sym} is <span className={deltaClass}>{sign(delta)}{fmt(delta, 1)}%</span> since this memo
        </span>
      </div>
      <div className="hb-right">
        <span className="hb-note">Fundamentals hidden (point-in-time data unavailable)</span>
        <button className="hb-cta" type="button" onClick={onCompare} disabled={loading}>
          {loading ? "Loading…" : "Compare to today →"}
        </button>
      </div>
    </div>
  );
}
