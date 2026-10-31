import type { MetadataRoute } from "next";
import { HOME_EXAMPLES } from "@/lib/research/home";

const SITE_URL = "https://www.dispatchresearch.com";

// A handful of seed pages for crawlers to start from: the home page's example
// companies, each with its Overview and Financials tab. Not every company
// (there are thousands), but links between files let crawling take it from
// here.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/research`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/portfolio`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/give`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    ...HOME_EXAMPLES.flatMap((t) => [
      { url: `${SITE_URL}/research/${t.toLowerCase()}`, changeFrequency: "daily" as const, priority: 0.8 },
      { url: `${SITE_URL}/research/${t.toLowerCase()}/financials`, changeFrequency: "weekly" as const, priority: 0.7 },
    ]),
  ];
}
