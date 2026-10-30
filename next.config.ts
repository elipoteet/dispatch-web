import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // /pricing was renamed to /give when the paid Subscriber tier was
      // removed — permanent redirect so old bookmarks/backlinks still resolve.
      { source: "/pricing", destination: "/give", permanent: true },
      // The Monthly Leaderboard and its competition accounts were removed on
      // 30 October 2026: the site no longer ranks people or keeps a track
      // record. Old links land on the paper-trading portfolio, the nearest
      // thing that remains. The competition tables stay in the database.
      { source: "/leaderboard", destination: "/portfolio", permanent: true },
      { source: "/leaderboard/:path*", destination: "/portfolio", permanent: true },
      { source: "/competition", destination: "/portfolio", permanent: true },
    ];
  },
};

export default nextConfig;
