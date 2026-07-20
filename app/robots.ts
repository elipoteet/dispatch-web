import type { MetadataRoute } from "next";

const SITE_URL = "https://www.dispatchresearch.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/portfolio", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
