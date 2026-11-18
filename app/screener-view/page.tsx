import type { Metadata } from "next";
import { hasFilters, isOpeningView, parseView } from "@/lib/screener/filters";
import { matchingScreen } from "@/lib/screener/screens";
import { ScreenerHome } from "@/components/screener/ScreenerHome";
import { ScreenerResults } from "@/components/screener/ScreenerResults";

// /screener with anything after "?": filters, a sort or "edit", that
// screen's results (lib/screener/filters.ts reads the link), rendered per
// request. proxy.ts sends those links here; the address bar still says
// /screener. Without a "?", /screener is the cached page in
// app/screener/page.tsx. Not meant to be visited at this address, which
// robots.txt keeps crawlers out of. Phase eleven, Stage C; split out
// November 2026 (docs/cpu-budget/cpu-budget-recap.md).

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TITLE = "Screener: find companies by what they report";
const DESCRIPTION =
  "Filter about 4,600 U.S.-listed companies by what they report to the SEC: growth, margins, return on capital, free cash flow, net cash, dividends and more. Free, no account needed.";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const view = parseView(await searchParams);
  if (isOpeningView(view)) {
    return {
      title: TITLE,
      description: DESCRIPTION,
      alternates: { canonical: "/screener" },
      openGraph: { url: "/screener", title: TITLE, description: DESCRIPTION },
    };
  }
  // Any other combination in the link is one person's screen: not indexed,
  // pointing search engines at the screener itself.
  const name = hasFilters(view.filters) ? (matchingScreen(view.filters)?.title ?? "Your screen") : "All companies";
  return {
    title: `${name} — Screener`,
    description: DESCRIPTION,
    robots: { index: false, follow: true },
    alternates: { canonical: "/screener" },
    openGraph: { url: "/screener", title: TITLE, description: DESCRIPTION },
  };
}

export default async function ScreenerPage({ searchParams }: Props) {
  const view = parseView(await searchParams);
  if (isOpeningView(view)) return <ScreenerHome />;
  return <ScreenerResults view={view} screen={null} />;
}
