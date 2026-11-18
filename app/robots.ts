import type { MetadataRoute } from "next";

const SITE_URL = "https://www.dispatchresearch.com";

// Crawlers that train AI models on what they collect. They read every page
// and send no readers, and every page they read is rendered at the site's
// cost (the Hobby plan's 4 hours of Active CPU a month; the account was paused
// on 17 November 2026). Search engines and AI assistants that fetch a page
// for a person are not on this list. The same bots can also be turned away in
// Vercel's Firewall (Bot Management, AI Crawlers: Deny), which catches the
// ones that ignore this file.
const AI_TRAINING_CRAWLERS = [
  "GPTBot",
  "CCBot",
  "ClaudeBot",
  "anthropic-ai",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "FacebookBot",
  "cohere-ai",
  "Diffbot",
  "Omgilibot",
  "ImagesiftBot",
  "Timpibot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          // One person's screen: every combination of filters, sorts and
          // "show more" in a link is its own address, so a crawler following
          // them never runs out. Each is noindex already; the starting screens
          // themselves (no "?") stay open.
          "/screener?",
          "/screener/*?",
          "/screener-view",
          // Old Time Machine links and other query strings on a research file;
          // the file itself is the same page without them.
          "/research/*?",
        ],
      },
      { userAgent: AI_TRAINING_CRAWLERS, disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
