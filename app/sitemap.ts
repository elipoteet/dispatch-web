import type { MetadataRoute } from "next";

const SITE_URL = "https://www.dispatchresearch.com";

// Same set as the "Examples" chips on the research desk — a handful of seed
// pages for crawlers to start from. Not every ticker (there's no bounded
// list), but internal links from these pages let organic crawling take it
// from here.
const FEATURED_TICKERS = ["AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "AMZN", "META", "SPY"];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // '/' used to be the ticker-search homepage (priority 1) but is now
    // the phase-one social feed, which ships noindex on purpose — see
    // docs/phase-one.md. TODO: once indexing is switched on for the new
    // social surface, add '/' back here (it's the feed's home, not this
    // old ticker-search content, so don't just paste the old line back
    // unchanged).
    { url: `${SITE_URL}/research`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/leaderboard`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/give`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    ...FEATURED_TICKERS.map((t) => ({
      url: `${SITE_URL}/research/${t.toLowerCase()}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
