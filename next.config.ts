import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /pricing was renamed to /give when the paid Subscriber tier was
  // removed — permanent redirect so old bookmarks/backlinks still resolve.
  async redirects() {
    return [{ source: "/pricing", destination: "/give", permanent: true }];
  },
};

export default nextConfig;
