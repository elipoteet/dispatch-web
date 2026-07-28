import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // /pricing was renamed to /give when the paid Subscriber tier was
      // removed — permanent redirect so old bookmarks/backlinks still resolve.
      { source: "/pricing", destination: "/give", permanent: true },
      // /competition was folded into /leaderboard's "My Account" tab so
      // opting in, trading, and viewing the board all live on one page.
      { source: "/competition", destination: "/leaderboard?tab=account", permanent: false },
    ];
  },
};

export default nextConfig;
