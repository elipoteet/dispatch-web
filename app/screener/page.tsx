import type { Metadata } from "next";
import { ScreenerHome } from "@/components/screener/ScreenerHome";

// /screener: the starting screens. Phase eleven, Stage C
// (docs/phase-eleven/phase-eleven.md).
//
// Cached: built once and served from Vercel's cache, refreshed right after the
// nightly job publishes (lib/screener/revalidate.ts) and every six hours in
// case that refresh is missed. A link with anything after "?" (filters, a sort,
// "edit") is one person's screen: proxy.ts sends it to app/screener-view,
// which renders it per request. Cached because the Hobby plan allows 4 hours of
// Active CPU a month, and rendering this page on every visit spent it
// (November 2026, docs/cpu-budget/cpu-budget-recap.md).
export const revalidate = 21600;

const TITLE = "Screener: find companies by what they report";
const DESCRIPTION =
  "Filter about 4,600 U.S.-listed companies by what they report to the SEC: growth, margins, return on capital, free cash flow, net cash, dividends and more. Free, no account needed.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/screener" },
  openGraph: { url: "/screener", title: TITLE, description: DESCRIPTION },
};

export default function ScreenerPage() {
  return <ScreenerHome />;
}
