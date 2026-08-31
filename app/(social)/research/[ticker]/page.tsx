import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TICKER_PATTERN } from "@/lib/analysis/loadReport";
import { getTickerSnapshot } from "@/lib/analysis/tickerSnapshot";
import type { TickerSnapshot } from "@/lib/analysis/tickerSnapshot";
import { getTickerChart } from "@/lib/analysis/tickerChart";
import type { ChartPoint } from "@/lib/analysis/tickerChart";
import { getPostsByTicker } from "@/lib/social/queries";
import { PostCard } from "@/components/social/PostCard";
import { EmptyState } from "@/components/social/EmptyState";
import { formatPrice } from "@/components/social/TickerCard";

// docs/phase-five.md section A. Every ticker mentioned anywhere is one
// click from this page, and this page lives inside the conversation (the
// social shell — header, left nav, footer, tape) rather than beside it in
// the retired product's chrome. No rating, no score, no verdict: header,
// the conversation, then the numbers that support it, in that order —
// deliberate, per the brief ("the numbers support the argument; they are
// not the point of the page").

type Props = { params: Promise<{ ticker: string }> };

// Validation only, same shape as the retired page's resolveTicker — see
// that file's git history for the original. No asOf/Time Machine here;
// this page has no historical mode.
async function resolveTicker(props: Props): Promise<string> {
  const { ticker: raw } = await props.params;
  if (raw !== raw.toLowerCase()) {
    redirect(`/research/${raw.toLowerCase()}`);
  }
  const ticker = raw.toUpperCase();
  if (!TICKER_PATTERN.test(ticker)) notFound();
  return ticker;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const ticker = await resolveTicker(props);
  // Degrade to plain, unindexed metadata on failure rather than throwing —
  // same reasoning as the retired page's generateMetadata: this doesn't
  // cost a second fetch on success, since getTickerSnapshot is cached.
  const snapshot = await getTickerSnapshot(ticker);
  if (!snapshot) {
    return { title: `${ticker} — Dispatch Social`, robots: { index: false, follow: false } };
  }
  const description = `${snapshot.name ?? ticker} (${ticker}) on Dispatch Social: what the campus network is saying, plus market cap, P/E, revenue growth, gross margin, and a one-year chart.`;
  return {
    title: `${ticker} — ${snapshot.name ?? "Dispatch Social"}`,
    description,
    alternates: { canonical: `/research/${ticker.toLowerCase()}` },
    openGraph: { url: `/research/${ticker.toLowerCase()}`, description },
    twitter: { description },
  };
}

function formatMarketCap(millionsUsd: number): string {
  if (millionsUsd >= 1_000_000) return `$${(millionsUsd / 1_000_000).toFixed(2)}T`;
  if (millionsUsd >= 1_000) return `$${(millionsUsd / 1_000).toFixed(1)}B`;
  return `$${millionsUsd.toFixed(0)}M`;
}
function formatVolume(millionsShares: number): string {
  return `${millionsShares.toFixed(1)}M`;
}
function formatPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// A plain SVG line, not a charting library — matches the prototype's own
// spark() approach, just plotting real closes instead of a seeded random
// walk. Scaled to the min/max close in the window so the line always uses
// the full height, same as any sparkline.
function chartPath(points: ChartPoint[], width: number, height: number): string {
  if (points.length < 2) return "";
  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  return points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p.close - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

const CHART_W = 600;
const CHART_H = 150;

function TickerStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="tk-stat">
      <div className="tk-stat-label">{label}</div>
      <div className="tk-stat-value">{value}</div>
    </div>
  );
}

