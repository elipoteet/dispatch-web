import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // /pricing was renamed to /give when the paid Subscriber tier was
      // removed — permanent redirect so old bookmarks/backlinks still resolve.
      { source: "/pricing", destination: "/give", permanent: true },
      // The Monthly Leaderboard and its competition accounts were removed on
      // 30 October 2026: the site no longer ranks people or keeps a track
      // record. The competition tables stay in the database.
      { source: "/leaderboard", destination: "/research", permanent: true },
      { source: "/leaderboard/:path*", destination: "/research", permanent: true },
      { source: "/competition", destination: "/research", permanent: true },
      // The paper-trading portfolio was retired on 2 November 2026 (phase
      // ten). Old links land on the research page; the paper_* and
      // equity_snapshot tables stay in the database untouched.
      { source: "/portfolio", destination: "/research", permanent: true },
      { source: "/portfolio/:path*", destination: "/research", permanent: true },
      // The screener's first starting screens (phase eleven, Stage C) were
      // replaced on 7 November 2026 (lib/screener/screens.ts, RETIRED_SCREENS;
      // more-cash-than-debt kept its address). Their links land on the
      // screener's opening page.
      ...["revenue-up-20-cash-flow-positive", "share-count-shrinking", "gross-margin-above-70", "losing-money-revenue-up-30", "revenue-falling"].map(
        (slug) => ({ source: `/screener/${slug}`, destination: "/screener", permanent: true }),
      ),
    ];
  },
};

export default nextConfig;
