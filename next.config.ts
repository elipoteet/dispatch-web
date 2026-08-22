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
  async rewrites() {
    return [
      // Public profile URLs are `/@handle` (see docs/phase-one.md), but a
      // folder literally named `@[handle]` isn't a route segment in the App
      // Router — `@folder` is the parallel-routes slot convention, so it
      // would silently never match a URL. The real page lives at
      // /u/[handle]; this rewrite is what makes `/@handle` resolve to it
      // while keeping `/@handle` in the address bar and in every internal
      // <Link>. `@` needs no escaping in the source pattern.
      { source: "/@:handle", destination: "/u/:handle" },
    ];
  },
};

export default nextConfig;