function TheNumbers({
  snapshot,
  chart,
  postCount,
}: {
  snapshot: TickerSnapshot;
  chart: ChartPoint[] | null;
  postCount: number;
}) {
  const hasChart = Boolean(chart && chart.length >= 2);
  const chartUp = hasChart && chart ? chart[chart.length - 1].close >= chart[0].close : snapshot.dayChangePct >= 0;

  return (
    <div className="tk-numbers">
      {hasChart && chart ? (
        <div className="tk-chart-box">
          <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className="tk-chart-svg">
            <path
              d={chartPath(chart, CHART_W, CHART_H)}
              fill="none"
              className={chartUp ? "up" : "down"}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </svg>
          <div className="tk-chart-range">
            <span>52wk low {snapshot.weekLow52 != null ? formatPrice(snapshot.weekLow52) : "—"}</span>
            <span>1Y</span>
            <span>52wk high {snapshot.weekHigh52 != null ? formatPrice(snapshot.weekHigh52) : "—"}</span>
          </div>
        </div>
      ) : (
        // Provider down/rate-limited, or Twelve Data doesn't recognize a
        // symbol Finnhub does — never throws, per docs/phase-five.md:
        // "render the page without the chart, stats and posts still
        // work."
        <div className="tk-chart-unavailable">Chart temporarily unavailable.</div>
      )}
      <div className="tk-stats">
        <TickerStat label="Market cap" value={snapshot.marketCap != null ? formatMarketCap(snapshot.marketCap) : "—"} />
        <TickerStat label="P/E" value={snapshot.peRatio != null ? snapshot.peRatio.toFixed(1) : "—"} />
        <TickerStat
          label="Rev growth"
          value={snapshot.revenueGrowthPct != null ? formatPct(snapshot.revenueGrowthPct) : "—"}
        />
        <TickerStat
          label="Gross margin"
          value={snapshot.grossMarginPct != null ? `${snapshot.grossMarginPct.toFixed(1)}%` : "—"}
        />
        <TickerStat label="Avg volume" value={snapshot.avgVolume != null ? formatVolume(snapshot.avgVolume) : "—"} />
        <TickerStat label="Posts" value={String(postCount)} />
      </div>
    </div>
  );
}

export default async function TickerPage(props: Props) {
  const ticker = await resolveTicker(props);
  const supabase = await createClient();

  // A symbol Finnhub doesn't recognize is a real 404 — Finnhub backs both
  // fields this page can't do without (price, name). A confirmed-bad
  // ticker and a temporarily-down provider look the same here (both come
  // back null from getTickerSnapshot's own quiet-fail contract); that
  // matches this page's actual dependency, unlike the retired page, which
  // had TickerDataError/plain-Error to distinguish against Twelve Data
  // specifically.
  const snapshot = await getTickerSnapshot(ticker);
  if (!snapshot) notFound();

  const [chart, { posts, total }] = await Promise.all([
    getTickerChart(ticker),
    getPostsByTicker(supabase, ticker),
  ]);

  const isUp = snapshot.dayChangePct >= 0;

  return (
    <div className="social-content-card">
      <div className="tk-head">
        <div className="tk-head-top">
          <div>
            <div className="tk-symbol">{ticker}</div>
            <div className="tk-name">
              {snapshot.name ?? "Unknown company"}
              {snapshot.industry && <> &middot; {snapshot.industry}</>}
            </div>
          </div>
          <div className="tk-price-block">
            <div className="tk-price">{formatPrice(snapshot.price)}</div>
            <div className={`tk-change ${isUp ? "up" : "down"}`}>{formatPct(snapshot.dayChangePct)} today</div>
          </div>
        </div>
        <div className="tk-actions">
          {/* Not "Add to watchlist" — the prototype has that button but
              watchlists are deferred (docs/state-of-play.md's Deferred
              section) and do not exist. This is the one real action here. */}
          <Link href={`/?ticker=${ticker}`} className="social-btn social-btn-primary">
            Post about ${ticker}
          </Link>
        </div>
      </div>

      {/* Numbers above the conversation — Eli's explicit call, overriding
          docs/phase-five.md's original "conversation above the numbers"
          ordering. */}
      <div className="section-head">
        <h2>The numbers</h2>
        <span className="count">supporting the argument</span>
      </div>
      <TheNumbers snapshot={snapshot} chart={chart} postCount={total} />

      <div className="section-head">
        <h2>What the network is saying</h2>
        <span className="count">
          {total} {total === 1 ? "post" : "posts"}
        </span>
      </div>
      {posts.length === 0 ? (
        <EmptyState headline={`Nobody has posted about $${ticker} yet.`} sub="Be first." />
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </div>
  );
}
