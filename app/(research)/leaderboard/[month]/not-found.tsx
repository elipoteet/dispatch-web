import type { Metadata } from "next";

// Rendered when a month is malformed or has no public_month_status row at
// all (the competition didn't exist yet, or hasn't started that far in the
// future). Set noindex explicitly rather than relying on Next's automatic
// injection for notFound() — same gotcha documented in
// app/research/[ticker]/not-found.tsx: verified in this repo that it
// doesn't reliably apply once a custom not-found.tsx is in the segment.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function LeaderboardMonthNotFound() {
  return (
    <section className="page active" id="page-leaderboard">
      <div className="leaderboard-head">
        <div className="label">Monthly Leaderboard</div>
        <h1>We couldn&rsquo;t find that month.</h1>
        <p>
          Check the URL — months are formatted YYYY-MM (e.g. <strong>2026-07</strong>) — or head
          back to the <a href="/leaderboard">current leaderboard</a>.
        </p>
      </div>
    </section>
  );
}
