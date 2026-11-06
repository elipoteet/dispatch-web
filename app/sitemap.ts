import type { MetadataRoute } from "next";
import { HOME_EXAMPLES } from "@/lib/research/home";
import { STARTING_SCREENS } from "@/lib/screener/screens";

const SITE_URL = "https://www.dispatchresearch.com";

// A handful of seed pages for crawlers to start from: the home page's example
// companies, each with every tab of its file. Not every company (there are
// thousands), but links between files let crawling take it from here.
const TABS: { path: string; changeFrequency: "daily" | "weekly"; priority: number }[] = [
  { path: "", changeFrequency: "daily", priority: 0.8 },
  { path: "/financials", changeFrequency: "weekly", priority: 0.7 },
  { path: "/valuation", changeFrequency: "daily", priority: 0.7 },
  { path: "/earnings", changeFrequency: "weekly", priority: 0.7 },
  { path: "/insiders", changeFrequency: "weekly", priority: 0.6 },
  { path: "/filings", changeFrequency: "weekly", priority: 0.6 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/research`, changeFrequency: "weekly", priority: 0.9 },
    // The screener and each starting screen; a person's own screen (filters
    // in the link) is noindex and stays out.
    { url: `${SITE_URL}/screener`, changeFrequency: "daily", priority: 0.9 },
    ...STARTING_SCREENS.map((s) => ({ url: `${SITE_URL}/screener/${s.slug}`, changeFrequency: "daily" as const, priority: 0.7 })),
    { url: `${SITE_URL}/give`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    ...HOME_EXAMPLES.flatMap((t) =>
      TABS.map((tab) => ({ url: `${SITE_URL}/research/${t.toLowerCase()}${tab.path}`, changeFrequency: tab.changeFrequency, priority: tab.priority })),
    ),
  ];
}
