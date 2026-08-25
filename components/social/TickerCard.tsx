import Link from "next/link";
import type { TickerSnapshot } from "@/lib/analysis/tickerSnapshot";

export function formatPrice(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Shared between the composer (a live TickerSnapshot just fetched) and
// PostCard (the frozen ticker_snapshot JSON read back off a published
// post) — same shape, same component, per docs/phase-two.md's plan: the
// card is "labelled as pulled in automatically and frozen to this post"
// (docs/product-spec.md) either way. The prototype splits this into two
// different labels for two different moments — a header kicker on the
// composer's live draft card, a footer stamp with different wording
// ("attached at post time") on a published post's card — kept as one
// component with one label here (arguably more honest, since it's
// equally true in both places), just moved to the top to match the
// prototype's placement, which has no real-reason argument against it.
export function TickerCard({ snapshot }: { snapshot: TickerSnapshot }) {
  const isUp = snapshot.dayChangePct >= 0;
  const hasRange = snapshot.weekLow52 != null && snapshot.weekHigh52 != null;

  return (
    <div className="ticker-card">
      <div className="ticker-card-stamp">Pulled in automatically, frozen to this post</div>
      <div className="ticker-card-main">
        <div className="ticker-card-id">
          <Link href={`/research/${snapshot.symbol.toLowerCase()}`} className="ticker-card-symbol">
            {snapshot.symbol}
          </Link>
          {snapshot.name && <span className="ticker-card-name">{snapshot.name}</span>}
        </div>
        <div className="ticker-card-price">
          {formatPrice(snapshot.price)}
          <span className={`ticker-card-change ${isUp ? "up" : "down"}`}>
            {isUp ? "+" : ""}
            {snapshot.dayChangePct.toFixed(2)}%
          </span>
        </div>
      </div>
      <div className="ticker-card-stats">
        {snapshot.peRatio != null && (
          <div className="ticker-stat">
            <span className="ticker-stat-label">P/E</span>
            <span className="ticker-stat-value">{snapshot.peRatio.toFixed(1)}</span>
          </div>
        )}
        {snapshot.revenueGrowthPct != null && (
          <div className="ticker-stat">
            <span className="ticker-stat-label">Rev Growth</span>
            <span className="ticker-stat-value">{snapshot.revenueGrowthPct.toFixed(1)}%</span>
          </div>
        )}
        {snapshot.grossMarginPct != null && (
          <div className="ticker-stat">
            <span className="ticker-stat-label">Gross Margin</span>
            <span className="ticker-stat-value">{snapshot.grossMarginPct.toFixed(1)}%</span>
          </div>
        )}
        {hasRange && (
          <div className="ticker-stat">
            <span className="ticker-stat-label">52wk Range</span>
            <span className="ticker-stat-value">
              {formatPrice(snapshot.weekLow52 as number)}–{formatPrice(snapshot.weekHigh52 as number)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
